'use client';

// The Payroll screen used by BOTH HR and Admin (plan 028). Same screen, same numbers; the only
// difference is that Admin — who sends the money — can mark people paid.
//
// Three tabs, each one question:
//   Salaries      "Who do we need to pay this month, and is each person ready?"
//   Held salary   "How much is being held back for people who joined recently?"
//   Past months   "What did we pay in earlier months?"
//
// Nothing here changes how pay is calculated (that is lib/core/payroll.ts). The screen only shows
// the result more plainly, keeps one "amount to pay" figure everywhere, and nothing is saved
// except through an explicit button (Save bonus, Mark as paid).
import React, { useEffect, useMemo, useState } from 'react';
import { WarningIcon as AlertTriangle, CheckCircleIcon as CheckCircle2, DownloadSimpleIcon as Download, CircleNotchIcon as Loader2, ArrowsClockwiseIcon as RefreshCw, MagnifyingGlassIcon as Search } from '@/components/ui/icons';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { ListSkeleton } from '@/components/ui/Skeleton';
import {
  formatMoney,
  usePayrollCorrections, createPayrollCorrection, settlePayrollCorrection, type PayrollCorrection,
  payrollAdminAction,
  canReviewPreviousMonthPayroll, previousPayrollMonthKey, type PayrollRecord,
} from '@/lib/hrData';
import {
  netPay, payrollFlags, summarizePayroll, monthLabel, payPeriod, groupOfRegion, type PayrollGroup,
} from '@/lib/core/payrollView';
import { correctionsFor, outstandingTotals } from '@/lib/core/payrollCorrections';
import { PaySlipDialog } from './PaySlipDialog';
import { usePayrollView } from '@/hooks/usePayrollView';
import { downloadCsv } from '@/lib/csv';

type TabKey = 'salaries' | 'settlements' | 'held' | 'past';
type Filter = 'all' | 'unpaid' | 'paid' | 'look';
type Pending = { kind: 'one'; record: PayrollRecord } | { kind: 'past'; record: PayrollRecord } | { kind: 'all' } | null;

const GROUP_REGION: Record<PayrollGroup, 'Pakistan' | 'USA'> = { pakistan: 'Pakistan', usa: 'USA' };
const GROUP_LABEL: Record<PayrollGroup, string> = { pakistan: 'Pakistan (PKR)', usa: 'USA (USD)' };

/** "YYYY-MM" of the calendar month we are in right now (New York time), to tell "this month so far" from a finished month. */
const monthKeyNow = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 7);

export function PayrollScreen({ role }: { role: 'hr' | 'admin' }) {
  const isAdmin = role === 'admin';
  const { data: correctionData, refetch: refetchCorrections } = usePayrollCorrections();
  const corrections: PayrollCorrection[] = correctionData?.corrections ?? [];
  const correctionsConfigured = correctionData?.configured !== false;
  const [settling, setSettling] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('salaries');
  const [group, setGroup] = useState<PayrollGroup>('pakistan');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [pastMonth, setPastMonth] = useState('');
  // Days 4–10 of a month: last month's salaries are still being paid, so that is what opens first.
  const canReviewPrev = canReviewPreviousMonthPayroll();
  const [monthView, setMonthView] = useState<'previous' | 'current'>(() => (canReviewPreviousMonthPayroll() ? 'previous' : 'current'));
  const showPrevious = canReviewPrev && monthView === 'previous';

  const [slipFor, setSlipFor] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // The top-bar search box talks to pages through this window event.
  useEffect(() => {
    const onSearch = (e: Event) => setSearch(String((e as CustomEvent).detail || ''));
    window.addEventListener('globalSearch', onSearch);
    return () => window.removeEventListener('globalSearch', onSearch);
  }, []);

  const { records, employees, rawPayroll, loading, refetchPayroll, refetchProfiles } = usePayrollView({ previous: showPrevious });
  const profileById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const currentMonth = records[0]?.month || '';

  const inGroup = useMemo(() => records.filter(r => groupOfRegion(r.region) === group), [records, group]);
  const totals = useMemo(() => summarizePayroll(inGroup, profileById), [inGroup, profileById]);
  const countsByGroup = useMemo(() => ({
    pakistan: records.filter(r => groupOfRegion(r.region) === 'pakistan').length,
    usa: records.filter(r => groupOfRegion(r.region) === 'usa').length,
  }), [records]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inGroup.filter(r => {
      if (q && !r.name.toLowerCase().includes(q) && !r.role.toLowerCase().includes(q)) return false;
      if (filter === 'unpaid') return !r.processed;
      if (filter === 'paid') return r.processed;
      if (filter === 'look') return !r.processed && payrollFlags(r, profileById.get(r.employeeId)).length > 0;
      return true;
    });
  }, [inGroup, search, filter, profileById]);

  const readyToPay = useMemo(() => inGroup.filter(r => !r.processed && payrollFlags(r, profileById.get(r.employeeId)).length === 0), [inGroup, profileById]);
  const slipRecord = slipFor ? records.find(r => r.employeeId === slipFor) ?? null : null;
  const money = (n: number) => formatMoney(n, GROUP_REGION[group]);

  const refreshAll = async () => {
    setRefreshing(true);
    try { await Promise.all([refetchProfiles(), refetchPayroll()]); } finally { setRefreshing(false); }
  };

  // The server does all of it, in a safe order and once only: it works out the figures, adds the employee's raise to the
  // base salary, banks a new joiner's held-back first month, and marks the month paid. Pressing Pay again after an error is safe.
  const payOne = (record: PayrollRecord) => payrollAdminAction({ action: 'pay', employeeId: record.employeeId, month: record.month });

  const confirmPay = async () => {
    if (!pending || !isAdmin) return;
    const action = pending;
    setPending(null);
    setNotice('');
    try {
      if (action.kind === 'one') {
        setPayingId(action.record.employeeId);
        await payOne(action.record);
        setNotice(`${action.record.name} was marked as paid.`);
      } else if (action.kind === 'past') {
        // An earlier month that was paid but never ticked off here. This only records that it was
        // paid — it deliberately does not touch anyone's salary, increment or held balance.
        setPayingId(action.record.employeeId);
        await payrollAdminAction({ action: 'recordPaid', employeeId: action.record.employeeId, month: action.record.month });
        setNotice(`${action.record.name} — ${monthLabel(action.record.month)} is now marked as paid.`);
      } else {
        setBulkBusy(true);
        let done = 0;
        for (const r of readyToPay) { await payOne(r); done++; }
        setNotice(`${done} ${done === 1 ? 'person was' : 'people were'} marked as paid.`);
      }
    } catch (err) {
      console.error('[payroll] marking paid failed:', err);
      setNotice('Something went wrong while saving. Please refresh and check who is marked as paid before trying again.');
    } finally {
      setPayingId(null);
      setBulkBusy(false);
      await refreshAll();
    }
  };

  const saveBonus = async (record: PayrollRecord, bonus: number) => {
    await payrollAdminAction({ action: 'setBonus', employeeId: record.employeeId, month: record.month, bonus });
    await refetchPayroll();
  };

  const bankRow = (r: PayrollRecord) => {
    const p = profileById.get(r.employeeId);
    return [r.name, p?.bankName || '', p?.accountNumber || '', p?.iban || '', netPay(r), GROUP_REGION[group] === 'USA' ? 'USD' : 'PKR'];
  };
  const downloadTransferSheet = () => {
    downloadCsv(`DelCargo_Bank_Transfers_${GROUP_REGION[group]}_${currentMonth}.csv`, [
      ['Employee', 'Bank', 'Account number', 'IBAN', 'Amount', 'Currency'],
      ...inGroup.filter(r => !r.processed).map(bankRow),
    ]);
  };
  const downloadFullReport = () => {
    downloadCsv(`DelCargo_Payroll_${GROUP_REGION[group]}_${currentMonth}.csv`, [
      ['Employee', 'Role', 'Salary for', 'Monthly salary', 'Increment', 'Bonus', 'Earlier part-month pay', 'Deductions', 'Amount to pay', 'Status'],
      ...inGroup.map(r => [r.name, r.role, monthLabel(r.month), r.baseSalary, r.incrementAmount, r.bonus, r.earlierPay || 0, r.deductions, netPay(r), r.processed ? 'Paid' : 'Not paid yet']),
    ]);
  };

  // ── Held salary tab ──────────────────────────────────────────────────────────
  const heldRows = useMemo(() => employees
    .filter(e => (e.role === 'employee' || e.role === 'team_lead') && ((e.reservedSalaryBalance || 0) + (e.manualReservedAmount || 0)) > 0)
    .map(e => ({ profile: e, amount: (e.reservedSalaryBalance || 0) + (e.manualReservedAmount || 0), group: groupOfRegion(e.region) })),
  [employees]);

  // ── Past months tab ──────────────────────────────────────────────────────────
  const pastMonths = useMemo(
    () => Array.from(new Set(rawPayroll.map(r => r.month).filter(m => m && m !== currentMonth))).sort().reverse().slice(0, 12),
    [rawPayroll, currentMonth],
  );
  const activePast = pastMonth && pastMonths.includes(pastMonth) ? pastMonth : pastMonths[0] || '';
  const pastRows = useMemo(() => rawPayroll.filter(r => r.month === activePast), [rawPayroll, activePast]);

  const filterItems: { value: Filter; label: string; count?: number }[] = [
    { value: 'all', label: 'Everyone', count: inGroup.length },
    { value: 'unpaid', label: 'Not paid yet', count: totals.unpaid },
    { value: 'paid', label: 'Paid', count: totals.paid },
    { value: 'look', label: 'Needs a look', count: totals.needsLook },
  ];

  const statusBadge = (r: PayrollRecord) => {
    if (!r.processed) return <Badge variant="warning">Not paid yet</Badge>;
    return correctionsFor(corrections, r.employeeId, r.month).length > 0 ? <Badge variant="warning">Paid — corrected</Badge> : <Badge variant="success">Paid</Badge>;
  };
  const flagChips = (r: PayrollRecord) => {
    const chips: React.ReactNode[] = [];
    if (r.incrementAmount > 0) chips.push(<Badge key="inc" variant="success" size="sm">Increment</Badge>);
    if (r.deductions > 0 && r.reservedThisMonth <= 0) chips.push(<Badge key="ded" variant="danger" size="sm">Deductions</Badge>);
    if (r.reservedThisMonth > 0) chips.push(<Badge key="held" variant="indigo" size="sm">First month held</Badge>);
    if (!r.processed) payrollFlags(r, profileById.get(r.employeeId)).forEach(f => chips.push(
      <Badge key={f.kind} variant="warning" size="sm" className="gap-1" title={f.detail}>
        <AlertTriangle className="h-3.5 w-3.5" />{f.label}
      </Badge>,
    ));
    return chips.length ? <div className="mt-1 flex flex-wrap gap-1">{chips}</div> : null;
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900 md:text-2xl">Payroll</h1>
          <p className="text-xs text-slate-500 md:text-sm">
            {isAdmin
              ? 'Check each person’s salary, send the money, then mark them as paid.'
              : 'Check each person’s salary before Admin sends the money.'}
          </p>
        </div>
        <Button variant="outline" size="md" onClick={refreshAll} disabled={refreshing} className="self-start md:self-auto" aria-label="Refresh payroll">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <Tabs
        variant="underline"
        aria-label="Payroll sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'salaries', label: 'Salaries' },
          { value: 'settlements', label: 'Settlements', count: outstandingTotals(corrections).count || undefined },
          { value: 'held', label: 'Held salary', count: heldRows.length || undefined },
          { value: 'past', label: 'Past months' },
        ]}
      />

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="shrink-0 text-emerald-700 hover:underline">Dismiss</button>
        </div>
      )}

      {tab === 'salaries' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {canReviewPrev && (
                <Tabs
                  variant="segmented"
                  aria-label="Which month"
                  value={monthView}
                  onChange={setMonthView}
                  items={[
                    { value: 'previous', label: `${monthLabel(previousPayrollMonthKey())} (being paid)` },
                    { value: 'current', label: 'This month so far' },
                  ]}
                />
              )}
              <Tabs
                variant="segmented"
                aria-label="Which employees"
                value={group}
                onChange={setGroup}
                items={[
                  { value: 'pakistan', label: GROUP_LABEL.pakistan, count: countsByGroup.pakistan },
                  { value: 'usa', label: GROUP_LABEL.usa, count: countsByGroup.usa },
                ]}
              />
            </div>
            {currentMonth && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm">
                <p className="font-bold text-slate-900">Salary for {payPeriod(currentMonth).salaryMonth}{currentMonth === monthKeyNow() ? ' (this month so far)' : ''}</p>
                <p className="text-xs text-slate-600">Paid at the start of {payPeriod(currentMonth).paidMonth}</p>
              </div>
            )}
          </div>

          {loading ? (
            <ListSkeleton rows={6} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
                <Card><CardContent className="pt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Still to pay</p>
                  <p className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">{money(totals.toPay)}</p>
                  <p className="mt-1 text-xs text-slate-500">{totals.unpaid} {totals.unpaid === 1 ? 'person' : 'people'} · {money(totals.total)} in total this month</p>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid so far</p>
                  <p className="mt-1 text-xl font-bold text-slate-900 md:text-2xl">{totals.paid} of {totals.people}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${totals.people ? Math.round((totals.paid / totals.people) * 100) : 0}%` }} />
                  </div>
                </CardContent></Card>
                <Card><CardContent className="pt-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Needs a look</p>
                  {totals.needsLook > 0 ? (
                    <button type="button" onClick={() => setFilter('look')} className="mt-1 flex items-center gap-2 text-left">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      <span className="text-sm font-semibold text-slate-800">{totals.needsLook} {totals.needsLook === 1 ? 'person' : 'people'} to check first <span className="text-orange-600">— show</span></span>
                    </button>
                  ) : (
                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><CheckCircle2 className="h-5 w-5 text-emerald-500" /> Everyone is ready</p>
                  )}
                </CardContent></Card>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Tabs variant="chips" aria-label="Show" value={filter} onChange={setFilter} items={filterItems} />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      aria-label="Search employees"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name"
                      className="w-40 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs font-medium focus:border-orange-400 focus:outline-none"
                    />
                  </div>
                  {isAdmin && (
                    <Button variant="outline" size="md" onClick={downloadTransferSheet} disabled={totals.unpaid === 0}>
                      <Download className="h-3.5 w-3.5" /> Bank transfer sheet
                    </Button>
                  )}
                  <Button variant="outline" size="md" onClick={downloadFullReport} disabled={inGroup.length === 0}>
                    <Download className="h-3.5 w-3.5" /> Full report
                  </Button>
                  {isAdmin && (
                    <Button variant="primary" size="md" onClick={() => setPending({ kind: 'all' })} disabled={readyToPay.length === 0 || bulkBusy}>
                      {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Mark all ready as paid ({readyToPay.length})
                    </Button>
                  )}
                </div>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <Card className="overflow-hidden border border-slate-200 p-0">
                  <TableScroll>
                    <Table>
                      <THead>
                        <tr>
                          <Th>Employee</Th>
                          <Th align="right">Amount to pay</Th>
                          <Th align="center">Status</Th>
                          <Th align="center">Details</Th>
                        </tr>
                      </THead>
                      <TBody>
                        {visible.length === 0 ? (
                          <EmptyState as="td" colSpan={4}>No one to show here.</EmptyState>
                        ) : visible.map(r => (
                          <Tr key={r.employeeId}>
                            <Td>
                              <div className="font-semibold text-slate-900">{r.name}</div>
                              <div className="mt-0.5 text-xs text-slate-500">{r.role}</div>
                              {flagChips(r)}
                            </Td>
                            <Td align="right"><span className="font-semibold text-slate-900">{money(netPay(r))}</span></Td>
                            <Td align="center">{statusBadge(r)}</Td>
                            <Td align="center">
                              <Button variant="outline" size="sm" onClick={() => setSlipFor(r.employeeId)}>{payingId === r.employeeId ? 'Saving…' : 'View'}</Button>
                            </Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  </TableScroll>
                </Card>
              </div>

              {/* Mobile cards */}
              <div className="space-y-3 md:hidden">
                {visible.length === 0 ? <EmptyState>No one to show here.</EmptyState> : visible.map(r => (
                  <button key={r.employeeId} type="button" onClick={() => setSlipFor(r.employeeId)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{r.name}</p>
                        <p className="text-xs text-slate-500">{r.role}</p>
                      </div>
                      {statusBadge(r)}
                    </div>
                    <p className="mt-2 text-lg font-bold text-slate-900">{money(netPay(r))}</p>
                    {flagChips(r)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'settlements' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
            <p className="font-bold">What are settlements?</p>
            <p className="mt-1">When a salary that was already paid turns out to be wrong, a correction is recorded and the difference waits here. Admin pays the extra, or recovers the overpayment, whenever it suits — it is never added to or taken from another month’s salary — and then marks it settled.</p>
          </div>
          {!correctionsConfigured ? (
            <EmptyState>Corrections are not switched on yet. Ask your developer to run the setup step (ensurePayrollCorrections).</EmptyState>
          ) : corrections.length === 0 ? (
            <EmptyState>No corrections have been recorded.</EmptyState>
          ) : (
            <Card className="overflow-hidden border border-slate-200 p-0">
              <TableScroll>
                <Table>
                  <THead>
                    <tr><Th>Employee</Th><Th>Salary for</Th><Th align="right">Difference</Th><Th>Reason</Th><Th align="center">Status</Th>{isAdmin && <Th align="center">Action</Th>}</tr>
                  </THead>
                  <TBody>
                    {[...corrections].sort((a, b) => Number(a.settled) - Number(b.settled) || b.createdAt.localeCompare(a.createdAt)).map(c => (
                      <Tr key={c.id}>
                        <Td><span className="font-semibold text-slate-900">{c.employeeName}</span></Td>
                        <Td>{payPeriod(c.month).salaryMonth}</Td>
                        <Td align="right">
                          <span className={`font-bold ${c.difference > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{c.difference > 0 ? 'Pay ' : 'Recover '}{formatMoney(Math.abs(c.difference), c.region === 'USA' ? 'USA' : 'Pakistan')}</span>
                        </Td>
                        <Td><span className="text-xs text-slate-600">{c.reason}</span></Td>
                        <Td align="center">{c.settled ? <Badge variant="success">Settled</Badge> : <Badge variant="warning">Open</Badge>}</Td>
                        {isAdmin && (
                          <Td align="center">
                            {c.settled ? <span className="text-xs text-slate-400">—</span> : (
                              <Button variant="outline" size="sm" disabled={settling !== null} onClick={async () => {
                                setSettling(c.id);
                                try { await settlePayrollCorrection(c.id); await refetchCorrections(); setNotice(`Marked as settled: ${c.employeeName} — ${payPeriod(c.month).salaryMonth}.`); }
                                catch (e) { setNotice(e instanceof Error ? e.message : 'Could not mark it as settled.'); }
                                finally { setSettling(null); }
                              }}>{settling === c.id ? 'Saving…' : 'Mark settled'}</Button>
                            )}
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableScroll>
            </Card>
          )}
        </div>
      )}

      {tab === 'held' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs leading-relaxed text-indigo-900">
            <p className="font-bold">What is “held salary”?</p>
            <p className="mt-1">A new employee’s first month of pay is held back, not lost. It is kept here and paid out only when that person resigns or leaves. This list is for information; nothing here needs paying now.</p>
          </div>
          {loading ? <ListSkeleton rows={3} /> : heldRows.length === 0 ? (
            <EmptyState>No one has any salary held back.</EmptyState>
          ) : (
            (['pakistan', 'usa'] as PayrollGroup[]).map(g => {
              const rows = heldRows.filter(h => h.group === g);
              if (rows.length === 0) return null;
              return (
                <Card key={g} className="overflow-hidden border border-slate-200 p-0">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-bold text-slate-800">{GROUP_LABEL[g]}</p>
                    <p className="text-sm font-bold text-indigo-700">{formatMoney(rows.reduce((s, h) => s + h.amount, 0), GROUP_REGION[g])} held in total</p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {rows.map(h => (
                      <li key={h.profile.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <span className="font-semibold text-slate-900">{h.profile.fullName}</span>
                        <span className="font-bold text-indigo-700">{formatMoney(h.amount, GROUP_REGION[g])}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })
          )}
        </div>
      )}

      {tab === 'past' && (
        <div className="space-y-4">
          {pastMonths.length === 0 ? (
            <EmptyState>There are no earlier months yet.</EmptyState>
          ) : (
            <>
              <Tabs variant="chips" aria-label="Choose a month" value={activePast} onChange={setPastMonth} items={pastMonths.map(m => ({ value: m, label: monthLabel(m) }))} />
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm">
                <p className="font-bold text-slate-900">Salary for {payPeriod(activePast).salaryMonth}</p>
                <p className="text-xs text-slate-600">Paid at the start of {payPeriod(activePast).paidMonth}. Figures below are exactly what was saved.</p>
              </div>
              <Card className="overflow-hidden border border-slate-200 p-0">
                <TableScroll>
                  <Table>
                    <THead>
                      <tr><Th>Employee</Th><Th align="right">Amount</Th><Th align="center">Status</Th>{isAdmin && <Th align="center">Action</Th>}</tr>
                    </THead>
                    <TBody>
                      {pastRows.length === 0 ? <EmptyState as="td" colSpan={3}>Nothing was saved for this month.</EmptyState> : pastRows.map(r => (
                        <Tr key={r.id || r.employeeId}>
                          <Td><div className="font-semibold text-slate-900">{r.name}</div><div className="text-xs text-slate-500">{r.role}</div></Td>
                          <Td align="right"><span className="font-semibold text-slate-900">{formatMoney(netPay(r), r.region)}</span></Td>
                          <Td align="center">{statusBadge(r)}</Td>
                          {isAdmin && (
                            <Td align="center">
                              {r.processed ? <span className="text-xs text-slate-400">—</span> : (
                                <Button variant="outline" size="sm" disabled={payingId !== null} onClick={() => setPending({ kind: 'past', record: r })}>Mark as paid</Button>
                              )}
                            </Td>
                          )}
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </TableScroll>
              </Card>
              {isAdmin && pastRows.some(r => !r.processed) && (
                <p className="text-xs text-slate-500">Paid this month already but still showing “Not paid yet”? Press Mark as paid. It only ticks the month off; it does not change anyone’s salary.</p>
              )}
            </>
          )}
        </div>
      )}

      <PaySlipDialog
        record={slipRecord}
        profile={slipRecord ? profileById.get(slipRecord.employeeId) : undefined}
        isAdmin={isAdmin}
        isOpen={!!slipRecord}
        onClose={() => setSlipFor(null)}
        onSaveBonus={saveBonus}
        onMarkPaid={(r) => setPending({ kind: 'one', record: r })}
        busy={payingId !== null}
        corrections={slipRecord ? correctionsFor(corrections, slipRecord.employeeId, slipRecord.month) : []}
        configured={correctionsConfigured}
        onCorrect={async (record, correctedAmount, reason) => {
          await createPayrollCorrection({ employeeId: record.employeeId, month: record.month, correctedAmount, reason });
          await refetchCorrections();
          setNotice(`Correction recorded for ${record.name} — ${payPeriod(record.month).salaryMonth}. They have been told.`);
        }}
      />

      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirmPay}
        variant="warning"
        title={pending?.kind === 'all' ? 'Mark everyone ready as paid?' : pending?.kind === 'past' ? `Mark ${monthLabel(pending.record.month)} as paid?` : 'Mark as paid?'}
        message={
          pending?.kind === 'past'
            ? `${pending.record.name} — ${monthLabel(pending.record.month)}, ${formatMoney(netPay(pending.record), pending.record.region)}. This only records that this month was paid. It does not change anyone’s salary or anything else.`
            : pending?.kind === 'one'
            ? `${pending.record.name} — salary for ${payPeriod(pending.record.month).salaryMonth}, ${formatMoney(netPay(pending.record), pending.record.region)}. Only continue once the money has been sent.${pending.record.incrementAmount > 0 ? ` Their yearly increment of ${formatMoney(pending.record.incrementAmount, pending.record.region)} will also be added to their monthly salary.` : ''}${pending.record.reservedThisMonth > 0 ? ` ${formatMoney(pending.record.reservedThisMonth, pending.record.region)} will be held back as first-month salary.` : ''}`
            : pending?.kind === 'all'
              ? `Salary for ${payPeriod(currentMonth).salaryMonth}: ${readyToPay.length} ${readyToPay.length === 1 ? 'person' : 'people'} (${GROUP_LABEL[group]}), ${money(readyToPay.reduce((s, r) => s + netPay(r), 0))} in total. People marked “Needs a look” are not included. Only continue once the money has been sent. Any yearly increments due will also be added to monthly salaries.`
              : ''
        }
        confirmLabel="Yes, mark as paid"
        cancelLabel="Not yet"
        loading={bulkBusy || payingId !== null}
      />
    </div>
  );
}
