import { adminFindProfileByEmail, adminUpdateProfile } from '@/lib/pbAdmin';

// Tracking is ONE switch: hr_tracking_settings.enabled (what the trackers and the shift check obey). hr_profiles.tracking_enabled is only
// a mirror of it, kept for the menu, older phone apps and the shift-closing hook. This is the one place that makes the mirror equal to the
// switch; the settings route uses it on every save, and the scheduled check uses it to repair any copy that has drifted.
// Returns whether the profile now matches. It never throws: false means no profile was found or the write failed (logged).
export async function syncProfileTrackingFlag(email: string, enabled: boolean): Promise<boolean> {
  try {
    const profile = await adminFindProfileByEmail(email);
    if (!profile) return false;
    if (!!profile.tracking_enabled !== enabled) await adminUpdateProfile(profile.id, { tracking_enabled: enabled });
    return true;
  } catch (err) {
    console.error('[trackingSync] could not update the profile tracking flag:', err);
    return false;
  }
}
