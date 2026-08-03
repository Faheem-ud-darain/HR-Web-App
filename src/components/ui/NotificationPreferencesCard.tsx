'use client';

import { useEffect, useState } from 'react';
import { Card } from './Card';
import { hrActions, NotificationPrefs } from '@/lib/hrData';
import { isPushEnabled, requestPushPermissionAgain, isPushConfigured } from '@/lib/push';
import { Bell, BellRing, BellOff, Megaphone, HelpCircle, AtSign, CalendarClock, Clock } from 'lucide-react';

// Shared across all 3 profile pages (employee/hr/admin) — see
// hrActions.getNotificationPrefs/updateNotificationPrefs in hrData.ts.
// These toggles only control real push notifications; the in-app bell
// (TopNav's notification dropdown) always shows every notification
// regardless of what's off here, same as before this feature existed.
const CATEGORY_META: { key: keyof NotificationPrefs; label: string; description: string; icon: typeof Bell }[] = [
  { key: 'announcement', label: 'Announcements', description: 'Company-wide or targeted announcements posted by HR/Admin.', icon: Megaphone },
  { key: 'ticket', label: 'Support tickets', description: 'Replies and status changes on your support tickets.', icon: HelpCircle },
  { key: 'chat_mention', label: 'Team Chat mentions', description: 'When someone @mentions you in a team channel.', icon: AtSign },
  { key: 'leave_task', label: 'Leave & tasks', description: 'Leave approvals/rejections and new task assignments.', icon: CalendarClock },
  // Only ever sent to HR/Admin (an employee starting/ending their own shift
  // notifies HR/Admin, not themselves) — shown here anyway since this card
  // is shared across all 3 roles' Profile pages, same as every other toggle.
  { key: 'shift', label: 'Shift start/end', description: 'When an employee starts, ends, or auto-ends a shift.', icon: Clock },
];

export function NotificationPreferencesCard({ email }: { email: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Master gate: the actual OS/browser-level permission, checked live (not
  // remembered) — same isPushEnabled() the login prompt uses. The category
  // toggles below are meaningless if this is off (there's no subscription
  // for OneSignal to deliver anything to), so they're locked until this is
  // granted, per how this card is meant to work now: master switch first,
  // per-category preferences only make sense once it's on.
  const [osPermission, setOsPermission] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(false);

  const refreshPermission = () => { isPushEnabled().then(setOsPermission); };

  useEffect(() => {
    if (!email) return;
    hrActions.getNotificationPrefs(email).then(setPrefs);
  }, [email]);

  useEffect(() => {
    if (!isPushConfigured()) { setOsPermission(true); return; } // nothing to gate on
    refreshPermission();
    // Re-check whenever the tab/app regains focus — catches a permission
    // that was revoked from the phone's own Settings while the app sat in
    // the background, not just the state at first mount.
    const handleVisible = () => { if (document.visibilityState === 'visible') refreshPermission(); };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, []);

  const handleEnable = async () => {
    setRequesting(true);
    try {
      await requestPushPermissionAgain();
    } finally {
      refreshPermission();
      setRequesting(false);
    }
  };

  const toggle = async (key: keyof NotificationPrefs) => {
    if (!prefs || savingKey || !osPermission) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic — flip back if the save fails
    setSavingKey(key);
    try {
      await hrActions.updateNotificationPrefs(email, next);
    } catch (err) {
      console.error('[NotificationPreferencesCard] Failed to save, reverting:', err);
      setPrefs(prefs);
    } finally {
      setSavingKey(null);
    }
  };

  const permissionGranted = osPermission === true;

  return (
    <Card className="border border-slate-200 p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-2 border-b border-slate-100">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <Bell className="h-4 w-4 text-slate-400" /> Push Notifications
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Choose which of these send a push notification to your phone/browser. The in-app bell above always shows everything regardless of these settings.
        </p>
      </div>

      {/* Master switch — the real OS/browser permission. This is what
          actually turns push on or off at the device level; the category
          toggles below only filter which categories use it once it's on. */}
      <div className={`px-4 md:px-6 py-3.5 flex items-center justify-between gap-3 ${osPermission === null ? '' : permissionGranted ? 'bg-emerald-50/50' : 'bg-amber-50/50'} border-b border-slate-100`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${permissionGranted ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            {permissionGranted ? <BellRing className="h-4 w-4 text-emerald-600" /> : <BellOff className="h-4 w-4 text-amber-600" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {osPermission === null
                ? 'Checking device permission…'
                : permissionGranted
                  ? 'Enabled for this device.'
                  : 'Off for this device — turn on to receive any push notifications and manage the categories below.'}
            </p>
          </div>
        </div>
        {osPermission !== null && !permissionGranted && (
          <button
            type="button"
            onClick={handleEnable}
            disabled={requesting}
            className="shrink-0 bg-orange-600 hover:bg-orange-700 disabled:opacity-70 text-white font-semibold px-3.5 py-2 rounded-lg text-xs active:scale-97 transition-colors transition-transform"
          >
            {requesting ? 'Requesting…' : 'Enable'}
          </button>
        )}
      </div>

      {!permissionGranted && osPermission !== null && (
        <p className="px-4 md:px-6 pt-3 text-[10px] text-slate-400 leading-relaxed">
          If tapping Enable doesn&apos;t prompt you, notifications were likely blocked before — open your phone/browser Settings for this app and turn notifications on there, then come back.
        </p>
      )}

      <div className={`divide-y divide-slate-100 ${!permissionGranted ? 'opacity-50 pointer-events-none select-none' : ''}`}>
        {CATEGORY_META.map(({ key, label, description, icon: Icon }) => {
          const checked = prefs ? prefs[key] : true;
          return (
            <div key={key} className="px-4 md:px-6 py-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                disabled={!prefs || savingKey === key || !permissionGranted}
                onClick={() => toggle(key)}
                className={`shrink-0 relative w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${checked ? 'bg-orange-600' : 'bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
