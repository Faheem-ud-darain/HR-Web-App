'use client';

import React from 'react';
import { CaretDownIcon as ChevronDown, SignOutIcon as LogOut, MoonIcon as Moon, SunIcon as Sun, UserCircleIcon as UserCircle } from '@phosphor-icons/react/dist/ssr';
import { useRouter } from 'next/navigation';
import { hrActions } from '@/lib/hrData';
import { clearSession } from '@/lib/session';
import { originOf, setThemePreference, useResolvedTheme } from '@/lib/theme';
import { triggerHaptic } from '@/lib/haptics';
import { compactName } from '@/lib/core/names';
import { logoutPush } from '@/lib/push';
import { Avatar } from '@/components/ui/Avatar';
import { DismissibleArea } from '@/components/ui/DismissibleArea';

interface ProfileMenuProps { name: string; picture: string | null; email: string | null; role: string | null; open: boolean; onOpenChange: (open: boolean) => void }

// The avatar button with its small menu: View Profile and Sign Out.
export function ProfileMenu({ name, picture, email, role, open, onOpenChange }: ProfileMenuProps) {
  const router = useRouter();
  const dark = useResolvedTheme() === 'dark';
  const roleLabel = role === 'hr' ? 'HR' : (role || '').replace('_', ' ');

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
      <button onClick={() => onOpenChange(!open)} aria-label="Account menu" aria-haspopup="true" aria-expanded={open} className="h-10 flex items-center gap-2.5 rounded-full lg:rounded-xl lg:pl-1.5 lg:pr-2.5 hover:bg-slate-100 transition-colors">
        <Avatar src={picture} name={name || 'User'} size={36} />
        <span className="hidden lg:block text-left leading-tight max-w-[10rem]">
          <span className="block text-sm font-bold text-slate-900 truncate" title={name}>{compactName(name)}</span>
          <span className="block text-[11px] font-semibold text-slate-500 capitalize">{roleLabel}</span>
        </span>
        <ChevronDown className="hidden lg:block h-4 w-4 text-slate-500" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-[min(220px,85vw)] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden popover-enter">
          <div className="p-3.5 border-b border-slate-100 bg-slate-50/50">
            <p className="font-bold text-slate-900 text-sm truncate">{name}</p>
            <p className="text-[11px] text-slate-500 truncate">{email}</p>
            <span className="inline-block mt-1 text-[11px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-100 px-1.5 py-0.5 rounded">{role}</span>
          </div>
          <div className="py-1.5">
            <button onClick={goToProfile} className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]">
              <UserCircle className="h-4 w-4 text-slate-500" /> View Profile
            </button>
            {/* On phones the top bar has no theme button, so it lives here. */}
            <button
              onClick={e => { triggerHaptic.light(); setThemePreference(dark ? 'light' : 'dark', originOf(e.currentTarget)); }}
              className="md:hidden w-full flex items-center gap-2.5 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]"
            >
              {dark ? <Sun className="h-4 w-4 text-slate-500" /> : <Moon className="h-4 w-4 text-slate-500" />} {dark ? 'Light mode' : 'Dark mode'}
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
