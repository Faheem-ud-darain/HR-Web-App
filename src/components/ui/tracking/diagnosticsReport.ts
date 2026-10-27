import { displayName, type Profile, type TrackerDiagnostics } from '@/lib/hrData';
import { formatDateTimeNY } from '@/lib/timezone';

// Plain-text version of a live tracker diagnostics result: the same data the panel shows, as labelled lines, so
// it pastes cleanly into a ticket, a chat message or an AI assistant (no markdown or HTML on purpose).
export function formatDiagnosticsReport(emp: Profile, diag: TrackerDiagnostics, role: 'admin' | 'hr'): string {
  const line = (label: string, value: string) => `${label}: ${value}`;
  return [
    'DelCargo Tracker Diagnostics Report',
    line('Employee', `${displayName(emp, role)} <${diag.employeeEmail}>`),
    line('Device', `${diag.deviceLabel || 'Unknown device'} — ${diag.platform} — Tracker v${diag.appVersion}`),
    line('Responded at', `${formatDateTimeNY(diag.respondedAt)} (${diag.respondedAt})`),
    '',
    line('Connection', diag.connectionStatus || (diag.connected ? 'connected' : 'disconnected')),
    line('Tracking (HR toggle)', diag.enabledByHr ? 'enabled' : 'disabled'),
    line('Shift active', diag.shiftActive ? 'yes' : 'no'),
    line('Currently capturing', diag.enabled ? 'yes' : 'no'),
    line('Screen locked', diag.isLocked ? 'yes' : 'no'),
    line('Capture interval', `${diag.intervalMinutes ?? '—'} min`),
    line('Consecutive capture failures', String(diag.consecutiveCaptureFailures ?? 0)),
    line('Last capture', diag.lastCaptureAt ? `${formatDateTimeNY(diag.lastCaptureAt)} (${diag.lastCaptureAt})` : 'never'),
    line('Last error', diag.lastError || 'none'),
    line('Update available', diag.updateAvailableVersion ? `v${diag.updateAvailableVersion}` : 'no'),
    ...(diag.logTail ? ['', 'Recent tracker log:', diag.logTail.trimEnd()] : []),
  ].join('\n');
}
