import { adminListScreenshotsPage, pbAdminFetch } from '@/lib/pbAdmin';
import { buildIntegrityReport, type IntegrityFinding } from '@/lib/core/trackingSettings';
import { diagnoseTracker, withDataFindings, type TrackerDiagnosis } from '@/lib/core/trackerDiagnosis';
import { latestVersionIfBehind, needsTrackerUpdate } from '@/lib/trackerSetup';
import type { TrackerHeartbeat } from '@/lib/hr/types';
import type { PbRow } from '@/lib/pbTypes';

const SCREENSHOT_LOOKUP_MAX_PAGES = 3;

/**
 * When each person's newest screenshot was taken. A tracker that is closed has no heartbeat, which looks the same as one that never
 * connected; a screenshot is the proof it did. Ask only about people with no heartbeat.
 * The lookup matches the email as a substring (a screenshot of "joann@x" can come back for "ann@x"), so a page is searched until it holds
 * an exact match instead of trusting the first row. A person whose lookup fails is left out (their state stays as it was): one failing
 * request must never take down the whole health check and the alerts that depend on it.
 */
export async function latestScreenshotByEmail(emails: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(emails.map(async email => {
    try {
      for (let page = 1; page <= SCREENSHOT_LOOKUP_MAX_PAGES; page++) {
        const found = await adminListScreenshotsPage({ employeeEmail: email }, page, 20); // already narrowed to the exact email
        if (found.items[0]?.captured_at) {
          out.set(email.toLowerCase(), String(found.items[0].captured_at).replace(' ', 'T')); // PocketBase dates use a space, which only some parsers accept
          return;
        }
        if (page >= found.totalPages) return;
      }
    } catch (error) {
      console.warn(`[tracking-health] screenshot lookup failed for one person: ${error instanceof Error ? error.message : error}`);
    }
  }));
  return out;
}

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
  const lastScreenshot = await latestScreenshotByEmail(settingRows.filter(s => s.enabled && !heartbeats[s.employeeEmail.toLowerCase()]).map(s => s.employeeEmail));
  const diagnoses = withDataFindings(profileRows
    .filter(p => p.role === 'employee' || p.role === 'team_lead')
    .map(p => {
      const email = p.email.toLowerCase();
      const hb = heartbeats[email] || null;
      return diagnoseTracker({
        email, settings: settingsBy.get(email) || null, heartbeat: hb, openShift: shiftBy.get(email) || null, lastScreenshotAt: lastScreenshot.get(email) ?? null,
        updateRequired: needsTrackerUpdate(hb?.agentVersion, hb?.deviceLabel),
        updateAvailable: latestVersionIfBehind(hb?.agentVersion, hb?.deviceLabel),
      });
    }), findings);
  return { findings, diagnoses };
}
