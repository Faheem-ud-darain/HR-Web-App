'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { hrActions } from '@/lib/hrData';
import { clearSession } from '@/lib/session';
import { logoutPush } from '@/lib/push';
import { setThemePreference, originOf, useResolvedTheme } from '@/lib/theme';
import { triggerHaptic } from '@/lib/haptics';
import { signOutSafely } from '@/lib/signOut';

// What the account menus do: open the profile page, sign out, flip light and dark. Shared by the avatar menu in the
// top bar (tablet and desktop) and the phone menu, so the two can never drift apart.
export function useAccountActions({ role, email }: { role: string | null; email: string | null }) {
  const router = useRouter();
  const dark = useResolvedTheme() === 'dark';
  const signingOut = useRef(false);

  return {
    dark,
    roleLabel: role === 'hr' ? 'HR' : (role || '').replace('_', ' '),
    goToProfile: () => router.push(`${role === 'admin' ? '/admin' : role === 'hr' ? '/hr' : '/employee'}/profile`),
    toggleTheme: (origin: HTMLElement) => { triggerHaptic.light(); setThemePreference(dark ? 'light' : 'dark', originOf(origin)); },
    signOut: async () => {
      if (signingOut.current) return; // a second tap while the first is still finishing
      signingOut.current = true;
      // This app authenticates against hr_profiles directly (see auth/page.tsx), not PocketBase's auth collection, so there is no
      // pb.authStore session to clear: just drop the local session markers. The server-side cleanup runs first but can never block it.
      await signOutSafely({
        cleanup: [
          () => hrActions.performLogout(email || '', role),
          // Unlink this device's push subscription from the outgoing user, so on a shared device the next person does not inherit it.
          () => logoutPush(),
        ],
        clear: clearSession,
        leave: () => router.push('/auth'),
      });
    },
  };
}
