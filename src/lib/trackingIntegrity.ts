import { pbAdminFetch } from '@/lib/pbAdmin';
import { buildIntegrityReport, type IntegrityFinding } from '@/lib/core/trackingSettings';
import { diagnoseTracker, withDataFindings, type TrackerDiagnosis } from '@/lib/core/trackerDiagnosis';
import { latestVersionIfBehind, needsTrackerUpdate } from '@/lib/trackerSetup';
import type { TrackerHeartbeat } from '@/lib/hr/types';
import type { PbRow } from '@/lib/pbTypes';

// Reads what the tracking health checks need and runs them. Shared by the on-demand report
// (/api/admin/tracking-integrity) and the scheduled alert (/api/cron/tracking-integrity), so both always agree.
// Throws if any read fails: a half-read check must never look like "everything is fine".
export async function loadTrackingHealth(): Promise<{ findings: IntegrityFinding[]; diagnoses: TrackerDiagnosis[] }> {
  const [profiles, settings, shifts, signals] = await Promise.all([
    pbAdminFetch('/api/collections/hr_profiles/records?perPage=500&fields=email,role,region,tracking_enabled'),
    pbAdminFetch('/api/collections/hr_tracking_settings/records?perPage=500&fields=employeeEmail,enabled,intervalMinutes,agentToken'),
    pbAdminFetch(`/api/collections/hr_timesheets/records?perPage=200&fields=employee_id,clock_in&filter=${encodeURIComponent('clock_out = ""')}`),
    pbAdminFetch('/api/collections/hr_tracker_signals/records?perPage=500&fields=email,heartbeat'),
  ]);
  const heartbeats: Record<string, TrackerHeartbeat> = {};
  for (const r of (signals?.items || []) as PbRow[]) if (r.heartbeat?.lastSeenAt) heartbeats[String(r.email || '').toLowerCase()] = r.heartbeat;
  const profileRows = ((profiles?.items || []) as PbRow[]).map(p => ({ email: String(p.email), role: String(p.role), region: p.region, trackingEnabled: !!p.tracking_enabled }));
  const settingRows = ((settings?.items || []) as PbRow[]).map(s => ({ employeeEmail: String(s.employeeEmail), enabled: !!s.enabled, intervalMinutes: Number(s.intervalMinutes) || 15, agentToken: s.agentToken as string | undefined }));
  const openShifts = ((shifts?.items || []) as PbRow[]).map(t => ({ employeeEmail: String(t.employee_id), clockIn: String(t.clock_in) }));

  const findings = buildIntegrityReport({ profiles: profileRows, settings: settingRows, openShifts, heartbeats });
  const settingsBy = new Map(settingRows.map(s => [s.employeeEmail.toLowerCase(), s]));
  const shiftBy = new Map(openShifts.map(s => [s.employeeEmail.toLowerCase(), s]));
  const diagnoses = withDataFindings(profileRows
    .filter(p => p.role === 'employee' || p.role === 'team_lead')
    .map(p => {
      const email = p.email.toLowerCase();
      const hb = heartbeats[email] || null;
      return diagnoseTracker({
        email, settings: settingsBy.get(email) || null, heartbeat: hb, openShift: shiftBy.get(email) || null,
        updateRequired: needsTrackerUpdate(hb?.agentVersion, hb?.deviceLabel),
        updateAvailable: latestVersionIfBehind(hb?.agentVersion, hb?.deviceLabel),
      });
    }), findings);
  return { findings, diagnoses };
}
