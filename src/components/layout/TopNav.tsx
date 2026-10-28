'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useProfiles } from '@/lib/hrData';
import { useSessionEmail, useSessionRole } from '@/lib/useSession';
import { ThemeIconButton } from '@/components/ui/ThemeToggle';
import { NotificationBell } from './topnav/NotificationBell';
import { ProfileMenu } from './topnav/ProfileMenu';
import { DesktopSearch, MobileSearchButton, MobileSearchSheet } from './topnav/GlobalSearchUi';
import { useGlobalSearch } from './topnav/useGlobalSearch';

// The sticky top bar: global search, theme toggle, notification bell and the account menu. The search rules live in
// lib/core/globalSearch; the pieces are in ./topnav.
export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const role = useSessionRole();
  const email = useSessionEmail();
  const isChatScreen = pathname?.endsWith('/chat') || pathname?.endsWith('/team-chats');
  // Only one of the bell and the account menu is open at a time.
  const [menu, setMenu] = useState<'bell' | 'profile' | null>(null);

  const { data: profiles } = useProfiles();
  // This person's own profile: the name and photo shown here, and its id for scoping payroll in the search.
  const me = useMemo(() => profiles?.find(p => p.email && email && p.email.toLowerCase() === email.toLowerCase()), [profiles, email]);
  const name = me?.fullName ?? (email?.split('@')[0] || '');
  const search = useGlobalSearch({ role, email, profiles, me, displayName: name });

  const setBell = React.useCallback((open: boolean) => setMenu(open ? 'bell' : null), []);
  const setProfile = React.useCallback((open: boolean) => setMenu(open ? 'profile' : null), []);

  return (
    <>
      {/* min-h + pt-safe, not a fixed height: on notched / Dynamic-Island iPhones the WebView draws under the status
          bar (viewportFit 'cover' in layout.tsx), so the safe-area padding (a no-op on desktop) keeps the content
          below it. The bar is translucent glass, so a soft after: fade replaces a hard border line. */}
      <header className="relative min-h-14 md:min-h-16 bg-white/85 backdrop-blur-md flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 gap-3 pt-safe after:content-[''] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-3 after:bg-gradient-to-b after:from-slate-950/[0.06] after:to-transparent">
        <DesktopSearch s={search} />

        {/* Phones: the app name, or a Back button on inner pages */}
        <div className="md:hidden font-bold text-base text-orange-600 tracking-tight flex items-center gap-2">
          {!['/admin', '/hr', '/employee'].includes(pathname) ? (
            <button onClick={() => router.back()} className="flex items-center gap-1 text-slate-700 hover:text-orange-600 transition-colors py-1 pr-2 active:scale-95">
              <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} aria-hidden="true" />
              <span className="text-xs font-bold">Back</span>
            </button>
          ) : 'DelCargo HR'}
        </div>

        <div className="flex items-center gap-1.5 md:gap-3">
          {!isChatScreen && <MobileSearchButton s={search} />}
          <ThemeIconButton />
          <NotificationBell role={role} email={email} open={menu === 'bell'} onOpenChange={setBell} />
          <ProfileMenu name={name} picture={me?.profilePicture || null} email={email} role={role} open={menu === 'profile'} onOpenChange={setProfile} />
        </div>
      </header>

      <MobileSearchSheet s={search} />
    </>
  );
}
