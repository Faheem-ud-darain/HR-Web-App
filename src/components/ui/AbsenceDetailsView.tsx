'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { hrActions, AbsenceRecord, useTimesheets, useProfiles, formatMoney, localShiftDate, displayName } from '@/lib/hrData';
import { UserX, Clock, CalendarX2, CheckCircle2, Trash2, Calendar, Search, Filter, UserCheck, ShieldX } from 'lucide-react';
import { formatTimeNY } from '@/lib/timezone';


interface AbsenceDetailsViewProps {
  role: 'employee' | 'hr' | 'admin';
  filterEmail?: string;
}

export function AbsenceDetailsView({ role, filterEmail }: AbsenceDetailsViewProps) {
  const [activeTab, setActiveTab] = useState<'attendance' | 'absences'>('attendance');
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceRecord[]>([]);
  const [loadingAbsences, setLoadingAbsences] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: allTimesheets = [], isLoading: loadingTimesheets } = useTimesheets();
  const { data: allProfiles = [] } = useProfiles();

  // Date Filter States (defaults to empty -> all dates)
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [selectedAttendanceRow, setSelectedAttendanceRow] = useState<{
    employeeEmail: string;
    employeeName: string;
    date: string;
    shifts: typeof allTimesheets;
    totalMinutes: number;
    hasActiveShift: boolean;
  } | null>(null);

  const loadAbsenceRecords = () => {
    hrActions.getAbsenceRecords().then(all => {
      const scoped = role === 'employee' && filterEmail
        ? all.filter(a => a.employeeEmail.toLowerCase() === filterEmail.toLowerCase())
        : all;
      setAbsenceRecords([...scoped].sort((a, b) => b.date.localeCompare(a.date)));
      setLoadingAbsences(false);
    });
  };

  useEffect(() => {
    loadAbsenceRecords();
  }, [role, filterEmail]);

  const handleDeleteAbsenceRecord = async (record: AbsenceRecord) => {
    const confirmDelete = window.confirm(`Remove absence record for ${record.employeeName} on ${record.date}? This will remove the 2-days' pay deduction penalty.`);
    if (!confirmDelete) return;
    await hrActions.deleteAbsenceRecord(record.id);
    setSelectedIds(prev => { const next = new Set(prev); next.delete(record.id); return next; });
    loadAbsenceRecords();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const total = filteredAbsences.filter(r => selectedIds.has(r.id)).reduce((s, r) => s + r.deductionAmount, 0);
    const confirmed = window.confirm(
      `Remove ${selectedIds.size} absence record${selectedIds.size > 1 ? 's' : ''} and reverse ${formatMoney(total, 'Pakistan')} in deductions? This cannot be undone.`
    );
    if (!confirmed) return;
    setBulkDeleting(true);
    try {
      await hrActions.bulkDeleteAbsenceRecords(Array.from(selectedIds));
      setSelectedIds(new Set());
      loadAbsenceRecords();
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleToggleAll = () => {
    if (selectedIds.size === filteredAbsences.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAbsences.map(r => r.id)));
    }
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

    const groupedMap = new Map<string, {
      employeeEmail: string;
      employeeName: string;
      date: string;
      shifts: typeof allTimesheets;
      totalMinutes: number;
      hasActiveShift: boolean;
    }>();

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
        const end = t.clockOut ? new Date(t.clockOut).getTime() : Date.now();
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

    return Array.from(groupedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [allTimesheets, allProfiles, role, filterEmail, selectedDate, searchQuery]);

  // Filter absence records by date and query
  const filteredAbsences = useMemo(() => {
    let list = absenceRecords;
    if (selectedDate) {
      list = list.filter(a => a.date === selectedDate);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a => a.employeeName.toLowerCase().includes(q) || a.employeeEmail.toLowerCase().includes(q));
    }
    return list;
  }, [absenceRecords, selectedDate, searchQuery]);

  const totalDeducted = filteredAbsences.reduce((acc, r) => acc + r.deductionAmount, 0);

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
        <div className="flex bg-slate-100 p-1 rounded-xl w-fit self-start md:self-auto border border-slate-200">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${activeTab === 'attendance' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <UserCheck className="h-4 w-4 text-emerald-600" />
            Attendance Logs ({cumulativeAttendanceRows.length})
          </button>
          <button
            onClick={() => setActiveTab('absences')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-2 ${activeTab === 'absences' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <UserX className="h-4 w-4 text-rose-600" />
            Absence Deductions ({filteredAbsences.length})
          </button>
        </div>
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
              <label htmlFor="attendance-date-filter" className="text-[10px] font-bold text-slate-500 uppercase">Date:</label>
              <input
                id="attendance-date-filter"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer"
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="text-[10px] font-bold text-rose-600 hover:underline ml-1"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Email Search Filter (HR/Admin) */}
            {role !== 'employee' && (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl min-w-[200px]">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent text-xs text-slate-800 outline-none w-full placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600 text-xs">×</button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ATTENDANCE TAB */}
      {activeTab === 'attendance' && (
        <Card className="border border-slate-200 overflow-hidden p-0 bg-white">
          {loadingTimesheets ? (
            <div className="py-16 text-center text-xs font-semibold text-slate-400">Loading attendance records…</div>
          ) : cumulativeAttendanceRows.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <UserCheck className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No shift attendance records found</p>
              <p className="text-xs text-slate-400">
                {selectedDate ? `No attendance recorded for ${selectedDate}.` : 'No shifts have been clocked in yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="text-left px-5 py-3 font-bold">Date</th>
                      {role !== 'employee' && <th className="text-left px-5 py-3 font-bold">Employee</th>}
                      <th className="text-center px-5 py-3 font-bold">Total Shifts</th>
                      <th className="text-right px-5 py-3 font-bold">Total Worked Time</th>
                      <th className="text-center px-5 py-3 font-bold">Attendance Status</th>
                      <th className="text-center px-5 py-3 font-bold">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cumulativeAttendanceRows.map(row => {
                      const hours = Math.floor(row.totalMinutes / 60);
                      const mins = row.totalMinutes % 60;
                      const formattedDuration = `${hours}h ${mins}m`;

                      return (
                        <tr key={`${row.employeeEmail}_${row.date}`} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 font-mono font-bold text-slate-700">{row.date}</td>
                          {role !== 'employee' && (
                            <td className="px-5 py-3">
                              <p className="font-bold text-slate-900">{row.employeeName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{row.employeeEmail}</p>
                            </td>
                          )}
                          <td className="px-5 py-3 text-center font-semibold text-slate-700">{row.shifts.length} shift{row.shifts.length > 1 ? 's' : ''}</td>
                          <td className="px-5 py-3 text-right font-bold text-slate-900">{formattedDuration}</td>
                          <td className="px-5 py-3 text-center">
                            {row.hasActiveShift ? (
                              <Badge variant="warning">On Shift</Badge>
                            ) : row.totalMinutes >= 480 ? (
                              <Badge variant="success">Present (Full Day)</Badge>
                            ) : (
                              <Badge variant="default">Present ({formattedDuration})</Badge>
                            )}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <button
                              onClick={() => setSelectedAttendanceRow(row)}
                              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition-colors inline-flex items-center gap-1"
                            >
                              View Breakdown
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards Stack */}
              <div className="md:hidden divide-y divide-slate-100">
                {cumulativeAttendanceRows.map(row => {
                  const hours = Math.floor(row.totalMinutes / 60);
                  const mins = row.totalMinutes % 60;
                  const formattedDuration = `${hours}h ${mins}m`;

                  return (
                    <div key={`${row.employeeEmail}_${row.date}`} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-slate-800">{row.date}</p>
                        {row.hasActiveShift ? (
                          <Badge variant="warning">On Shift</Badge>
                        ) : row.totalMinutes >= 480 ? (
                          <Badge variant="success">Present (Full Day)</Badge>
                        ) : (
                          <Badge variant="default">Present ({formattedDuration})</Badge>
                        )}
                      </div>
                      {role !== 'employee' && <p className="text-xs font-bold text-slate-900">{row.employeeName}</p>}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Total Time ({row.shifts.length} shift{row.shifts.length > 1 ? 's' : ''})</p>
                          <p className="font-bold text-slate-900">{formattedDuration}</p>
                        </div>
                        <button
                          onClick={() => setSelectedAttendanceRow(row)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors"
                        >
                          View Breakdown
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
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
                  <p className="text-[10px] font-bold uppercase text-slate-400">Total Worked Time</p>
                  <p className="text-sm font-bold text-slate-900">
                    {Math.floor(selectedAttendanceRow.totalMinutes / 60)}h {selectedAttendanceRow.totalMinutes % 60}m
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Shift Count</p>
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
                        <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold">Clock In</span>
                        {s.clockIn ? formatTimeNY(s.clockIn) : '—'}
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold">Clock Out</span>
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
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Absences</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{filteredAbsences.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deducted</p>
                <p className="text-2xl font-bold text-rose-600 mt-1">{formatMoney(totalDeducted, 'Pakistan')}</p>
              </CardContent>
            </Card>
            <Card className="col-span-2 md:col-span-1">
              <CardContent className="pt-5 pb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inactivity vs No-Show</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">
                  {filteredAbsences.filter(r => r.reason === 'inactivity').length} / {filteredAbsences.filter(r => r.reason === 'no_clock_in').length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Bulk Action Bar — visible whenever HR/Admin has selected ≥1 record */}
          {role !== 'employee' && selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 mb-2">
              <div className="flex items-center gap-2">
                <ShieldX className="h-4 w-4 text-rose-600 shrink-0" />
                <span className="text-xs font-bold text-rose-800">
                  {selectedIds.size} record{selectedIds.size > 1 ? 's' : ''} selected
                  {' '}—{' '}
                  {formatMoney(
                    filteredAbsences.filter(r => selectedIds.has(r.id)).reduce((s, r) => s + r.deductionAmount, 0),
                    'Pakistan'
                  )}{' '}to reverse
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs font-bold text-rose-500 hover:text-rose-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {bulkDeleting ? 'Removing…' : `Remove ${selectedIds.size} Record${selectedIds.size > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          <Card className="border border-slate-200 overflow-hidden p-0 bg-white">
            {loadingAbsences ? (
              <div className="py-16 text-center text-xs font-semibold text-slate-400">Loading absence records…</div>
            ) : filteredAbsences.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <UserX className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No absence records found</p>
                <p className="text-xs text-slate-400">
                  {selectedDate ? `No absence records for ${selectedDate}.` : 'No employees have been marked absent.'}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        {role !== 'employee' && (
                          <th className="px-5 py-3">
                            <input
                              type="checkbox"
                              checked={filteredAbsences.length > 0 && selectedIds.size === filteredAbsences.length}
                              onChange={handleToggleAll}
                              className="accent-rose-600 h-3.5 w-3.5 cursor-pointer"
                              title="Select all"
                            />
                          </th>
                        )}
                        <th className="text-left px-5 py-3 font-bold">Date</th>
                        {role !== 'employee' && <th className="text-left px-5 py-3 font-bold">Employee</th>}
                        <th className="text-left px-5 py-3 font-bold">Reason</th>
                        <th className="text-right px-5 py-3 font-bold">Deduction</th>
                        <th className="text-center px-5 py-3 font-bold">Acknowledged</th>
                        {role !== 'employee' && <th className="text-center px-5 py-3 font-bold">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAbsences.map(r => (
                        <tr key={r.id} className={`hover:bg-slate-50/50 ${selectedIds.has(r.id) ? 'bg-rose-50/50' : ''}`}>
                          {role !== 'employee' && (
                            <td className="px-5 py-3">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(r.id)}
                                onChange={() => handleToggleOne(r.id)}
                                className="accent-rose-600 h-3.5 w-3.5 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="px-5 py-3 font-mono font-bold text-slate-700">{r.date}</td>
                          {role !== 'employee' && <td className="px-5 py-3 font-semibold text-slate-800">{r.employeeName}</td>}
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-1.5 text-slate-700">
                              {r.reason === 'inactivity' ? <Clock className="h-3.5 w-3.5 text-amber-500" /> : <CalendarX2 className="h-3.5 w-3.5 text-rose-500" />}
                              {r.reason === 'inactivity' ? `Inactive ${r.inactivityMinutes} min during shift` : 'Did not start a shift'}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-bold text-rose-600">{formatMoney(r.deductionAmount, 'Pakistan')}</td>
                          <td className="px-5 py-3 text-center">
                            {r.acknowledged
                              ? <Badge variant="success"><span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Seen</span></Badge>
                              : <Badge variant="warning">Pending</Badge>}
                          </td>
                          {role !== 'employee' && (
                            <td className="px-5 py-3 text-center">
                              <button
                                onClick={() => handleDeleteAbsenceRecord(r)}
                                title="Remove false absence record"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredAbsences.map(r => (
                    <div key={r.id} className={`p-4 space-y-2 ${selectedIds.has(r.id) ? 'bg-rose-50/40' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {role !== 'employee' && (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(r.id)}
                              onChange={() => handleToggleOne(r.id)}
                              className="accent-rose-600 h-3.5 w-3.5 cursor-pointer"
                            />
                          )}
                          <p className="font-mono text-xs font-bold text-slate-800">{r.date}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.acknowledged
                            ? <Badge variant="success">Seen</Badge>
                            : <Badge variant="warning">Pending</Badge>}
                          {role !== 'employee' && (
                            <button
                              onClick={() => handleDeleteAbsenceRecord(r)}
                              className="p-1 text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      {role !== 'employee' && <p className="text-sm font-bold text-slate-900">{r.employeeName}</p>}
                      <p className="text-xs text-slate-600 inline-flex items-center gap-1.5">
                        {r.reason === 'inactivity' ? <Clock className="h-3.5 w-3.5 text-amber-500" /> : <CalendarX2 className="h-3.5 w-3.5 text-rose-500" />}
                        {r.reason === 'inactivity' ? `Inactive ${r.inactivityMinutes} min during shift` : 'Did not start a shift'}
                      </p>
                      <p className="text-xs font-bold text-rose-600">{formatMoney(r.deductionAmount, 'Pakistan')} deducted</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

