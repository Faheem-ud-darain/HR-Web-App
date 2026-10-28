'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { hrActions, AbsenceRecord, TimesheetEntry, useTimesheets, useProfiles, useLeaves, isApprovedLeaveOnDate, getApprovedLeaveOnDate, LeaveApplication, formatMoney, localShiftDate, displayName, isWeekday } from '@/lib/hrData';
import { UserMinusIcon as UserX, ClockIcon as Clock, CalendarXIcon as CalendarX2, CheckCircleIcon as CheckCircle2, TrashIcon as Trash2, CalendarBlankIcon as Calendar, FunnelIcon as Filter, UserCheckIcon as UserCheck, ShieldSlashIcon as ShieldX, CalendarCheckIcon as CalendarCheck2, CaretRightIcon as ChevronRight } from '@phosphor-icons/react/dist/ssr';
import { formatTimeNY } from '@/lib/timezone';
import { getLeaveRange, eachLeaveDay } from '@/lib/core/leaves';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { PaginationControls } from '@/components/ui/PaginationControls';
import { usePagination } from '@/hooks/usePagination';
import { Button } from '@/components/ui/Button';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { StatCard } from '@/components/ui/StatCard';
import { Tabs } from '@/components/ui/Tabs';
import { SearchInput } from '@/components/ui/SearchInput';
import { LoadMoreHistory } from '@/components/ui/LoadMoreHistory';
import { daysAgoNYDateString } from '@/lib/timezone';
import { Input } from '@/components/ui/Input';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { useNow } from '@/lib/useNow';
import { useQuery } from '@tanstack/react-query';


interface AbsenceDetailsViewProps {
  role: 'employee' | 'hr' | 'admin';
  filterEmail?: string;
}

type AttendanceDayRow = {
  employeeEmail: string;
  employeeName: string;
  date: string;
  shifts: TimesheetEntry[];
  totalMinutes: number;
  hasActiveShift: boolean;
  isLeave?: boolean;
  leaveType?: LeaveApplication['type'];
};

// A stable empty list (a fresh `[]` each render would defeat the memos that depend on it).
const NO_ABSENCES: AbsenceRecord[] = [];

export function AbsenceDetailsView({ role, filterEmail }: AbsenceDetailsViewProps) {
  const now = useNow(); // for still-open shifts' running length (see lib/useNow.ts)
  const [activeTab, setActiveTab] = useState<'attendance' | 'absences'>('attendance');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [pendingDeleteRecord, setPendingDeleteRecord] = useState<AbsenceRecord | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // Recent window by default; the user can reach further back on demand.
  const HISTORY_STEP_DAYS = 90;
  const [historyDays, setHistoryDays] = useState(HISTORY_STEP_DAYS);
  const ownEmail = role === 'employee' ? filterEmail : undefined;
  const { data: allTimesheets = [], isLoading: loadingTimesheets, isFetching: fetchingTimesheets } = useTimesheets({ days: historyDays, email: ownEmail, enabled: role !== 'employee' || !!filterEmail });
  const { data: allProfiles = [] } = useProfiles();
  const { data: leaves = [] } = useLeaves();
  const [leaveBlockedNotice, setLeaveBlockedNotice] = useState<{ employeeName: string; date: string } | null>(null);

  // Date Filter States (defaults to empty -> all dates)
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [selectedAttendanceRow, setSelectedAttendanceRow] = useState<AttendanceDayRow | null>(null);
  // HR/Admin views aggregate to one row per employee — these hold which
  // employee's detail modal is currently open (attendance days, or absence
  // records). Employees viewing their own page skip aggregation entirely
  // (see the render below) so these stay unused in that case.
  // Store just the selected employee's email and look their entry up fresh
  // from the (memoized) summaries below on every render — so the open modal
  // always reflects the latest data instead of a snapshot taken the moment
  // it was opened, without needing an effect to keep it in sync.
  const [selectedEmployeeAttendanceEmail, setSelectedEmployeeAttendanceEmail] = useState<string | null>(null);
  const [selectedEmployeeAbsencesEmail, setSelectedEmployeeAbsencesEmail] = useState<string | null>(null);

  // Absence records for the chosen history window (an employee's own page asks the server
  // for just their own). Newest first.
  const { data: fetchedAbsences, isLoading: loadingAbsences, refetch: refetchAbsences } = useQuery({
    queryKey: ['absence_details_records', historyDays, ownEmail ?? 'all'],
    queryFn: async () => {
      const all = await hrActions.getAbsenceRecords({ sinceDate: daysAgoNYDateString(historyDays), email: ownEmail });
      return [...all].sort((a, b) => b.date.localeCompare(a.date));
    },
  });
  const absenceRecords: AbsenceRecord[] = fetchedAbsences ?? NO_ABSENCES;
  const loadAbsenceRecords = () => { void refetchAbsences(); };

  // Filter absence records by date and query
  const filteredAbsences = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return absenceRecords.filter(a =>
      (!selectedDate || a.date === selectedDate) &&
      (!q || a.employeeName.toLowerCase().includes(q) || a.employeeEmail.toLowerCase().includes(q)));
  }, [absenceRecords, selectedDate, searchQuery]);

  const handleDeleteAbsenceRecord = (record: AbsenceRecord) => {
    // Never allow deleting an absence record that is actually an approved leave day —
    // show an explanatory popup instead of the normal delete confirmation.
    if (isApprovedLeaveOnDate(leaves, record.employeeName, record.date)) {
      setLeaveBlockedNotice({ employeeName: record.employeeName, date: record.date });
      return;
    }
    setPendingDeleteRecord(record);
  };

  const confirmDeleteAbsenceRecord = async () => {
    if (!pendingDeleteRecord) return;
    const record = pendingDeleteRecord;
    setPendingDeleteRecord(null);
    setDeletingRecordId(record.id);
    try {
      await hrActions.deleteAbsenceRecord(record.id);
      setSelectedIds(prev => { const next = new Set(prev); next.delete(record.id); return next; });
      loadAbsenceRecords();
    } finally {
      setDeletingRecordId(null);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const selectedRecords = filteredAbsences.filter(r => selectedIds.has(r.id));
    // If ANY selected record is actually an approved leave day, block the whole
    // bulk action and explain — safer than silently skipping just that one record.
    const leaveCovered = selectedRecords.find(r => isApprovedLeaveOnDate(leaves, r.employeeName, r.date));
    if (leaveCovered) {
      setLeaveBlockedNotice({ employeeName: leaveCovered.employeeName, date: leaveCovered.date });
      return;
    }
    setShowBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    setBulkDeleting(true);
    try {
      await hrActions.bulkDeleteAbsenceRecords(Array.from(selectedIds));
      setSelectedIds(new Set());
      loadAbsenceRecords();
    } finally {
      setBulkDeleting(false);
    }
  };

  // Select-all is scoped to whichever list is currently visible — the whole
  // flat list for an employee's own (unaggregated) view, or just the one
  // employee's records inside the per-employee absence modal for HR/Admin.
  const handleToggleAllIn = (list: AbsenceRecord[]) => {
    const ids = list.map(r => r.id);
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleToggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Group timesheets cumulatively per Employee + Date
  const cumulativeAttendanceRows = useMemo(() => {
    let list = allTimesheets;
    if (role === 'employee' && filterEmail) {
      list = list.filter(t => t.employeeEmail.toLowerCase() === filterEmail.toLowerCase());
    }
    if (selectedDate) {
      list = list.filter(t => localShiftDate(t.clockIn, t.date) === selectedDate);
    }

    const groupedMap = new Map<string, AttendanceDayRow>();

    for (const t of list) {
      const dateKey = localShiftDate(t.clockIn, t.date);
      const empEmail = (t.employeeEmail || '').toLowerCase();
      const groupKey = `${empEmail}_${dateKey}`;

      const empProfile = allProfiles.find(p => p.email.toLowerCase() === empEmail);
      const empName = empProfile ? displayName(empProfile, 'hr') : t.employeeEmail;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!empName.toLowerCase().includes(q) && !empEmail.includes(q)) continue;
      }

      let shiftMins = 0;
      if (t.duration && t.duration.includes('h')) {
        const hMatch = t.duration.match(/(\d+)h/);
        const mMatch = t.duration.match(/(\d+)m/);
        const h = hMatch ? parseInt(hMatch[1], 10) : 0;
        const m = mMatch ? parseInt(mMatch[1], 10) : 0;
        shiftMins = h * 60 + m;
      } else if (t.clockIn) {
        const start = new Date(t.clockIn).getTime();
        const end = t.clockOut ? new Date(t.clockOut).getTime() : (now || start);
        shiftMins = Math.max(0, Math.floor((end - start) / 60000));
      }

      const existing = groupedMap.get(groupKey);
      if (existing) {
        existing.shifts.push(t);
        existing.totalMinutes += shiftMins;
        if (!t.clockOut) existing.hasActiveShift = true;
      } else {
        groupedMap.set(groupKey, {
          employeeEmail: t.employeeEmail,
          employeeName: empName,
          date: dateKey,
          shifts: [t],
          totalMinutes: shiftMins,
          hasActiveShift: !t.clockOut,
        });
      }
    }

    // Synthesize "On Leave" rows for approved leave days that have no timesheet
    // entry at all — otherwise an employee on approved leave with no clock-in
    // would show up as an unexplained no-show instead of a leave day.
    for (const l of leaves) {
      if (l.status !== 'approved') continue;
      const empProfile = allProfiles.find(p => p.fullName === l.employeeName);
      const empEmail = (empProfile?.email || '').toLowerCase();
      if (role === 'employee' && filterEmail && empEmail !== filterEmail.toLowerCase()) continue;

      const range = getLeaveRange(l);
      if (!range) continue;

      for (const dateKey of eachLeaveDay(range)) {
        if (selectedDate && dateKey !== selectedDate) continue;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (!l.employeeName.toLowerCase().includes(q) && !empEmail.includes(q)) continue;
        }

        const groupKey = `${empEmail}_${dateKey}`;
        // Already has real shift data for this day (e.g. leave applied but they
        // still clocked in) — leave the real attendance row as-is, don't override it.
        if (groupedMap.has(groupKey)) continue;

        groupedMap.set(groupKey, {
          employeeEmail: empProfile?.email || '',
          employeeName: l.employeeName,
          date: dateKey,
          shifts: [],
          totalMinutes: 0,
          hasActiveShift: false,
          isLeave: true,
          leaveType: l.type,
        });
      }
    }

    return Array.from(groupedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [allTimesheets, allProfiles, leaves, role, filterEmail, selectedDate, searchQuery, now]);

  // A record whose date turned out to be covered by an approved leave
  // (approved after runAbsenceCheck already scanned it, see
  // getApprovedLeaveOnDate's comment) is kept for history but is no longer
  // actually charged in payroll (getAbsenceDeductionForMonth excludes it) —
  // so every "$X deducted" total on this page needs to skip it too, or
  // this audit page would show money being taken that payroll never
  // actually takes.
  const effectiveDeductionAmount = (r: AbsenceRecord): number =>
    getApprovedLeaveOnDate(leaves, r.employeeName, r.date) ? 0 : r.deductionAmount;

  const totalDeducted = filteredAbsences.reduce((acc, r) => acc + effectiveDeductionAmount(r), 0);

  // HR/Admin views collapse the day-by-day rows down to one row per
  // employee — clicking opens a detail modal with that employee's full
  // history instead of scattering every day/record across the main table.
  // An employee viewing their own page is already scoped to a single
  // person, so their view skips this and stays a flat per-day/per-record
  // list (see the render below).
  const employeeAttendanceSummaries = useMemo(() => {
    if (role === 'employee') return [];
    const map = new Map<string, { employeeEmail: string; employeeName: string; days: AttendanceDayRow[] }>();
    for (const row of cumulativeAttendanceRows) {
      const key = row.employeeEmail.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.days.push(row);
      else map.set(key, { employeeEmail: row.employeeEmail, employeeName: row.employeeName, days: [row] });
    }
    return Array.from(map.values())
      .map(e => ({ ...e, days: [...e.days].sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [cumulativeAttendanceRows, role]);

  const employeeAbsenceSummaries = useMemo(() => {
    if (role === 'employee') return [];
    const map = new Map<string, { employeeEmail: string; employeeName: string; records: AbsenceRecord[] }>();
    for (const r of filteredAbsences) {
      const key = r.employeeEmail.toLowerCase();
      const existing = map.get(key);
      if (existing) existing.records.push(r);
      else map.set(key, { employeeEmail: r.employeeEmail, employeeName: r.employeeName, records: [r] });
    }
    return Array.from(map.values())
      .map(e => ({ ...e, records: [...e.records].sort((a, b) => b.date.localeCompare(a.date)) }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [filteredAbsences, role]);

  const { page: absencePage, setPage: setAbsencePage, totalPages: absenceTotalPages, pageItems: absencePageItems } = usePagination(filteredAbsences, 25);
  const { page: summaryPage, setPage: setSummaryPage, totalPages: summaryTotalPages, pageItems: summaryPageItems } = usePagination(employeeAbsenceSummaries, 25);
  useEffect(() => { setAbsencePage(1); setSummaryPage(1); }, [selectedDate, searchQuery, setAbsencePage, setSummaryPage]);

  const selectedEmployeeAttendance = selectedEmployeeAttendanceEmail
    ? employeeAttendanceSummaries.find(e => e.employeeEmail.toLowerCase() === selectedEmployeeAttendanceEmail.toLowerCase()) || null
    : null;
  const selectedEmployeeAbsences = selectedEmployeeAbsencesEmail
    ? employeeAbsenceSummaries.find(e => e.employeeEmail.toLowerCase() === selectedEmployeeAbsencesEmail.toLowerCase()) || null
    : null;

  const formatDuration = (mins: number) => `${Math.floor(mins / 60)}h ${mins % 60}m`;

  // Shared status-badge cluster for a single attendance day row — used in
  // the employee's own flat log AND inside the HR/Admin per-employee modal,
  // so the leave/on-shift/present/absent logic only lives in one place.
  const AttendanceStatusBadges = ({ row }: { row: AttendanceDayRow }) => (
    row.isLeave ? (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <Badge variant="info">
          <span className="inline-flex items-center gap-1"><CalendarCheck2 className="h-3.5 w-3.5" /> On Leave ({row.leaveType})</span>
        </Badge>
        {row.leaveType === 'Urgent' ? (
          <Badge variant="danger">2-day deduction</Badge>
        ) : (
          <Badge variant="success">No deduction</Badge>
        )}
      </span>
    ) : row.hasActiveShift ? (
      <Badge variant="warning">On Shift</Badge>
    ) : row.totalMinutes >= 240 ? (
      <Badge variant="success">Present ({formatDuration(row.totalMinutes)})</Badge>
    ) : !isWeekday(row.date) ? (
      // Weekend day with a stray/partial shift (accidental clock-in, a shift
      // auto-closed just after midnight, etc.) — never label this "Absent".
      // Mirrors the weekend exclusion runAbsenceCheck already enforces for
      // real payroll absence deductions (including that function's own
      // self-healing reversal of any absence record that ever landed on a
      // Saturday/Sunday) — this display-only badge just never had the same
      // guard, so it could still show "Absent" for a day nobody was ever
      // expected to work.
      row.totalMinutes > 0 ? (
        <Badge variant="info">Weekend ({formatDuration(row.totalMinutes)} worked)</Badge>
      ) : (
        <Badge variant="info">Weekend</Badge>
      )
    ) : (
      <Badge variant="danger">Absent (&lt; 4h worked)</Badge>
    )
  );

  // Shared reason label for a single absence record — used in the
  // employee's own flat list AND inside the HR/Admin per-employee modal.
  //
  // Always re-checks live leave coverage first, rather than trusting the
  // record's frozen `reason` — runAbsenceCheck only knew whether a leave
  // was approved at the moment it scanned (a 5-day lookback), so a leave
  // approved AFTER that scan leaves a stale no-show/under-4h/inactivity
  // record behind for what is really now an approved leave day. Showing
  // "Did not start a shift" for a day HR/Admin has since approved leave for
  // is exactly the confusing case this fixes — it now reads as the leave
  // it actually is, with its real type, instead of an unexplained no-show.
  const AbsenceReasonLabel = ({ r }: { r: AbsenceRecord }) => {
    const coveringLeave = getApprovedLeaveOnDate(leaves, r.employeeName, r.date);
    if (coveringLeave) {
      return (
        <span className="inline-flex items-center gap-1.5 text-emerald-700">
          <CalendarCheck2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Leave ({coveringLeave.type}) — approved after this was recorded</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-700">
        {r.reason === 'inactivity' ? (
          <>
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Inactive {r.inactivityMinutes} min during shift</span>
          </>
        ) : r.reason === 'under_4_hours' ? (
          <>
            <Clock className="h-3.5 w-3.5 text-rose-500" />
            <span>Worked under 4 hours ({Math.floor((r.workedMinutes || 0) / 60)}h {(r.workedMinutes || 0) % 60}m)</span>
          </>
        ) : (
          <>
            <CalendarX2 className="h-3.5 w-3.5 text-rose-500" />
            <span>Did not start a shift</span>
          </>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-4 md:space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-xs md:text-sm text-slate-500">
            {role === 'employee'
              ? 'View your real shift history, active shifts, and automatic absence logs.'
              : 'Monitor real employee shift check-ins, active work hours, and non-attendance deductions.'}
          </p>
        </div>

        {/* Tab switcher */}
        <Tabs
          variant="segmented"
          className="self-start md:self-auto"
          value={activeTab}
          onChange={setActiveTab}
          items={[
            { value: 'attendance', label: 'Attendance Logs', count: cumulativeAttendanceRows.length, icon: <UserCheck className="h-4 w-4 text-emerald-600" /> },
            { value: 'absences', label: 'Absence Deductions', count: filteredAbsences.length, icon: <UserX className="h-4 w-4 text-rose-600" /> },
          ]}
        />
      </div>

      {/* Filter Bar: Date Filter + Search */}
      <Card className="border border-slate-200 p-4 bg-white">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <span>Filter By Date:</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Selector Filter */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <Calendar className="h-4 w-4 text-slate-400" />
              <FieldLabel htmlFor="attendance-date-filter" size="sm">Date:</FieldLabel>
              <Input
                id="attendance-date-filter"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                fieldSize="md" className="cursor-pointer"
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="text-caption font-bold text-rose-600 hover:underline ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Email Search Filter (HR/Admin) */}
            {role !== 'employee' && (
              <SearchInput fieldSize="sm" clearable value={searchQuery} onChange={setSearchQuery} placeholder="Search employee..." wrapperClassName="min-w-[200px]" />
            )}
          </div>
        </div>
      </Card>

      <LoadMoreHistory
        days={historyDays}
        maxDays={HISTORY_STEP_DAYS * 4}
        loading={fetchingTimesheets || loadingAbsences}
        noun="attendance & absences"
        onLoadMore={() => setHistoryDays(d => d + HISTORY_STEP_DAYS)}
      />

      {/* ATTENDANCE TAB */}
      {activeTab === 'attendance' && (
        <Card className="border border-slate-200 overflow-hidden p-0 bg-white">
          {loadingTimesheets ? (
            <div className="py-16 text-center text-xs font-semibold text-slate-400">Loading attendance records…</div>
          ) : role === 'employee' ? (
            cumulativeAttendanceRows.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <UserCheck weight="duotone" className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No shift attendance records found</p>
                <p className="text-xs text-slate-400">
                  {selectedDate ? `No attendance recorded for ${selectedDate}.` : 'No shifts have been clocked in yet.'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table — employee's own flat day-by-day log */}
                <TableScroll hideOnMobile>
                  <Table density="cozy" size="xs">
                    <THead>
                      <tr>
                        <Th className="font-bold">Date</Th>
                        <Th align="center" className="font-bold">Total Shifts</Th>
                        <Th align="right" className="font-bold">Total Worked Time</Th>
                        <Th align="center" className="font-bold">Attendance Status</Th>
                        <Th align="center" className="font-bold">Details</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {cumulativeAttendanceRows.map(row => (
                        <Tr key={`${row.employeeEmail}_${row.date}`}>
                          <Td className="font-mono font-bold text-slate-700">{row.date}</Td>
                          <Td align="center" className="font-semibold text-slate-700">
                            {row.isLeave ? '—' : `${row.shifts.length} shift${row.shifts.length > 1 ? 's' : ''}`}
                          </Td>
                          <Td align="right" className="font-bold text-slate-900">{row.isLeave ? '—' : formatDuration(row.totalMinutes)}</Td>
                          <Td align="center"><AttendanceStatusBadges row={row} /></Td>
                          <Td align="center">
                            {row.isLeave ? (
                              <span className="text-caption text-slate-400 font-semibold">Approved leave — no shift</span>
                            ) : (
                              <button
                                onClick={() => setSelectedAttendanceRow(row)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-caption rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                View Breakdown
                              </button>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </TableScroll>

                {/* Mobile Cards Stack */}
                <div className="md:hidden divide-y divide-slate-100">
                  {cumulativeAttendanceRows.map(row => (
                    <div key={`${row.employeeEmail}_${row.date}`} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-slate-800">{row.date}</p>
                        <AttendanceStatusBadges row={row} />
                      </div>
                      {row.isLeave ? (
                        <p className="text-caption text-slate-400 font-semibold uppercase">Approved leave — no shift</p>
                      ) : (
                        <div className="flex items-center justify-between pt-1 text-xs">
                          <div>
                            <p className="text-caption text-slate-400 font-semibold uppercase">Total Time ({row.shifts.length} shift{row.shifts.length > 1 ? 's' : ''})</p>
                            <p className="font-bold text-slate-900">{formatDuration(row.totalMinutes)}</p>
                          </div>
                          <button
                            onClick={() => setSelectedAttendanceRow(row)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                          >
                            View Breakdown
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )
          ) : employeeAttendanceSummaries.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <UserCheck weight="duotone" className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No shift attendance records found</p>
              <p className="text-xs text-slate-400">
                {selectedDate ? `No attendance recorded for ${selectedDate}.` : 'No shifts have been clocked in yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table — HR/Admin: one row per employee, click to open their full history */}
              <TableScroll hideOnMobile>
                <Table density="cozy" size="xs">
                  <THead>
                    <tr>
                      <Th className="font-bold">Employee</Th>
                      <Th align="center" className="font-bold">Days Logged</Th>
                      <Th align="center" className="font-bold">Present</Th>
                      <Th align="center" className="font-bold">On Leave</Th>
                      <Th align="center" className="font-bold">Flagged</Th>
                      <Th align="right" className="font-bold">Total Worked Time</Th>
                      <Th align="center" className="font-bold">Details</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {employeeAttendanceSummaries.map(emp => {
                      const presentDays = emp.days.filter(d => !d.isLeave && !d.hasActiveShift && d.totalMinutes >= 240).length;
                      const leaveDays = emp.days.filter(d => d.isLeave).length;
                      const flaggedDays = emp.days.filter(d => !d.isLeave && !d.hasActiveShift && d.totalMinutes < 240).length;
                      const totalMinutes = emp.days.reduce((s, d) => s + d.totalMinutes, 0);
                      return (
                        <Tr key={emp.employeeEmail}>
                          <Td>
                            <p className="font-bold text-slate-900">{emp.employeeName}</p>
                            <p className="text-caption text-slate-400 font-mono">{emp.employeeEmail}</p>
                          </Td>
                          <Td align="center" className="font-semibold text-slate-700">{emp.days.length}</Td>
                          <Td align="center"><Badge variant="success">{presentDays}</Badge></Td>
                          <Td align="center">{leaveDays > 0 ? <Badge variant="info">{leaveDays}</Badge> : <span className="text-slate-400">0</span>}</Td>
                          <Td align="center">{flaggedDays > 0 ? <Badge variant="danger">{flaggedDays}</Badge> : <span className="text-slate-400">0</span>}</Td>
                          <Td align="right" className="font-bold text-slate-900">{formatDuration(totalMinutes)}</Td>
                          <Td align="center">
                            <button
                              onClick={() => setSelectedEmployeeAttendanceEmail(emp.employeeEmail)}
                              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-caption rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              View Details <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              </TableScroll>

              {/* Mobile Cards Stack */}
              <div className="md:hidden divide-y divide-slate-100">
                {employeeAttendanceSummaries.map(emp => {
                  const presentDays = emp.days.filter(d => !d.isLeave && !d.hasActiveShift && d.totalMinutes >= 240).length;
                  const leaveDays = emp.days.filter(d => d.isLeave).length;
                  const flaggedDays = emp.days.filter(d => !d.isLeave && !d.hasActiveShift && d.totalMinutes < 240).length;
                  const totalMinutes = emp.days.reduce((s, d) => s + d.totalMinutes, 0);
                  return (
                    <button
                      key={emp.employeeEmail}
                      onClick={() => setSelectedEmployeeAttendanceEmail(emp.employeeEmail)}
                      className="w-full text-left p-4 space-y-2 hover:bg-slate-50/50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-900">{emp.employeeName}</p>
                          <p className="text-caption text-slate-400 font-mono">{emp.employeeEmail}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap text-caption">
                        <span className="text-slate-500">{emp.days.length} days logged</span>
                        <Badge variant="success">{presentDays} present</Badge>
                        {leaveDays > 0 && <Badge variant="info">{leaveDays} leave</Badge>}
                        {flaggedDays > 0 && <Badge variant="danger">{flaggedDays} flagged</Badge>}
                      </div>
                      <p className="text-xs font-bold text-slate-900">{formatDuration(totalMinutes)} total</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>
      )}

      {/* EMPLOYEE ATTENDANCE DETAIL MODAL (HR/Admin) */}
      {selectedEmployeeAttendance && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedEmployeeAttendance.employeeName}</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedEmployeeAttendance.employeeEmail} • {selectedEmployeeAttendance.days.length} day{selectedEmployeeAttendance.days.length > 1 ? 's' : ''} logged</p>
              </div>
              <button
                onClick={() => setSelectedEmployeeAttendanceEmail(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              {selectedEmployeeAttendance.days.map(row => (
                <div key={row.date} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-mono font-bold text-slate-700">{row.date}</p>
                    <p className="text-caption text-slate-400">
                      {row.isLeave ? 'Approved leave — no shift' : `${row.shifts.length} shift${row.shifts.length > 1 ? 's' : ''} • ${formatDuration(row.totalMinutes)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AttendanceStatusBadges row={row} />
                    {!row.isLeave && (
                      <button
                        onClick={() => setSelectedAttendanceRow(row)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-caption rounded-lg transition-colors"
                      >
                        Breakdown
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedEmployeeAttendanceEmail(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE-PROTECTED ABSENCE DELETE BLOCKED POPUP */}
      {leaveBlockedNotice && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
                <CalendarCheck2 className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">This absence is due to an approved leave</h3>
                <p className="text-xs text-slate-500 font-mono">{leaveBlockedNotice.employeeName} • {leaveBlockedNotice.date}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              This record cannot be removed here because it falls on a day covered by an approved leave request. Leave-covered absence records are protected from deletion to keep the leave and attendance history consistent.
            </p>
            <div className="pt-1 flex justify-end">
              <button
                onClick={() => setLeaveBlockedNotice(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT BREAKDOWN MODAL */}
      {selectedAttendanceRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Shift Breakdown Details</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedAttendanceRow.date} • {selectedAttendanceRow.employeeName}</p>
              </div>
              <button
                onClick={() => setSelectedAttendanceRow(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl">
                <div>
                  <p className="text-caption font-bold uppercase text-slate-400">Total Worked Time</p>
                  <p className="text-sm font-bold text-slate-900">
                    {Math.floor(selectedAttendanceRow.totalMinutes / 60)}h {selectedAttendanceRow.totalMinutes % 60}m
                  </p>
                </div>
                <div>
                  <p className="text-caption font-bold uppercase text-slate-400">Shift Count</p>
                  <p className="text-sm font-bold text-slate-900">{selectedAttendanceRow.shifts.length} shift(s)</p>
                </div>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                <p className="text-xs font-bold text-slate-700">Individual Shifts:</p>
                {selectedAttendanceRow.shifts.map((s, idx) => (
                  <div key={s.id || idx} className="border border-slate-200 rounded-xl p-3 space-y-1 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Shift #{idx + 1}</span>
                      <Badge variant={s.clockOut ? 'success' : 'warning'}>
                        {s.clockOut ? 'Completed' : 'On Shift'}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 font-mono text-slate-600">
                      <div>
                        <span className="text-caption text-slate-400 block font-sans uppercase font-bold">Clock In</span>
                        {s.clockIn ? formatTimeNY(s.clockIn) : '—'}
                      </div>
                      <div>
                        <span className="text-caption text-slate-400 block font-sans uppercase font-bold">Clock Out</span>
                        {s.clockOut ? formatTimeNY(s.clockOut) : '—'}
                      </div>
                    </div>
                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Duration:</span>
                      <span className="font-bold text-slate-900">{s.duration || 'In Progress'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedAttendanceRow(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABSENCES TAB */}
      {activeTab === 'absences' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <StatCard label="Total Absences" value={filteredAbsences.length} />
            <StatCard label="Total Deducted" value={formatMoney(totalDeducted, 'Pakistan')} valueTone="danger" />
            <StatCard label="Inactivity vs No-Show" value={<>{filteredAbsences.filter(r => r.reason === 'inactivity').length} / {filteredAbsences.filter(r => r.reason === 'no_clock_in').length}</>} className="col-span-2 md:col-span-1" />
          </div>

          <Card className="border border-slate-200 overflow-hidden p-0 bg-white">
            {loadingAbsences ? (
              <div className="py-16 text-center text-xs font-semibold text-slate-400">Loading absence records…</div>
            ) : role === 'employee' ? (
              filteredAbsences.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <UserX weight="duotone" className="h-8 w-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">No absence records found</p>
                  <p className="text-xs text-slate-400">
                    {selectedDate ? `No absence records for ${selectedDate}.` : 'No employees have been marked absent.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop table — employee's own flat list, read-only */}
                  <TableScroll hideOnMobile>
                    <Table density="cozy" size="xs">
                      <THead>
                        <tr>
                          <Th className="font-bold">Date</Th>
                          <Th className="font-bold">Reason</Th>
                          <Th align="right" className="font-bold">Deduction</Th>
                          <Th align="center" className="font-bold">Acknowledged</Th>
                        </tr>
                      </THead>
                      <TBody>
                        {absencePageItems.map(r => (
                          <Tr key={r.id}>
                            <Td className="font-mono font-bold text-slate-700">{r.date}</Td>
                            <Td><AbsenceReasonLabel r={r} /></Td>
                            <Td align="right" className="font-bold text-rose-600">{formatMoney(effectiveDeductionAmount(r), 'Pakistan')}</Td>
                            <Td align="center">
                              {r.acknowledged
                                ? <Badge variant="success"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Seen</span></Badge>
                                : <Badge variant="warning">Pending</Badge>}
                            </Td>
                          </Tr>
                        ))}
                      </TBody>
                    </Table>
                  </TableScroll>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {absencePageItems.map(r => (
                      <div key={r.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-mono text-xs font-bold text-slate-800">{r.date}</p>
                          {r.acknowledged
                            ? <Badge variant="success">Seen</Badge>
                            : <Badge variant="warning">Pending</Badge>}
                        </div>
                        <p className="text-xs text-slate-600"><AbsenceReasonLabel r={r} /></p>
                        <p className="text-xs font-bold text-rose-600">{formatMoney(effectiveDeductionAmount(r), 'Pakistan')} deducted</p>
                      </div>
                    ))}
                  </div>
                  <PaginationControls page={absencePage} setPage={setAbsencePage} totalPages={absenceTotalPages} totalCount={filteredAbsences.length} itemLabel="records" />
                </>
              )
            ) : employeeAbsenceSummaries.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <UserX weight="duotone" className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No absence records found</p>
                <p className="text-xs text-slate-400">
                  {selectedDate ? `No absence records for ${selectedDate}.` : 'No employees have been marked absent.'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table — HR/Admin: one row per employee, manage in a modal */}
                <TableScroll hideOnMobile>
                  <Table density="cozy" size="xs">
                    <THead>
                      <tr>
                        <Th className="font-bold">Employee</Th>
                        <Th align="center" className="font-bold">Absences</Th>
                        <Th align="right" className="font-bold">Total Deducted</Th>
                        <Th align="center" className="font-bold">Pending</Th>
                        <Th align="center" className="font-bold">Manage</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {summaryPageItems.map(emp => {
                        const deducted = emp.records.reduce((s, r) => s + effectiveDeductionAmount(r), 0);
                        const pending = emp.records.filter(r => !r.acknowledged).length;
                        return (
                          <Tr key={emp.employeeEmail}>
                            <Td>
                              <p className="font-bold text-slate-900">{emp.employeeName}</p>
                              <p className="text-caption text-slate-400 font-mono">{emp.employeeEmail}</p>
                            </Td>
                            <Td align="center"><Badge variant="danger">{emp.records.length}</Badge></Td>
                            <Td align="right" className="font-bold text-rose-600">{formatMoney(deducted, 'Pakistan')}</Td>
                            <Td align="center">{pending > 0 ? <Badge variant="warning">{pending}</Badge> : <span className="text-slate-400">0</span>}</Td>
                            <Td align="center">
                              <button
                                onClick={() => setSelectedEmployeeAbsencesEmail(emp.employeeEmail)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-caption rounded-lg transition-colors inline-flex items-center gap-1"
                              >
                                Manage <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </TBody>
                  </Table>
                </TableScroll>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {summaryPageItems.map(emp => {
                    const deducted = emp.records.reduce((s, r) => s + effectiveDeductionAmount(r), 0);
                    const pending = emp.records.filter(r => !r.acknowledged).length;
                    return (
                      <button
                        key={emp.employeeEmail}
                        onClick={() => setSelectedEmployeeAbsencesEmail(emp.employeeEmail)}
                        className="w-full text-left p-4 space-y-2 hover:bg-slate-50/50"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{emp.employeeName}</p>
                            <p className="text-caption text-slate-400 font-mono">{emp.employeeEmail}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-caption">
                          <Badge variant="danger">{emp.records.length} absences</Badge>
                          {pending > 0 && <Badge variant="warning">{pending} pending</Badge>}
                        </div>
                        <p className="text-xs font-bold text-rose-600">{formatMoney(deducted, 'Pakistan')} deducted</p>
                      </button>
                    );
                  })}
                </div>
                <PaginationControls page={summaryPage} setPage={setSummaryPage} totalPages={summaryTotalPages} totalCount={employeeAbsenceSummaries.length} itemLabel="employees" />
              </>
            )}
          </Card>
        </div>
      )}

      {/* EMPLOYEE ABSENCE DETAIL MODAL (HR/Admin) — manage/delete lives here */}
      {selectedEmployeeAbsences && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedEmployeeAbsences.employeeName}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedEmployeeAbsences.employeeEmail} • {selectedEmployeeAbsences.records.length} absence record{selectedEmployeeAbsences.records.length > 1 ? 's' : ''} •{' '}
                  {formatMoney(selectedEmployeeAbsences.records.reduce((s, r) => s + effectiveDeductionAmount(r), 0), 'Pakistan')} deducted
                </p>
              </div>
              <button
                onClick={() => setSelectedEmployeeAbsencesEmail(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Bulk action bar — scoped to this employee's records */}
            {(() => {
              const empIds = selectedEmployeeAbsences.records.map(r => r.id);
              const empSelectedCount = empIds.filter(id => selectedIds.has(id)).length;
              return empSelectedCount > 0 ? (
                <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ShieldX className="h-4 w-4 text-rose-600 shrink-0" />
                    <span className="text-xs font-bold text-rose-800">
                      {empSelectedCount} record{empSelectedCount > 1 ? 's' : ''} selected
                      {' '}—{' '}
                      {formatMoney(
                        selectedEmployeeAbsences.records.filter(r => selectedIds.has(r.id)).reduce((s, r) => s + effectiveDeductionAmount(r), 0),
                        'Pakistan'
                      )}{' '}to reverse
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(prev => { const next = new Set(prev); empIds.forEach(id => next.delete(id)); return next; })}
                      className="text-xs font-bold text-rose-500 hover:text-rose-700"
                    >
                      Cancel
                    </button>
                    <Button
                      type="button"
                      variant="danger"
                      size="md"
                      onClick={handleBulkDelete}
                      disabled={bulkDeleting}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {bulkDeleting ? 'Removing…' : `Remove ${empSelectedCount} Record${empSelectedCount > 1 ? 's' : ''}`}
                    </Button>
                  </div>
                </div>
              ) : null;
            })()}

            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                checked={selectedEmployeeAbsences.records.length > 0 && selectedEmployeeAbsences.records.every(r => selectedIds.has(r.id))}
                onChange={() => handleToggleAllIn(selectedEmployeeAbsences.records)}
                className="accent-rose-600 h-3.5 w-3.5 cursor-pointer"
              />
              <span className="text-caption font-bold text-slate-500 uppercase">Select all</span>
            </div>

            <div className="space-y-2">
              {selectedEmployeeAbsences.records.map(r => (
                <div key={r.id} className={`border rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap ${selectedIds.has(r.id) ? 'bg-rose-50/50 border-rose-200' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => handleToggleOne(r.id)}
                      className="accent-rose-600 h-3.5 w-3.5 cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-mono font-bold text-slate-700">{r.date}</p>
                      <AbsenceReasonLabel r={r} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-rose-600">{formatMoney(effectiveDeductionAmount(r), 'Pakistan')}</span>
                    {r.acknowledged
                      ? <Badge variant="success">Seen</Badge>
                      : <Badge variant="warning">Pending</Badge>}
                    <button
                      onClick={() => handleDeleteAbsenceRecord(r)}
                      title="Remove false absence record"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end border-t border-slate-100">
              <button
                onClick={() => setSelectedEmployeeAbsencesEmail(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDeleteRecord !== null}
        onClose={() => setPendingDeleteRecord(null)}
        onConfirm={confirmDeleteAbsenceRecord}
        title="Remove absence record?"
        message={pendingDeleteRecord ? `Remove absence record for ${pendingDeleteRecord.employeeName} on ${pendingDeleteRecord.date}? This will remove the 2-days' pay deduction penalty.` : ''}
        confirmLabel={deletingRecordId === pendingDeleteRecord?.id ? 'Removing…' : 'Remove'}
        variant="danger"
        loading={deletingRecordId === pendingDeleteRecord?.id}
      />

      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={confirmBulkDelete}
        title="Remove selected absence records?"
        message={`Remove ${selectedIds.size} absence record${selectedIds.size > 1 ? 's' : ''} and reverse ${formatMoney(filteredAbsences.filter(r => selectedIds.has(r.id)).reduce((s, r) => s + effectiveDeductionAmount(r), 0), 'Pakistan')} in deductions? This cannot be undone.`}
        confirmLabel={bulkDeleting ? 'Removing…' : 'Remove'}
        variant="danger"
        loading={bulkDeleting}
      />
    </div>
  );
}

