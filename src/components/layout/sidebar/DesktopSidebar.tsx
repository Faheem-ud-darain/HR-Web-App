'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { PushPinIcon as Pin, PushPinSlashIcon as PinOff } from '@phosphor-icons/react/dist/ssr';
import { DismissibleArea } from '@/components/ui/DismissibleArea';
import { isNavActive, navDotKey, type DotKey, type NavGroup, type NavItem, type NavRole } from '@/lib/core/nav';
import { ActivityDot, NavGlyph } from './NavLink';

const RAIL = 68;
const WIDE = 256;

interface DesktopSidebarProps {
  role: NavRole;
  pathname: string;
  groups: NavGroup[];
  policy: NavItem;
  dots: Record<DotKey, boolean>;
  /** Kept open (and the page pushed aside) instead of opening on hover. Only applies on desktop widths. */
  pinned: boolean;
  onTogglePinned: () => void;
}

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia('(min-width: 1024px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const isWide = () => window.matchMedia('(min-width: 1024px)').matches;

// The side menu for tablets and desktops: a slim icon rail that opens when you point at it, tab to it, or (on a touch
// screen) tap the logo. On a desktop it moves the page over; on a tablet it opens over the page. "Pin" keeps it open. Icons never move while it
// opens: only the panel widens and the labels fade in, so it feels like one surface unfolding.
export function DesktopSidebar({ role, pathname, groups, policy, dots, pinned, onTogglePinned }: DesktopSidebarProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tapOpen, setTapOpen] = useState(false);
  const reduce = useReducedMotion();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => true);
  const isPinned = pinned && wide;
  const expanded = isPinned || hover || focus || tapOpen;
  // On a desktop the open menu moves the page over; on a tablet there is no room to spare, so it opens over the page.
  const pushes = wide && expanded;
  const move = { duration: reduce ? 0 : 0.2, ease: 'easeOut' as const };

  // A tap-opened menu folds away after you go to a page.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) { setLastPath(pathname); setTapOpen(false); }

  const fade = { animate: { opacity: expanded ? 1 : 0 }, transition: move };

  const link = (item: NavItem) => {
    const active = isNavActive(pathname, item.href, role);
    const dotKey = navDotKey(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={expanded ? undefined : item.name}
        aria-current={active ? 'page' : undefined}
        className={`group flex items-center gap-3 h-10 pl-[13px] pr-3 rounded-lg text-sm font-semibold transition-colors ${
          active ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <span className="relative shrink-0">
          <NavGlyph icon={item.icon} active={active} className={`h-[18px] w-[18px] transition-colors ${active ? 'text-orange-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
          {dotKey && dots[dotKey] && <ActivityDot className="-top-0.5 -right-0.5" />}
        </span>
        <m.span {...fade} className="truncate whitespace-nowrap">{item.name}</m.span>
      </Link>
    );
  };

  return (
    <LazyMotion features={domAnimation}>
      {/* The slot the page sits beside: the rail's width, or the full width while the menu is open on a desktop, which moves
          the page over. On a tablet the slot stays the rail's width and the panel floats over the page. */}
      <m.div initial={false} animate={{ width: pushes ? WIDE : RAIL }} transition={move} className="hidden md:block shrink-0 h-screen sticky top-0 z-30">
        <DismissibleArea open={tapOpen} onClose={() => setTapOpen(false)} className="h-full">
          <m.aside
            initial={false}
            animate={{ width: expanded ? WIDE : RAIL }}
            transition={move}
            onPointerEnter={e => { if (e.pointerType === 'mouse') setHover(true); }}
            onPointerLeave={() => setHover(false)}
            onFocus={e => { if (e.target.matches(':focus-visible')) setFocus(true); }}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false); }}
            className={`absolute inset-y-0 left-0 flex flex-col overflow-hidden bg-white max-lg:rounded-r-2xl ${expanded && !pushes ? 'shadow-xl' : ''}`}
          >
            <div className="h-16 flex items-center shrink-0 border-b border-slate-200 gap-3 pl-[18px] pr-4">
              <button
                type="button"
                onClick={() => setTapOpen(o => !o)}
                aria-label={expanded ? 'Close menu' : 'Open menu'}
                aria-expanded={expanded}
                className="h-8 w-8 rounded-lg bg-orange-600 flex items-center justify-center shrink-0"
              >
                <span className="text-white font-black text-sm">D</span>
              </button>
              <m.span {...fade} className="font-display font-bold text-sm text-slate-900 tracking-tight leading-none whitespace-nowrap">
                DelCargo <span className="text-slate-500 font-semibold">HR</span>
              </m.span>
            </div>

            <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide py-3 px-3">
              {groups.map((group, i) => (
                <div key={group.title ?? 'home'}>
                  {i > 0 && (
                    <div className="relative h-7">
                      <m.span {...fade} className="absolute left-3 bottom-1 text-caption font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">{group.title}</m.span>
                      <m.span aria-hidden="true" animate={{ opacity: expanded ? 0 : 1 }} transition={move} className="absolute inset-x-2 bottom-3 h-px bg-slate-200" />
                    </div>
                  )}
                  <div className="space-y-0.5">{group.items.map(link)}</div>
                </div>
              ))}
            </nav>

            <div className="border-t border-slate-200 space-y-0.5 shrink-0 p-3">
              {link(policy)}
              <button
                type="button"
                onClick={onTogglePinned}
                aria-pressed={isPinned}
                title={expanded ? undefined : 'Pin sidebar open'}
                className="max-lg:hidden group flex w-full items-center gap-3 h-10 pl-[13px] pr-3 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                {isPinned ? <PinOff className="h-[18px] w-[18px] shrink-0 text-slate-500" aria-hidden="true" /> : <Pin className="h-[18px] w-[18px] shrink-0 text-slate-500" aria-hidden="true" />}
                <m.span {...fade} className="whitespace-nowrap">{isPinned ? 'Unpin sidebar' : 'Pin sidebar open'}</m.span>
              </button>
            </div>
          </m.aside>
        </DismissibleArea>
      </m.div>
    </LazyMotion>
  );
}
