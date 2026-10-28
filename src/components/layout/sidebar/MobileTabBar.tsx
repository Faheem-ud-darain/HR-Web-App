'use client';

import React from 'react';
import Link from 'next/link';
import { AssistantOrb } from '@/components/assistant/AssistantOrb';
import { triggerHaptic } from '@/lib/haptics';
import { isNavActive, navDotKey, navRoot, type DotKey, type NavItem, type NavRole } from '@/lib/core/nav';
import { ActivityDot, NavGlyph } from './NavLink';

interface MobileTabBarProps {
  role: NavRole;
  pathname: string;
  quick: NavItem[];
  dots: Record<DotKey, boolean>;
  /** False while the page is scrolling down, so the bar gets out of the way. */
  visible: boolean;
  /** HR and Admin have the Del assistant, which takes the last slot. */
  assistant: boolean;
}

// The phone's tab bar: a floating, frosted capsule with four pages and, for HR and Admin, Del (the full menu is opened
// from the menu button in the top bar). The current page sits in an orange
// circle with a filled icon. `bottom` adds the safe-area inset to the 1.5rem gap so the pill floats clear of the
// home indicator's swipe zone (the inset is 0 on Android and the web).
export function MobileTabBar({ role, pathname, quick, dots, visible, assistant }: MobileTabBarProps) {
  const onDelPage = pathname.endsWith('/assistant');
  // Apple's corners are continuous (a squircle) and concentric: the bar's 2rem radius (half its height) minus its 0.5rem
  // padding is the 1.5rem radius of the tile inside it, so the two curves run parallel. In rem so they scale with the
  // phone's base size. (Browsers without corner-shape draw plain arcs.)
  const slot = 'relative flex items-center justify-center h-12 w-12 rounded-[1.5rem] [corner-shape:squircle] active:scale-95 transition-transform';
  const activeSlot = `${slot} bg-gradient-to-tr from-orange-500 to-orange-600 text-white shadow-md`;
  return (
    <nav
      aria-label="Main"
      className={`md:hidden fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 bg-white/90 backdrop-blur-xl border border-slate-200/50 rounded-[2rem] [corner-shape:squircle] shadow-lg flex justify-around items-center px-2 py-2 transition-all duration-300 ease-out motion-reduce:transition-none ${
        visible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-28 opacity-0 pointer-events-none'
      }`}
    >
      {quick.map(item => {
        const active = isNavActive(pathname, item.href, role);
        const dotKey = navDotKey(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.name}
            aria-label={item.name}
            aria-current={active ? 'page' : undefined}
            onClick={() => triggerHaptic.light()}
            className={active ? activeSlot : `${slot} text-slate-500`}
          >
            <NavGlyph icon={item.icon} active={active} className="h-6 w-6" />
            {dotKey && dots[dotKey] && <ActivityDot className="top-1 right-1" />}
          </Link>
        );
      })}
      {assistant && (
        // On a phone Del opens as its own page (the small floating window is too cramped there).
        <Link
          href={`${navRoot(role)}/assistant`}
          title="Del assistant"
          aria-label="Del assistant"
          aria-current={onDelPage ? 'page' : undefined}
          onClick={() => triggerHaptic.light()}
          className={`${slot} ${onDelPage ? 'ring-2 ring-orange-300' : ''}`}
        >
          <AssistantOrb size={32} />
        </Link>
      )}
    </nav>
  );
}
