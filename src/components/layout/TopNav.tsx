'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { CaretLeftIcon as ChevronLeft, ListIcon as Menu } from '@phosphor-icons/react/dist/ssr';
import { useProfiles } from '@/lib/hrData';
import { useSessionEmail, useSessionRole } from '@/lib/useSession';
import { pageTitle } from '@/lib/core/pageTitle';
import { setMobileNavOpen, useMobileNavDot } from '@/lib/mobileNav';
import { ThemeIconButton } from '@/components/ui/ThemeToggle';
import { IconButton } from '@/components/ui/IconButton';
import { NotificationBell } from './topnav/NotificationBell';
import { ProfileMenu } from './topnav/ProfileMenu';
import { SearchField, SearchIconButton, SearchDialog } from './topnav/GlobalSearchUi';
import { useGlobalSearch } from './topnav/useGlobalSearch';

// The sticky top bar. Three zones: where you are (the page name; a Back button on phones), search in the middle
// (tablet and desktop; a magnifier on phones), and your tools (theme, notifications, account). Search runs in a
// dialog, and the rules behind it live in lib/core/globalSearch; the pieces are in ./topnav.
export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const role = useSessionRole();
  const email = useSessionEmail();
  const title = pageTitle(pathname);
  const menuDot = useMobileNavDot();
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
          below it. A flat bar with no outline; on tablet and up the three zones sit on a grid so the
          search stays centred whatever the title length. */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md pt-safe">
        <div className="min-h-14 md:min-h-16 px-4 md:px-6 flex items-center justify-between gap-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] lg:grid-cols-[1fr_minmax(0,28rem)_1fr] md:gap-4">
          <div className="flex items-center gap-1 min-w-0">
            {title && (
              <IconButton label="Back" onClick={() => router.back()} className="-ml-2 text-slate-700 md:hidden">
                <ChevronLeft weight="bold" className="h-6 w-6" aria-hidden="true" />
              </IconButton>
            )}
            <span className="font-bold text-base md:text-lg tracking-tight truncate text-slate-900">
              {title || <><span className="md:hidden text-orange-600">DelCargo HR</span><span className="max-md:hidden">Overview</span></>}
            </span>
          </div>

          <div className="hidden md:block"><SearchField s={search} /></div>

          <div className="flex items-center justify-end gap-1 md:gap-2 shrink-0">
            {!isChatScreen && <SearchIconButton s={search} />}
            <ThemeIconButton className="max-md:hidden" />
            <NotificationBell role={role} email={email} open={menu === 'bell'} onOpenChange={setBell} />
            <span aria-hidden="true" className="hidden md:block h-6 w-px bg-slate-200 mx-1" />
            <ProfileMenu name={name} picture={me?.profilePicture || null} email={email} role={role} open={menu === 'profile'} onOpenChange={setProfile} />
            <IconButton label="Menu" dot={menuDot} onClick={() => setMobileNavOpen(true)} aria-haspopup="dialog" className="md:hidden text-slate-700">
              <Menu className="h-6 w-6" />
            </IconButton>
          </div>
        </div>
      </header>

      <SearchDialog s={search} />
    </>
  );
}
