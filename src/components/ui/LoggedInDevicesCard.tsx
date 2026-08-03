'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from './Card';
import { hrActions, UserSessionSlot } from '@/lib/hrData';
import { getOrCreateDeviceId, clearSession, getSessionRole } from '@/lib/session';
import { formatDateTimeNY } from '@/lib/timezone';
import { Laptop, LogOut, Loader2 } from 'lucide-react';

// Employee-facing (and Team Lead, who shares the Employee dashboard) view
// of their own claimed device slots — see UserSessionSlot/
// claimUserSessionSlot/removeUserSessionDevice in hrData.ts for the
// underlying 2-device-cap system. Not shown to HR/Admin, who are exempt
// from the device limit entirely and never claim a slot in the first place.
//
// Logging out another device from here just removes its slot — that
// device's own 30s heartbeat (see the multi-device effect in
// (dashboard)/layout.tsx) then notices its slot is gone and force-logs
// itself out, same mechanism as a "log out everywhere" forced login.
export function LoggedInDevicesCard({ email }: { email: string }) {
  const router = useRouter();
  const [sessions, setSessions] = useState<UserSessionSlot[] | null>(null);
  const [myDeviceId, setMyDeviceId] = useState<string>('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    const [all, deviceId] = await Promise.all([hrActions.getUserSessions(email), getOrCreateDeviceId()]);
    setSessions(all.filter(s => hrActions.isSessionSlotLive(s)).sort((a, b) => (a.deviceId === deviceId ? -1 : b.deviceId === deviceId ? 1 : 0)));
    setMyDeviceId(deviceId);
  };

  useEffect(() => { if (email) load(); }, [email]);

  const handleLogOut = async (deviceId: string) => {
    if (removingId) return;
    setRemovingId(deviceId);
    try {
      if (deviceId === myDeviceId) {
        // Logging THIS device out from here should behave exactly like the
        // normal Sidebar/TopNav "Log Out" button — including auto-ending an
        // open shift — not just silently free the slot and leave the
        // employee staring at a stale dashboard for up to 30s until the
        // periodic heartbeat effect in (dashboard)/layout.tsx notices and
        // force-logs them out on its own.
        await hrActions.performLogout(email, getSessionRole());
        clearSession();
        router.push('/auth');
        return;
      }
      await hrActions.removeUserSessionDevice(email, deviceId);
      await load();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Card className="border border-slate-200 p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-2 border-b border-slate-100">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <Laptop className="h-4 w-4 text-slate-400" /> Logged-in Devices
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Your account can be signed in on up to 2 devices at once. Log out a device here to free it up for a new one.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {sessions === null ? (
          <div className="px-6 py-6 text-center text-xs font-semibold text-slate-400">Loading…</div>
        ) : sessions.length === 0 ? (
          <div className="px-6 py-6 text-center text-xs font-semibold text-slate-400">No active devices found.</div>
        ) : (
          sessions.map(s => {
            const isThisDevice = s.deviceId === myDeviceId;
            return (
              <div key={s.deviceId} className="flex items-center gap-4 px-6 py-4">
                <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Laptop className="h-4 w-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                    {s.deviceLabel || 'Unknown device'}
                    {isThisDevice && (
                      <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full flex-shrink-0">This device</span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    Last active {formatDateTimeNY(s.lastSeenAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleLogOut(s.deviceId)}
                  disabled={removingId === s.deviceId}
                  className="flex-shrink-0 flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {removingId === s.deviceId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  {isThisDevice ? 'Log Out' : 'Log Out This Device'}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
