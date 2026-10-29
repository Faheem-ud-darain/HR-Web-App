'use client';

import React from 'react';
import {
  SquaresFourIcon, BroadcastIcon, QuestionIcon, ChatTextIcon, ChatCircleIcon, SparkleIcon, ClipboardTextIcon, MapPinIcon, BriefcaseIcon, ClockIcon,
  UserCheckIcon, WalletIcon, FileTextIcon, ChartBarIcon, MonitorIcon, UserPlusIcon, UsersIcon, StarIcon, BookOpenIcon,
} from '@/components/ui/icons';
import type { Icon } from '@phosphor-icons/react';
import type { NavIcon } from '@/lib/core/nav';

const ICONS: Record<NavIcon, Icon> = {
  dashboard: SquaresFourIcon, hrAdmin: BroadcastIcon, tickets: QuestionIcon, teamChat: ChatTextIcon, directMessages: ChatCircleIcon, assistant: SparkleIcon,
  tasks: ClipboardTextIcon, warehouses: MapPinIcon, careers: BriefcaseIcon, leaves: ClockIcon, attendance: UserCheckIcon, payroll: WalletIcon, reports: FileTextIcon,
  insights: ChartBarIcon, tracking: MonitorIcon, onboarding: UserPlusIcon, teams: UsersIcon, tracker: ClockIcon, teamTasks: StarIcon, policy: BookOpenIcon,
};

/** A navigation icon looked up by name (the menus are described in lib/core/nav): an outline, or filled while its page is the current one. */
export function NavGlyph({ icon, active = false, className }: { icon: NavIcon; active?: boolean; className?: string }) {
  const Glyph = ICONS[icon];
  return <Glyph weight={active ? 'fill' : 'regular'} className={className} aria-hidden="true" />;
}

/** The small red dot for "something new here", with a spoken equivalent. */
export function ActivityDot({ className = '' }: { className?: string }) {
  return (
    <>
      <span aria-hidden="true" className={`absolute h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white presence-dot ${className}`} />
      <span className="sr-only">New activity</span>
    </>
  );
}
