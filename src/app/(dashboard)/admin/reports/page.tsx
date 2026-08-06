'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Profile, formatMoney, TimesheetEntry, hrActions, localShiftDate, useProfiles, useProfileDocuments, useWarehouses, useTimesheets, displayName } from '@/lib/hrData';
import { getSessionEmail } from '@/lib/session';
import { FileText, Search, Filter, ShieldCheck, Download, MapPin, Edit2, Monitor, Landmark, Loader2 } from 'lucide-react';
import { UserProfileModal } from '@/components/ui/UserProfileModal';
import { DocumentsModal } from '@/components/ui/DocumentsModal';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimeNY } from '@/lib/timezone';

export default function ReportsPage() {
  const { data: employees = [], refetch: refetchProfiles } = useProfiles();
  const { data: warehouses = [] } = useWarehouses();
  const { data: timesheets = [] } = useTimesheets();
  const [regionFilter, setRegionFilter] = useState<'All' | 'USA' | 'Pakistan'>('All');
  const [onboardingFilter, setOnboardingFilter] = useState<'All' | 'Completed' | 'Pending'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Assignment Modal states
  const [selectedEmp, setSelectedEmp] = useState<Profile | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<'USA' | 'Pakistan'>('Pakistan');
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([]);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [exemptFromAbsenceCheck, setExemptFromAbsenceCheck] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);

  // Timesheet Review states
  const [selectedReviewEmp, setSelectedReviewEmp] = useState<Profile | null>(null);
  const [reviewEntries, setReviewEntries] = useState<TimesheetEntry[]>([]);

  // Profile modal states
  const [selectedProfileEmail, setSelectedProfileEmail] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  // Documents modal state — fetched on demand, only for whichever employee
  // is currently selected (see useProfileDocuments in hrData.ts).
  const [selectedDocsEmp, setSelectedDocsEmp] = useState<Profile | null>(null);
  const { data: selectedDocs } = useProfileDocuments(selectedDocsEmp?.id);

  useEffect(() => {
    const email = getSessionEmail();
    if (email) setCurrentUserEmail(email);
  }, []);

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (emp.jobTitle && emp.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRegion = regionFilter === 'All' ? true : emp.region === regionFilter;

    const matchesOnboarding = onboardingFilter === 'All' ? true :
      onboardingFilter === 'Completed' ? emp.onboardingCompleted : !emp.onboardingCompleted;

    return matchesSearch && matchesRegion && matchesOnboarding;
  });

  const exportCSV = () => {
    const headers = ['Full Name', 'Email', 'Role', 'Region', 'Bank Name', 'Account Number', 'IBAN', 'Onboarding Status', 'Base Salary'];
    const rows = filteredEmployees.map(emp => [
      emp.fullName,
      emp.email,
      emp.jobTitle || 'Employee',
      emp.region || 'Pakistan',
      emp.bankName || 'N/A',
      emp.accountNumber || 'N/A',
      emp.iban || 'N/A',
      emp.onboardingCompleted ? 'Completed' : 'Pending',
      formatMoney(emp.baseSalary, emp.region)
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DelCargo_Employee_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenAssignModal = (emp: Profile) => {
    setSelectedEmp(emp);
    setSelectedRegion(emp.region || 'Pakistan');
    setSelectedWarehouses(emp.assignedWarehouses || []);
    setTrackingEnabled(!!emp.trackingEnabled);
    setExemptFromAbsenceCheck(!!emp.exemptFromAbsenceCheck);
  };

  const handleToggleWarehouse = (whId: string) => {
    setSelectedWarehouses(prev =>
      prev.includes(whId) ? prev.filter(id => id !== whId) : [...prev, whId]
    );
  };

  const handleSaveAssignment = async () => {
    if (!selectedEmp || isSavingAssignment) return;

    setIsSavingAssignment(true);
    try {
      const assignedWh = selectedRegion === 'Pakistan' ? [] : selectedWarehouses;

      await hrActions.updateProfileDetails(selectedEmp.id, {
        region: selectedRegion,
        assignedWarehouses: assignedWh,
        trackingEnabled: trackingEnabled,
        exemptFromAbsenceCheck: exemptFromAbsenceCheck,
      });

      refetchProfiles();
      setSuccessMsg(`Successfully updated assignment for ${displayName(selectedEmp, 'admin')}`);
      setTimeout(() => {
        setSelectedEmp(null);
        setSuccessMsg('');
      }, 1500);
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleOpenReviewModal = (emp: Profile) => {
    setSelectedReviewEmp(emp);
    // Real, Supabase-synced shift history — visible regardless of which
    // device/region the employee actually clocked in from.
    const entries = timesheets
      .filter(t => t.employeeEmail.toLowerCase() === emp.email.toLowerCase())
      .sort((a, b) => (b.clockIn || '').localeCompare(a.clockIn || ''));
    setReviewEntries(entries);
  };

  const exportTrackingCSV = () => {
    if (!selectedReviewEmp) return;
    const headers = ['Date', 'Clock In', 'Clock Out', 'Duration', 'Status'];
    const rows = reviewEntries.map(e => [
      e.date || '',
      e.clockIn ? formatTimeNY(e.clockIn) : '—',
      e.clockOut ? formatTimeNY(e.clockOut) : '—',
      e.duration || '—',
      e.status === 'in_progress' ? 'On Shift' : 'Completed'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,'
      + [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `Tracking_${selectedReviewEmp.fullName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Master Report</h1>
          <p className="text-slate-500">CEO overview of all company profiles, localized payroll values, and onboarding details.</p>
        </div>
        <button
          onClick={exportCSV}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm active:scale-97 transition-colors transition-transform flex items-center gap-1.5 shadow-sm self-start md:self-auto"
        >
          <Download className="h-4 w-4" /> Export Report (CSV)
        </button>
      </div>

      {/* Filters row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 hover:bg-slate-50/70 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-lg py-2 pl-9 pr-3 text-xs outline-none text-slate-800 font-medium"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value as any)}
            className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-lg py-2 px-3 text-xs outline-none font-semibold text-slate-700 cursor-pointer"
          >
            <option value="All">All Regions</option>
            <option value="USA">USA Only</option>
            <option value="Pakistan">Pakistan (Remote)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={onboardingFilter}
            onChange={(e) => setOnboardingFilter(e.target.value as any)}
            className="w-full bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-lg py-2 px-3 text-xs outline-none font-semibold text-slate-700 cursor-pointer"
          >
            <option value="All">All Onboarding Status</option>
            <option value="Completed">Completed Onboarding</option>
            <option value="Pending">Pending Onboarding</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <Card className="overflow-hidden p-0 border border-slate-200">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[950px] text-sm text-left border-collapse">
            <thead className="text-xs font-bold text-slate-600 bg-slate-50 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Region</th>
                <th className="px-6 py-4">Base Salary</th>
                <th className="px-6 py-4">Onboarding</th>
                <th className="px-6 py-4">Bank Details</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 cursor-pointer hover:bg-slate-100/70" onClick={() => setSelectedProfileEmail(emp.email)}>
                    <div className="flex items-center gap-3">
                      <Avatar src={emp.profilePicture} name={emp.fullName} size={28} />
                      <div>
                        <div className="font-semibold text-slate-900">{displayName(emp, 'admin')}</div>
                        <div className="text-xs text-slate-400">{emp.email} · <span className="font-bold text-orange-600">{emp.jobTitle || 'Staff'}</span></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-700">{emp.region || 'Pakistan'}</td>
                  <td className="px-6 py-4 font-bold text-slate-900">{formatMoney(emp.baseSalary, emp.region)}</td>
                  <td className="px-6 py-4">
                    <Badge variant={emp.onboardingCompleted ? 'success' : 'warning'}>
                      {emp.onboardingCompleted ? 'Completed' : 'Pending'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    {emp.bankName ? (
                      <div className="text-xs text-slate-600 leading-relaxed font-semibold">
                        <div className="flex items-center gap-1"><Landmark className="h-3 w-3 text-slate-400" /> <span className="text-slate-900">{emp.bankName}</span></div>
                        <div>Acc: <span className="text-slate-500 font-medium">{emp.accountNumber}</span></div>
                        <div>IBAN: <span className="text-slate-600 font-mono text-[10px]">{emp.iban}</span></div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-semibold italic">Details pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col sm:flex-row justify-center gap-2">
                      <button
                        onClick={() => handleOpenAssignModal(emp)}
                        className="text-[10px] font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
                      >
                        <MapPin className="h-3.5 w-3.5" /> Assignment
                      </button>
                      <button
                        onClick={() => handleOpenReviewModal(emp)}
                        className="text-[10px] font-bold text-slate-600 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
                      >
                        <FileText className="h-3.5 w-3.5" /> Review Tracker
                      </button>
                      <button
                        onClick={() => setSelectedDocsEmp(emp)}
                        className="text-[10px] font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1.5 rounded-lg active:scale-97 transition-colors transition-transform flex items-center gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" /> Documents
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold italic">
                    No employees matching the criteria found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="md:hidden space-y-3 p-4">
          {filteredEmployees.map((emp) => (
            <div key={emp.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedProfileEmail(emp.email)}>
                <Avatar src={emp.profilePicture} name={emp.fullName} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm truncate">{displayName(emp, 'admin')}</div>
                  <div className="text-[10px] text-slate-500 truncate">{emp.email}</div>
                </div>
                <Badge variant={emp.onboardingCompleted ? 'success' : 'warning'} className="shrink-0">
                  {emp.onboardingCompleted ? 'Completed' : 'Pending'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Role & Region</p>
                  <p className="text-xs font-bold text-slate-800">{emp.jobTitle || 'Staff'} · {emp.region || 'Pakistan'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Base Salary</p>
                  <p className="text-xs font-bold text-slate-800">{formatMoney(emp.baseSalary, emp.region)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase">Bank Details</p>
                  {emp.bankName ? (
                    <p className="text-xs font-medium text-slate-600 truncate">{emp.bankName} - {emp.accountNumber}</p>
                  ) : (
                    <p className="text-xs font-medium text-slate-400 italic">Details pending</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <button onClick={() => handleOpenAssignModal(emp)} className="flex-1 text-[10px] font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 py-2 rounded-lg flex items-center justify-center gap-1.5 active:scale-97 transition-colors transition-transform">
                  <MapPin className="h-3.5 w-3.5" /> Assign
                </button>
                <button onClick={() => handleOpenReviewModal(emp)} className="flex-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 py-2 rounded-lg flex items-center justify-center gap-1.5 active:scale-97 transition-colors transition-transform">
                  <FileText className="h-3.5 w-3.5" /> Tracker
                </button>
                <button onClick={() => setSelectedDocsEmp(emp)} className="flex-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 py-2 rounded-lg flex items-center justify-center gap-1.5 active:scale-97 transition-colors transition-transform">
                  <Download className="h-3.5 w-3.5" /> Docs
                </button>
              </div>
            </div>
          ))}
          {filteredEmployees.length === 0 && (
            <p className="py-8 text-center text-slate-400 font-semibold italic text-sm">
              No employees matching the criteria found.
            </p>
          )}
        </div>
      </Card>

      {/* Employee Region and Warehouse Assignment Modal */}
      {selectedEmp && (
        <Modal isOpen onClose={() => setSelectedEmp(null)} title="Modify Regional & Warehouse Assignment">
          <div className="space-y-4 pt-1 font-sans">
            {successMsg && (
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 p-2.5 rounded-lg text-xs font-semibold">
                {successMsg}
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500 font-semibold mb-1">Employee</p>
              <p className="text-sm font-bold text-slate-800">{displayName(selectedEmp, 'admin')} ({selectedEmp.email})</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-500 font-semibold">Select Region / Base Location</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRegion('Pakistan')}
                  className={`py-2 px-3 text-xs font-bold border rounded-lg transition-colors ${selectedRegion === 'Pakistan'
                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  Pakistan (Remote)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRegion('USA')}
                  className={`py-2 px-3 text-xs font-bold border rounded-lg transition-colors ${selectedRegion === 'USA'
                    ? 'border-orange-500 bg-orange-50 text-orange-600'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  USA
                </button>
              </div>
            </div>

            {selectedRegion === 'USA' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-semibold">Assign USA Warehouses (Geofence Access)</p>
                <div className="grid grid-cols-2 gap-2">
                  {warehouses.map(wh => {
                    const isChecked = selectedWarehouses.includes(wh.id);
                    return (
                      <label key={wh.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 p-2 rounded-lg cursor-pointer hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleWarehouse(wh.id)}
                          className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                        />
                        <span className="truncate" title={wh.name}>{wh.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Workstation Tracking Activation Switch */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer select-none bg-orange-50/40 border border-orange-100/50 p-3 rounded-xl hover:bg-orange-50/70 transition-colors">
                <input
                  type="checkbox"
                  checked={trackingEnabled}
                  onChange={(e) => setTrackingEnabled(e.target.checked)}
                  className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4 w-4"
                />
                <div>
                  <span className="text-slate-900 block font-bold text-[11px] uppercase tracking-wide">Enable Workstation Monitoring</span>
                  <span className="text-[10px] text-slate-400 font-medium leading-tight block mt-0.5">Activate screenshot captures, activity timeline logs, and active application checks.</span>
                </div>
              </label>
            </div>

            {/* Part-time / Absence Check Exempt Toggle */}
            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 cursor-pointer select-none bg-amber-50/40 border border-amber-100/50 p-3 rounded-xl hover:bg-amber-50/70 transition-colors">
                <input
                  type="checkbox"
                  checked={exemptFromAbsenceCheck}
                  onChange={(e) => setExemptFromAbsenceCheck(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400 h-4 w-4"
                />
                <div>
                  <span className="text-slate-900 block font-bold text-[11px] uppercase tracking-wide">Exempt from Absence Check</span>
                  <span className="text-[10px] text-slate-400 font-medium leading-tight block mt-0.5">Part-time or flexible-schedule employees will never be auto-marked absent. Existing false records must still be removed manually.</span>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                onClick={() => setSelectedEmp(null)}
                disabled={isSavingAssignment}
                className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAssignment}
                disabled={isSavingAssignment}
                className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-4 py-2 rounded-lg text-xs disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {isSavingAssignment && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isSavingAssignment ? 'Saving…' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Employee Activity & Timesheet Review Modal */}
      {selectedReviewEmp && (
        <Modal isOpen onClose={() => setSelectedReviewEmp(null)} title="Workstation Timesheet & Activity Review" className="md:max-w-3xl">
          <div className="space-y-6 pt-1 font-sans">
            <div className="flex justify-between items-start bg-slate-50 p-4 border border-slate-200 rounded-xl">
              <div>
                <p className="text-xs text-slate-500 font-semibold">Reviewing Employee</p>
                <p className="text-sm font-bold text-slate-900">{displayName(selectedReviewEmp, 'admin')}</p>
                <p className="text-[10px] text-slate-400 font-bold">{selectedReviewEmp.email} · {selectedReviewEmp.jobTitle || 'Staff'}</p>
              </div>
              <Badge variant={selectedReviewEmp.region === 'USA' ? 'default' : 'success'}>
                {selectedReviewEmp.region === 'USA' ? 'USA Operations' : 'Pakistan Remote'}
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Shift History (Manual + Geofenced)</h4>
                <button
                  onClick={exportTrackingCSV}
                  disabled={reviewEntries.length === 0}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-3 py-1.5 rounded-lg text-[10px] active:scale-97 transition-colors transition-transform shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="font-bold text-slate-600 bg-slate-50 border-b border-slate-200 uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Clock In</th>
                        <th className="px-4 py-2.5">Clock Out</th>
                        <th className="px-4 py-2.5 text-right">Duration</th>
                        <th className="px-4 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reviewEntries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-bold text-slate-700">{localShiftDate(entry.clockIn, entry.date)}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium font-mono text-[10px]">{entry.clockIn ? formatTimeNY(entry.clockIn) : '—'}</td>
                          <td className="px-4 py-3 text-slate-600 font-medium font-mono text-[10px]">{entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">{entry.duration || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                              {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {reviewEntries.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-400 font-semibold italic">No shifts recorded yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden space-y-3 p-4 bg-slate-50">
                  {reviewEntries.map((entry) => (
                    <div key={entry.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-700 text-xs">{localShiftDate(entry.clockIn, entry.date)}</span>
                        <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'} className="text-[9px]">
                          {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-slate-400 font-semibold block uppercase">Clock In</span>
                          <span className="font-mono text-slate-800 font-medium">{entry.clockIn ? formatTimeNY(entry.clockIn) : '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold block uppercase">Clock Out</span>
                          <span className="font-mono text-slate-800 font-medium">{entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}</span>
                        </div>
                        <div className="col-span-2 flex justify-between items-center pt-2 border-t border-slate-100">
                          <span className="text-slate-400 font-semibold uppercase">Duration</span>
                          <span className="font-bold text-slate-900 text-xs">{entry.duration || '—'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {reviewEntries.length === 0 && (
                    <p className="py-4 text-center text-slate-400 font-semibold italic text-xs">No shifts recorded yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Workspace Screenshots</h4>
              <div className="border border-slate-200 p-6 rounded-xl bg-slate-50/50 text-center space-y-2 font-sans">
                <Monitor className="h-6 w-6 text-slate-300 mx-auto" />
                <div>
                  <h5 className="text-xs font-bold text-slate-700">Managed from Screen Tracking</h5>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-semibold mt-1">
                    Enable tracking, set the capture interval, and browse/export this employee&apos;s screenshots from the Screen Tracking page in the sidebar.
                  </p>
                  <a
                    href="/admin/tracking"
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 mt-2"
                  >
                    Go to Screen Tracking →
                  </a>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button
                onClick={() => setSelectedReviewEmp(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-4 py-2 rounded-lg text-xs"
              >
                Close Logs
              </button>
            </div>
          </div>
        </Modal>
      )}

      {selectedProfileEmail && (
        <UserProfileModal
          isOpen={!!selectedProfileEmail}
          onClose={() => setSelectedProfileEmail(null)}
          employeeEmail={selectedProfileEmail}
          currentUserRole="admin"
          currentUserEmail={currentUserEmail}
          onUpdate={() => {
            refetchProfiles();
          }}
        />
      )}

      <DocumentsModal employee={selectedDocsEmp ? { ...selectedDocsEmp, ...selectedDocs } : null} onClose={() => setSelectedDocsEmp(null)} />
    </div>
  );
}
