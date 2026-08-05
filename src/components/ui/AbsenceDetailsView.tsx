'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { hrActions, AbsenceRecord, useTimesheets, useProfiles, formatMoney, localShiftDate, displayName } from '@/lib/hrData';
import { UserX, Clock, CalendarX2, CheckCircle2, Trash2, Calendar, Search, Filter, UserCheck } from 'lucide-react';
import { formatTimeNY } from '@/lib/timezone';

interface AbsenceDetailsViewProps {
  role: 'employee' | 'hr' | 'admin';
  filterEmail?: string;
}

export function AbsenceDetailsView({ role, filterEmail }: AbsenceDetailsViewProps) {
  const [activeTab, setActiveTab] = useState<'attendance' | 'absences'>('attendance');
  const [absenceRecords, setAbsenceRecords] = useState<AbsenceRecord[]>([]);
  const [loadingAbsences, setLoadingAbsences] = useState(true);

  const { data: allTimesheets = [], isLoading: loadingTimesheets } = useTimesheets();
  const { data: allProfiles = [] } = useProfiles();

  // Date Filter States (defaults to empty -> all dates)
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

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
    loadAbsenceRecords();
  };

  // Filter timesheets for the attendance view
  const filteredTimesheets = useMemo(() => {
    let list = allTimesheets;
    if (role === 'employee' && filterEmail) {
      list = list.filter(t => t.employeeEmail.toLowerCase() === filterEmail.toLowerCase());
    }
    if (selectedDate) {
      list = list.filter(t => localShiftDate(t.clockIn, t.date) === selectedDate);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.employeeEmail.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (b.clockIn || '').localeCompare(a.clockIn || ''));
  }, [allTimesheets, role, filterEmail, selectedDate, searchQuery]);

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
            Attendance Logs ({filteredTimesheets.length})
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
          ) : filteredTimesheets.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <UserCheck className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No shift attendance logs found</p>
              <p className="text-xs text-slate-400">
                {selectedDate ? `No shifts recorded for ${selectedDate}.` : 'No shifts have been clocked in yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="text-left px-5 py-3 font-bold">Shift Date</th>
                      {role !== 'employee' && <th className="text-left px-5 py-3 font-bold">Employee</th>}
                      <th className="text-left px-5 py-3 font-bold">Clock In</th>
                      <th className="text-left px-5 py-3 font-bold">Clock Out</th>
                      <th className="text-right px-5 py-3 font-bold">Duration</th>
                      <th className="text-center px-5 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTimesheets.map(t => {
                      const empProfile = allProfiles.find(p => p.email.toLowerCase() === t.employeeEmail.toLowerCase());
                      const empName = empProfile ? displayName(empProfile, 'hr') : t.employeeEmail;
                      const shiftDateStr = localShiftDate(t.clockIn, t.date);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-3 font-mono font-bold text-slate-700">{shiftDateStr}</td>
                          {role !== 'employee' && (
                            <td className="px-5 py-3">
                              <p className="font-bold text-slate-900">{empName}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{t.employeeEmail}</p>
                            </td>
                          )}
                          <td className="px-5 py-3 font-mono text-slate-600">{t.clockIn ? formatTimeNY(t.clockIn) : '—'}</td>
                          <td className="px-5 py-3 font-mono text-slate-600">{t.clockOut ? formatTimeNY(t.clockOut) : '—'}</td>
                          <td className="px-5 py-3 text-right font-bold text-slate-900">{t.duration || 'In Progress'}</td>
                          <td className="px-5 py-3 text-center">
                            <Badge variant={t.clockOut ? 'success' : 'warning'}>
                              {t.clockOut ? 'Completed' : 'On Shift'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards Stack */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredTimesheets.map(t => {
                  const empProfile = allProfiles.find(p => p.email.toLowerCase() === t.employeeEmail.toLowerCase());
                  const empName = empProfile ? displayName(empProfile, 'hr') : t.employeeEmail;
                  const shiftDateStr = localShiftDate(t.clockIn, t.date);
                  return (
                    <div key={t.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-slate-800">{shiftDateStr}</p>
                        <Badge variant={t.clockOut ? 'success' : 'warning'}>
                          {t.clockOut ? 'Completed' : 'On Shift'}
                        </Badge>
                      </div>
                      {role !== 'employee' && <p className="text-xs font-bold text-slate-900">{empName}</p>}
                      <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Clock In / Out</p>
                          <p className="font-mono font-medium text-slate-700">
                            {t.clockIn ? formatTimeNY(t.clockIn) : '—'} → {t.clockOut ? formatTimeNY(t.clockOut) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Duration</p>
                          <p className="font-bold text-slate-900">{t.duration || 'In Progress'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
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
                        <tr key={r.id} className="hover:bg-slate-50/50">
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
                    <div key={r.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-xs font-bold text-slate-800">{r.date}</p>
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

