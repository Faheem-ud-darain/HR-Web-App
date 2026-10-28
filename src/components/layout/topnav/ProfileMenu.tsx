'use client';

import React from 'react';
import { LogOut, UserCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { hrActions } from '@/lib/hrData';
import { clearSession } from '@/lib/session';
import { logoutPush } from '@/lib/push';
import { Avatar } from '@/components/ui/Avatar';
import { DismissibleArea } from '@/components/ui/DismissibleArea';

interface ProfileMenuProps { name: string; picture: string | null; email: string | null; role: string | null; open: boolean; onOpenChange: (open: boolean) => void }

// The avatar button with its small menu: View Profile and Sign Out.
export function ProfileMenu({ name, picture, email, role, open, onOpenChange }: ProfileMenuProps) {
  const router = useRouter();

  const goToProfile = () => {
    onOpenChange(false);
    router.push(`${role === 'admin' ? '/admin' : role === 'hr' ? '/hr' : '/employee'}/profile`);
  };

  const signOut = async () => {
    // This app authenticates against hr_profiles directly (see auth/page.tsx), not PocketBase's auth collection,
    // so there is no pb.authStore session to clear: just drop the local session markers.
    await hrActions.performLogout(email || '', role);
    // Unlink this device's push subscription from the outgoing user first, so on a shared device the next person
    // does not inherit the previous employee's push targeting.
    await logoutPush();
    clearSession();
    router.push('/auth');
  };

  return (
    <DismissibleArea open={open} onClose={() => onOpenChange(false)} className="relative">
      <button onClick={() => onOpenChange(!open)} aria-label="Account menu" className="hover:opacity-80 transition-opacity rounded-full">
        <Avatar src={picture} name={name || 'User'} size={36} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-[min(220px,85vw)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden popover-enter">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/50">
            <p className="font-bold text-slate-900 text-sm truncate">{name}</p>
            <p className="text-[10px] text-slate-500 truncate">{email}</p>
            <span className="inline-block mt-1 text-[9px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">{role}</span>
          </div>
          <div className="py-1.5">
            <button onClick={goToProfile} className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]">
              <UserCircle className="h-4 w-4 text-slate-400" /> View Profile
            </button>
            <button onClick={signOut} className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors border-t border-slate-100 min-h-[44px]">
              <LogOut className="h-4 w-4 text-rose-500" /> Sign Out
            </button>
          </div>
        </div>
      )}
    </DismissibleArea>
  );
}
