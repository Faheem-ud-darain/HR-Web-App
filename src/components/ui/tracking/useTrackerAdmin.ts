'use client';

import { useRef, useState } from 'react';
import { hrActions, type Profile, type TrackerDiagnostics, type TrackingSettings } from '@/lib/hrData';
import { encodeSetupCode, getPocketBaseConfig, POCKETBASE_URL } from '@/lib/trackerSetup';
import { formatDiagnosticsReport } from './diagnosticsReport';

interface TrackerAdminArgs {
  role: 'admin' | 'hr';
  settingsList: TrackingSettings[];
  refetchSettings: () => unknown;
  refetchHeartbeats: () => unknown;
  refetchTimesheets: () => unknown;
}

// Signal 6/7 round trip for remote diagnostics: poll for the agent's answer once a second for up to 10 seconds.
const DIAGNOSTICS_POLL_MS = 1000;
const DIAGNOSTICS_TIMEOUT_MS = 10000;

// Everything HR/Admin can do to an employee's tracker from the Screen Tracking page: per-employee settings, the
// Setup Agent dialog (setup code, remote diagnostics, remote fixes), and the stronger actions behind a
// confirmation (regenerate token, force-disconnect devices, force end shift, force disconnect setup code).
export function useTrackerAdmin({ role, settingsList, refetchSettings, refetchHeartbeats, refetchTimesheets }: TrackerAdminArgs) {
  const settingsFor = (email: string): TrackingSettings =>
    settingsList.find(s => s.employeeEmail.toLowerCase() === email.toLowerCase())
    || { employeeEmail: email, enabled: false, intervalMinutes: 15, excludeFromAutoDelete: false, agentToken: '' };

  // The server route also keeps hr_profiles.tracking_enabled in step, so nothing else is written here.
  const handleToggle = async (email: string, enabled: boolean) => {
    await hrActions.updateTrackingSettings(email, { enabled });
    refetchSettings();
  };

  const handleIntervalChange = async (email: string, minutes: number) => {
    // 1 minute is the enforced floor, matching the agent's own clamp (tracker-agent/agent_gui.py).
    if (!Number.isFinite(minutes) || minutes < 1) return;
    await hrActions.updateTrackingSettings(email, { intervalMinutes: minutes });
    refetchSettings();
  };

  const handleExcludeToggle = async (email: string, excludeFromAutoDelete: boolean) => {
    await hrActions.updateTrackingSettings(email, { excludeFromAutoDelete });
    refetchSettings();
  };

  // ── Setup Agent dialog ──
  const [setupEmp, setSetupEmp] = useState<Profile | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedDiagnostics, setCopiedDiagnostics] = useState(false);
  // 'idle' before the first request, 'waiting' while polling, 'timeout' when an older (pre-v19) or offline agent
  // never answers. The UI words that as "couldn't reach it", not "broken": a plain timeout is also the expected
  // result from any agent older than v19.
  const [diagnosticsStatus, setDiagnosticsStatus] = useState<'idle' | 'waiting' | 'ok' | 'timeout'>('idle');
  const [diagnosticsResult, setDiagnosticsResult] = useState<TrackerDiagnostics | null>(null);
  // Each request claims a fresh id; a poll from an earlier request (another employee, or a second click) only
  // applies its result while its own id is still current.
  const diagnosticsRequestIdRef = useRef(0);

  const handleOpenSetup = async (emp: Profile) => {
    setCopied(false);
    setDiagnosticsStatus('idle');
    setDiagnosticsResult(null);
    if (!settingsFor(emp.email).agentToken) {
      await hrActions.updateTrackingSettings(emp.email, {});
      await refetchSettings();
    }
    setSetupEmp(emp);
  };

  // Clear any stale answer first (so a leftover cannot be mistaken for this request), send the command, then poll.
  const handleRunDiagnostics = async (email: string) => {
    const requestId = ++diagnosticsRequestIdRef.current;
    setDiagnosticsStatus('waiting');
    setDiagnosticsResult(null);
    await hrActions.clearTrackerDiagnostics(email).catch(() => {});
    await hrActions.writeTrackerCommand(email, 'diagnostics');
    const startedAt = Date.now();
    const poll = async () => {
      if (diagnosticsRequestIdRef.current !== requestId) return; // superseded
      const result = await hrActions.getTrackerDiagnostics(email).catch(() => null);
      if (diagnosticsRequestIdRef.current !== requestId) return; // superseded while awaiting
      if (result) {
        setDiagnosticsResult(result);
        setDiagnosticsStatus('ok');
        return;
      }
      if (Date.now() - startedAt >= DIAGNOSTICS_TIMEOUT_MS) {
        setDiagnosticsStatus('timeout');
        return;
      }
      setTimeout(poll, DIAGNOSTICS_POLL_MS);
    };
    setTimeout(poll, DIAGNOSTICS_POLL_MS);
  };

  const handleReloadSettingsNow = async (email: string) => {
    await hrActions.writeTrackerCommand(email, 'reload_settings');
  };

  // Remote fixes (v25+ trackers; older builds ignore them). Restart relaunches the app without ending the shift.
  const handleTrackerAction = async (email: string, type: 'reconnect' | 'restart') => {
    await hrActions.writeTrackerCommand(email, type);
  };

  const flashCopied = (set: (value: boolean) => void) => {
    set(true);
    setTimeout(() => set(false), 2000);
  };
  const copyConfig = (settings: TrackingSettings) => {
    navigator.clipboard.writeText(`POCKETBASE_URL=${POCKETBASE_URL}\nAGENT_TOKEN=${settings.agentToken}`);
    flashCopied(setCopied);
  };
  const copySetupCode = (settings: TrackingSettings) => {
    navigator.clipboard.writeText(encodeSetupCode(getPocketBaseConfig().url, settings.agentToken));
    flashCopied(setCopied);
  };
  const copyDiagnosticsReport = (emp: Profile, diag: TrackerDiagnostics) => {
    navigator.clipboard.writeText(formatDiagnosticsReport(emp, diag, role));
    flashCopied(setCopiedDiagnostics);
  };

  // ── Actions behind a confirmation dialog ──
  const [pendingRegenerateTokenEmail, setPendingRegenerateTokenEmail] = useState<string | null>(null);
  const [regeneratingToken, setRegeneratingToken] = useState(false);
  const confirmRegenerateToken = async () => {
    if (!pendingRegenerateTokenEmail) return;
    const email = pendingRegenerateTokenEmail;
    setPendingRegenerateTokenEmail(null);
    setRegeneratingToken(true);
    try {
      await hrActions.regenerateAgentToken(email);
      refetchSettings();
    } finally {
      setRegeneratingToken(false);
    }
  };

  // The HR/Admin escape hatch for the "another device is active" stuck state employees can hit from their own
  // Tracker page. Unlike Regenerate Token it keeps the setup code, so a reconnect works at once.
  const [pendingForceDisconnectEmail, setPendingForceDisconnectEmail] = useState<string | null>(null);
  const [forceDisconnectingTracker, setForceDisconnectingTracker] = useState(false);
  const confirmForceDisconnect = async () => {
    if (!pendingForceDisconnectEmail) return;
    const email = pendingForceDisconnectEmail;
    setPendingForceDisconnectEmail(null);
    setForceDisconnectingTracker(true);
    try {
      await hrActions.forceDisconnectAllTrackers(email);
      refetchHeartbeats();
    } finally {
      setForceDisconnectingTracker(false);
    }
  };

  // Force End Shift: ends the employee's open timesheet exactly as their own "End Shift" would (clock_out, stops
  // the tracker, cleans up), so the next Start Shift runs the usual connection / stale-token checks.
  const [forceEndShiftEmp, setForceEndShiftEmp] = useState<Profile | null>(null);
  const [forceEndingShift, setForceEndingShift] = useState(false);
  const handleForceEndShift = async (emp: Profile) => {
    setForceEndingShift(true);
    try {
      await hrActions.clockOut(emp.email);
      await refetchTimesheets();
      await hrActions.addNotification(
        emp.email,
        'employee',
        'Your shift was ended by HR/Admin. Please reconnect your DelCargo Tracker (check the Tracker Setup page for a new setup code if prompted) before starting your next shift.',
      );
      setForceEndShiftEmp(null);
    } finally {
      setForceEndingShift(false);
    }
  };

  // Force Disconnect: Force End Shift only stops the CURRENT shift, so a tracker that is not actually stale could
  // simply start again. This regenerates the setup code, so the installed tracker holds a code that matches no
  // settings row; its next poll reports "Setup token not recognized" and the next Start Shift is blocked until
  // the employee pastes in the new code. That is what makes reconnecting mandatory.
  const [forceDisconnectEmp, setForceDisconnectEmp] = useState<Profile | null>(null);
  const [revokingSetupCode, setRevokingSetupCode] = useState(false);
  const handleForceDisconnectTracker = async (emp: Profile) => {
    setRevokingSetupCode(true);
    try {
      await hrActions.regenerateAgentToken(emp.email);
      await refetchSettings();
      await hrActions.addNotification(
        emp.email,
        'employee',
        'Your tracker setup code was reset by HR/Admin, so your desktop tracker can no longer connect. Open the Tracker Setup page, copy the new setup code, and paste it into the DelCargo Tracker app before you can start your next shift.',
      );
      setForceDisconnectEmp(null);
    } finally {
      setRevokingSetupCode(false);
    }
  };

  return {
    settingsFor, handleToggle, handleIntervalChange, handleExcludeToggle,
    setupEmp, setSetupEmp, copied, copiedDiagnostics, diagnosticsStatus, diagnosticsResult, diagnosticsRequestIdRef,
    handleOpenSetup, handleRunDiagnostics, handleReloadSettingsNow, handleTrackerAction,
    copyConfig, copySetupCode, copyDiagnosticsReport,
    pendingRegenerateTokenEmail, setPendingRegenerateTokenEmail, regeneratingToken, confirmRegenerateToken,
    handleRegenerateToken: setPendingRegenerateTokenEmail,
    pendingForceDisconnectEmail, setPendingForceDisconnectEmail, forceDisconnectingTracker, confirmForceDisconnect,
    handleForceDisconnect: setPendingForceDisconnectEmail,
    forceEndShiftEmp, setForceEndShiftEmp, forceEndingShift, handleForceEndShift,
    forceDisconnectEmp, setForceDisconnectEmp, revokingSetupCode, handleForceDisconnectTracker,
  };
}
