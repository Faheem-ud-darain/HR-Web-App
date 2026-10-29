'use client';

import { useRouter } from 'next/navigation';
import { hrActions } from '@/lib/hrData';
import { clearSession } from '@/lib/session';
import { logoutPush } from '@/lib/push';
import { setThemePreference, originOf, useResolvedTheme } from '@/lib/theme';
import { triggerHaptic } from '@/lib/haptics';

// What the account menus do: open the profile page, sign out, flip light and dark. Shared by the avatar menu in the
// top bar (tablet and desktop) and the phone menu, so the two can never drift apart.
export function useAccountActions({ role, email }: { role: string | null; email: string | null }) {
  const router = useRouter();
  const dark = useResolvedTheme() === 'dark';

  return {
    dark,
    roleLabel: role === 'hr' ? 'HR' : (role || '').replace('_', ' '),
    goToProfile: () => router.push(`${role === 'admin' ? '/admin' : role === 'hr' ? '/hr' : '/employee'}/profile`),
    toggleTheme: (origin: HTMLElement) => { triggerHaptic.light(); setThemePreference(dark ? 'light' : 'dark', originOf(origin)); },
    signOut: async () => {
      // This app authenticates against hr_profiles directly (see auth/page.tsx), not PocketBase's auth collection,
      // so there is no pb.authStore session to clear: just drop the local session markers.
      await hrActions.performLogout(email || '', role);
      // Unlink this device's push subscription from the outgoing user first, so on a shared device the next person
      // does not inherit the previous employee's push targeting.
      await logoutPush();
      clearSession();
      router.push('/auth');
    },
  };
}
