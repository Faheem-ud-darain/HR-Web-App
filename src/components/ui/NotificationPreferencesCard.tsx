'use client';

import { useEffect, useState } from 'react';
import { Card } from './Card';
import { hrActions, NotificationPrefs } from '@/lib/hrData';
import { Bell, Megaphone, HelpCircle, AtSign, CalendarClock } from 'lucide-react';

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
];

export function NotificationPreferencesCard({ email }: { email: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!email) return;
    hrActions.getNotificationPrefs(email).then(setPrefs);
  }, [email]);

  const toggle = async (key: keyof NotificationPrefs) => {
    if (!prefs || savingKey) return;
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
      <div className="divide-y divide-slate-100">
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
                disabled={!prefs || savingKey === key}
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
