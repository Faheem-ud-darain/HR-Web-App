'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { XIcon as X, UserCircleIcon as UserCircle, SunIcon as Sun, MoonIcon as Moon, SignOutIcon as SignOut } from '@phosphor-icons/react/dist/ssr';
import { Avatar } from '@/components/ui/Avatar';
import { compactName } from '@/lib/core/names';
import { useAccountActions } from '../topnav/useAccountActions';
import { IconButton } from '@/components/ui/IconButton';
import { pushModal, popModal } from '@/lib/modalStack';
import { useDialogFocus } from '@/lib/useDialogFocus';
import { isNavActive, navDotKey, type DotKey, type NavGroup, type NavItem, type NavRole } from '@/lib/core/nav';
import { ActivityDot, NavGlyph } from './NavLink';

interface MobileMenuProps {
  role: NavRole;
  pathname: string;
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  policy: NavItem;
  dots: Record<DotKey, boolean>;
  /** The signed-in person, for the account actions at the bottom of the menu. */
  account: { name: string; picture: string | null; email: string | null };
}

// The phone's menu: opened from the button in the top bar, it slides in from the right (the side the button is on) over the page with the same
// grouped pages as the desktop sidebar. Closes on a tap outside, on Escape, and on choosing a page.
export function MobileMenu({ role, pathname, open, onClose, groups, policy, dots, account }: MobileMenuProps) {
  const { dark, roleLabel, goToProfile, toggleTheme, signOut } = useAccountActions({ role, email: account.email });
  const panelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useDialogFocus(panelRef, open);

  // Registers as an open dialog (see modalStack.ts) and closes on Escape.
  useEffect(() => {
    if (!open) return;
    pushModal();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { popModal(); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const row = 'w-full flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors';
  const link = (item: NavItem) => {
    const active = isNavActive(pathname, item.href, role);
    const dotKey = navDotKey(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 px-3 min-h-11 rounded-xl text-sm font-semibold transition-colors ${active ? 'bg-orange-50 text-orange-700' : 'text-slate-700 hover:bg-slate-50'}`}
      >
        <span className="relative shrink-0">
          <NavGlyph icon={item.icon} active={active} className={`h-5 w-5 ${active ? 'text-orange-600' : 'text-slate-500'}`} />
          {dotKey && dots[dotKey] && <ActivityDot className="-top-0.5 -right-0.5" />}
        </span>
        {item.name}
      </Link>
    );
  };

  const slide = { duration: reduce ? 0 : 0.28, ease: 'easeOut' as const };

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {open && (
          <div className="md:hidden fixed inset-0 z-[100]">
            <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={slide} onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
            <m.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              tabIndex={-1}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={slide}
              className="absolute right-0 inset-y-0 w-[min(20rem,86vw)] bg-white shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            >
              <div className="h-14 shrink-0 flex items-center justify-between gap-3 pl-5 pr-2 border-b border-slate-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={account.picture} name={account.name || 'User'} size={32} />
                  <div className="min-w-0 leading-tight">
                    <p className="text-sm font-bold text-slate-900 truncate" title={account.name}>{compactName(account.name)}</p>
                    <p className="text-caption font-semibold text-slate-500 capitalize">{roleLabel}</p>
                  </div>
                </div>
                <IconButton label="Close menu" onClick={onClose}><X className="h-5 w-5" /></IconButton>
              </div>
              <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                {groups.map(group => (
                  <div key={group.title ?? 'home'}>
                    {group.title && <p className="px-3 pb-1 text-caption font-bold uppercase tracking-wider text-slate-500">{group.title}</p>}
                    <div className="space-y-0.5">{group.items.map(link)}</div>
                  </div>
                ))}
              </nav>
              <div className="shrink-0 border-t border-slate-200 p-3 space-y-0.5">
                {link(policy)}
                <button type="button" onClick={() => { onClose(); goToProfile(); }} className={row}>
                  <UserCircle className="h-5 w-5 text-slate-500" aria-hidden="true" /> My profile
                </button>
                <button type="button" onClick={e => toggleTheme(e.currentTarget)} className={row}>
                  {dark ? <Sun className="h-5 w-5 text-slate-500" aria-hidden="true" /> : <Moon className="h-5 w-5 text-slate-500" aria-hidden="true" />} {dark ? 'Light mode' : 'Dark mode'}
                </button>
                <button type="button" onClick={() => { onClose(); void signOut(); }} className={`${row} text-rose-600 hover:bg-rose-50`}>
                  <SignOut className="h-5 w-5 text-rose-500" aria-hidden="true" /> Sign out
                </button>
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </LazyMotion>
  );
}
