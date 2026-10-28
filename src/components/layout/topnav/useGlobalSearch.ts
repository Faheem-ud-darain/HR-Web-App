'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  isTechnicalSupportMember, useAnnouncements, useCareers, useLeaves, usePayroll, useTasks, useTeams, useTickets, useWarehouses, type Profile,
} from '@/lib/hrData';
import { EMPTY_RESULTS, searchEverything } from '@/lib/core/globalSearch';

// The top bar's global search: the typed text, whether the search dialog is open, the datasets, and the results the signed-in role
// may see (the rules are in lib/core/globalSearch). Typing also broadcasts a `globalSearch` event, which pages with
// their own search box (payroll, leaves...) listen for.
export function useGlobalSearch({ role, email, profiles, me, displayName }: { role: string | null; email: string | null; profiles?: Profile[]; me?: Profile; displayName: string }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  // The datasets are only needed once the person opens search: fetching them on every page load cost about six
  // collection reads, and recurring polls, for something most visits never use.
  const [active, setActive] = useState(false);
  const enabled = { enabled: active };
  const { data: tasks } = useTasks(enabled);
  const { data: tickets } = useTickets(50, undefined, enabled);
  const { data: teams } = useTeams();
  const { data: warehouses } = useWarehouses(enabled);
  const { data: payroll } = usePayroll(enabled);
  const { data: leaves } = useLeaves(enabled);
  const { data: careers } = useCareers(enabled);
  const { data: announcements } = useAnnouncements(enabled);

  const results = useMemo(
    () => role
      ? searchEverything(search, { role, email, profileId: me?.id ?? null, displayName, isTechnical: isTechnicalSupportMember(me?.teams) }, { profiles, tasks, tickets, teams, warehouses, payroll, leaves, careers, announcements })
      : EMPTY_RESULTS,
    [search, role, email, me, displayName, profiles, tasks, tickets, teams, warehouses, payroll, leaves, careers, announcements],
  );

  const onValue = (value: string) => {
    setSearch(value);
    window.dispatchEvent(new CustomEvent('globalSearch', { detail: value }));
  };
  const openSearch = () => { setActive(true); setOpen(true); };
  // Closing clears the text, and tells the page behind it so a list it was filtering does not stay filtered.
  const closeSearch = () => { onValue(''); setOpen(false); };

  // Ctrl/Cmd+K opens search from anywhere; "/" does too unless the person is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]');
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        setActive(true);
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return {
    search, showResults: !!role && search.trim().length > 0, results, role, open,
    onValue, openSearch, closeSearch,
    go: (url: string) => { closeSearch(); router.push(url); },
  };
}

export type GlobalSearch = ReturnType<typeof useGlobalSearch>;
