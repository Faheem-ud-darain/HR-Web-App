'use client';

import { Input } from '@/components/ui/Input';
import { EmployeeFilterBar, useEmployeeFilters } from '@/components/ui/EmployeeFilterBar';
import { exportEmployeesCsv, exportTimesheetCsv } from '@/lib/reportExports';
import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Profile, formatMoney, TimesheetEntry, localShiftDate, useProfiles, useProfileDocuments, useTimesheets, displayName } from '@/lib/hrData';
import { FileTextIcon as FileText, DownloadSimpleIcon as Download, ClockIcon as Clock, TrendUpIcon as TrendingUp, CalendarBlankIcon as Calendar, BankIcon as Landmark } from '@/components/ui/icons';
import { UserProfileModal, DocumentsModal } from '@/components/ui/lazy';
import { Avatar } from '@/components/ui/Avatar';
import { formatTimeNY } from '@/lib/timezone';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableScroll, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { LoadMoreHistory } from '@/components/ui/LoadMoreHistory';
import { TableSkeletonRows, ListSkeleton } from '@/components/ui/Skeleton';
import { useSessionEmail } from '@/lib/useSession';
import { useNow } from '@/lib/useNow';

export default function ReportsPage() {
  const now = useNow(); // for the running total of still-open shifts (see lib/useNow.ts)
  const { data: employees = [], isLoading: profilesLoading, refetch: refetchProfiles } = useProfiles();
  const [historyDays, setHistoryDays] = useState(60);
  const { data: allTimesheets = [], isLoading: timesheetsLoading, isFetching: fetchingHistory } = useTimesheets({ days: historyDays });
  const [selectedReviewEmp, setSelectedReviewEmp] = useState<Profile | null>(null);
  const [reviewEntries, setReviewEntries] = useState<TimesheetEntry[]>([]);
  const [dateFilter, setDateFilter] = useState('');

  const [selectedProfileEmail, setSelectedProfileEmail] = useState<string | null>(null);
  const currentUserEmail = useSessionEmail() || '';
  // Fetched on demand, only for whichever employee is currently selected
  // (see useProfileDocuments in hrData.ts).
  const [selectedDocsEmp, setSelectedDocsEmp] = useState<Profile | null>(null);
  const { data: selectedDocs } = useProfileDocuments(selectedDocsEmp?.id);

  const handleOpenReviewModal = (emp: Profile) => {
    setSelectedReviewEmp(emp);
    setDateFilter('');

    const entries = allTimesheets
      .filter((t) => t.employeeEmail.toLowerCase() === emp.email.toLowerCase())
      .sort((a, b) => (b.clockIn || '').localeCompare(a.clockIn || ''));
    setReviewEntries(entries);
  };

  // The HR report covers staff below HR/Admin only (the Admin report keeps the full roster).
  const reportable = useMemo(() => employees.filter(e => e.role !== 'admin' && e.role !== 'hr'), [employees]);
  const filters = useEmployeeFilters(reportable);
  const filteredEmployees = filters.rows;

  const filteredReviewEntries = reviewEntries.filter(entry => {
    if (!dateFilter) return true;
    return entry.date?.includes(dateFilter);
  });

  // Summary stats for the modal. Computed directly from each entry's real
  // clockIn/clockOut timestamps (not by re-parsing the stored `duration`
  // string with a regex) — a shift that crosses midnight still has a
  // perfectly ordinary millisecond difference between two real Date
  // objects, so this is unaffected by the calendar date rolling over.
  // Still-open shifts count their elapsed time up to now, matching the live
  // ticker shown elsewhere instead of being silently excluded from the total.
  const totalHours = filteredReviewEntries.reduce((acc, e) => {
    if (!e.clockIn) return acc;
    const start = new Date(e.clockIn).getTime();
    const end = e.clockOut ? new Date(e.clockOut).getTime() : (now || start);
    const minutes = Math.max(0, Math.round((end - start) / 60000));
    return acc + minutes;
  }, 0);
  const completedShifts = filteredReviewEntries.filter(e => e.status === 'completed').length;
  const openShifts = filteredReviewEntries.filter(e => e.status === 'in_progress').length;

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employee Master Report</h1>
          <p className="text-slate-500">Comprehensive overview of profiles, localized salaries, and banking credentials.</p>
        </div>
        <Button variant="success" onClick={() => exportEmployeesCsv(filteredEmployees)} className="self-start md:self-auto"><Download className="h-4 w-4" /> Export Report (CSV)</Button>
      </div>

      <LoadMoreHistory days={historyDays} maxDays={365} loading={fetchingHistory} noun="shifts" onLoadMore={() => setHistoryDays(d => d + 60)} />

      {/* Filters row */}
      <EmployeeFilterBar filters={filters} />

      <Card className="overflow-hidden p-0 border border-slate-200">
        <TableScroll hideOnMobile>
          <Table minWidth={950}>
            <THead>
              <tr>
                <Th>Employee</Th>
                <Th>Region</Th>
                <Th>Base Salary</Th>
                <Th>Onboarding</Th>
                <Th>Bank Details</Th>
                <Th align="center">Quick Actions</Th>
              </tr>
            </THead>
            <TBody className="bg-white">
{profilesLoading ? (
  <TableSkeletonRows rows={8} cols={6} />
) : (
<>
              {filteredEmployees.map((emp) => (
                <Tr key={emp.id}>
                  <Td className="cursor-pointer hover:bg-slate-100/70" onClick={() => setSelectedProfileEmail(emp.email)}>
                    <div className="flex items-center gap-3">
                      <Avatar src={emp.profilePicture} name={emp.fullName} size={40} />
                      <div>
                        <div className="font-semibold text-slate-900">{displayName(emp, 'hr')}</div>
                        <div className="text-xs text-slate-400">{emp.email} · <span className="font-bold text-orange-600">{emp.jobTitle || 'Staff'}</span></div>
                      </div>
                    </div>
                  </Td>
                  <Td className="font-semibold text-slate-700">{emp.region || 'Pakistan'}</Td>
                  <Td className="font-bold text-slate-900">{formatMoney(emp.baseSalary, emp.region)}</Td>
                  <Td>
                    <Badge variant={emp.onboardingCompleted ? 'success' : 'warning'}>
                      {emp.onboardingCompleted ? 'Completed' : 'Pending'}
                    </Badge>
                  </Td>
                  <Td>
                    {emp.bankName ? (
                      <div className="text-xs text-slate-600 leading-relaxed font-semibold">
                        <div className="flex items-center gap-1"><Landmark className="h-3.5 w-3.5 text-slate-400" /> <span className="text-slate-900">{emp.bankName}</span></div>
                        <div>Acc: <span className="text-slate-500 font-medium">{emp.accountNumber}</span></div>
                        <div>IBAN: <span className="text-slate-600 font-mono text-caption">{emp.iban}</span></div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-semibold italic">Details pending</span>
                    )}
                  </Td>
                  <Td align="center">
                    <div className="flex flex-col sm:flex-row justify-center gap-2">
                      <Button variant="secondary" size="xs" onClick={() => handleOpenReviewModal(emp)} className="gap-1.5"><FileText className="h-3.5 w-3.5" /> View Shift Logs</Button>
                      <Button variant="softIndigo" size="xs" onClick={() => setSelectedDocsEmp(emp)} className="gap-1.5"><Download className="h-3.5 w-3.5" /> Documents</Button>
                    </div>
                  </Td>
                </Tr>
              ))}
              {filteredEmployees.length === 0 && (
                <Tr>
                  <EmptyState as="td" colSpan={6} py={12}>
                    No employees matching the criteria found.
                  </EmptyState>
                </Tr>
              )}
            </>
)}
</TBody>
          </Table>
        </TableScroll>
        
        {/* Mobile card stack */}
        <div className="md:hidden space-y-3 p-4">
          {filteredEmployees.map((emp) => (
            <div key={emp.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-2" onClick={() => setSelectedProfileEmail(emp.email)}>
                <div className="flex items-center gap-3">
                  <Avatar src={emp.profilePicture} name={emp.fullName} size={40} />
                  <div>
                    <div className="font-semibold text-slate-900 text-sm">{displayName(emp, 'hr')}</div>
                    <div className="text-caption text-slate-400">{emp.email}</div>
                  </div>
                </div>
                <Badge variant={emp.onboardingCompleted ? 'success' : 'warning'} className="shrink-0">
                  {emp.onboardingCompleted ? 'Completed' : 'Pending'}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-caption text-slate-400 font-semibold uppercase">Role & Region</p>
                  <p className="text-xs font-semibold text-slate-800"><span className="text-orange-600">{emp.jobTitle || 'Staff'}</span> · {emp.region || 'Pakistan'}</p>
                </div>
                <div>
                  <p className="text-caption text-slate-400 font-semibold uppercase">Base Salary</p>
                  <p className="text-xs font-bold text-slate-900">{formatMoney(emp.baseSalary, emp.region)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-caption text-slate-400 font-semibold uppercase">Bank Details</p>
                  {emp.bankName ? (
                    <div className="text-caption text-slate-600 leading-relaxed font-semibold">
                      <div className="flex items-center gap-1"><Landmark className="h-3.5 w-3.5 text-slate-400" /> <span className="text-slate-900">{emp.bankName}</span></div>
                      <div>Acc: <span className="text-slate-500 font-medium">{emp.accountNumber}</span></div>
                      <div>IBAN: <span className="text-slate-600 font-mono">{emp.iban}</span></div>
                    </div>
                  ) : (
                    <span className="text-caption text-slate-400 font-semibold italic">Details pending</span>
                  )}
                </div>
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-slate-100">
                <Button variant="secondary" size="sm" onClick={() => handleOpenReviewModal(emp)} className="flex-1 gap-1.5"><FileText className="h-3.5 w-3.5" /> View Shift Logs</Button>
                <Button variant="softIndigo" size="sm" onClick={() => setSelectedDocsEmp(emp)} className="flex-1 gap-1.5"><Download className="h-3.5 w-3.5" /> Documents</Button>
              </div>
            </div>
          ))}
          {profilesLoading && <ListSkeleton rows={3} />}
          {!profilesLoading && filteredEmployees.length === 0 && (
            <EmptyState py={8} size="sm">
              No employees matching the criteria found.
            </EmptyState>
          )}
        </div>
      </Card>

      {/* Tracking Viewer Modal */}
      {selectedReviewEmp && (
        <Modal isOpen onClose={() => { setSelectedReviewEmp(null); setReviewEntries([]); }} title="Employee Tracking History" className="md:max-w-4xl">
          <div className="space-y-5 pt-1 font-sans">

            {/* Employee info header */}
            <div className="flex justify-between items-start bg-slate-50 p-4 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-3">
                <Avatar src={selectedReviewEmp.profilePicture} name={selectedReviewEmp.fullName} size={40} />
                <div>
                  <p className="text-sm font-bold text-slate-900">{displayName(selectedReviewEmp, 'hr')}</p>
                  <p className="text-caption text-slate-400 font-bold">{selectedReviewEmp.email} · {selectedReviewEmp.jobTitle || 'Staff'}</p>
                </div>
              </div>
              <Badge variant={selectedReviewEmp.region === 'USA' ? 'default' : 'success'}>
                {selectedReviewEmp.region === 'USA' ? 'USA Operations' : 'Pakistan Remote'}
              </Badge>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                <Clock className="h-4 w-4 text-indigo-500 mx-auto mb-1" />
                <p className="text-lg font-bold text-indigo-900">{Math.floor(totalHours / 60)}h {totalHours % 60}m</p>
                <p className="text-caption font-bold text-indigo-600 uppercase tracking-wider">Total Time {dateFilter ? '(Filtered)' : `(All ${filteredReviewEntries.length} Shifts)`}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                <TrendingUp className="h-4 w-4 text-emerald-500 mx-auto mb-1" />
                <p className="text-lg font-bold text-emerald-900">{completedShifts}{openShifts > 0 ? ` (+${openShifts} live)` : ''}</p>
                <p className="text-caption font-bold text-emerald-600 uppercase tracking-wider">Completed Shifts</p>
              </div>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                <Calendar className="h-4 w-4 text-orange-500 mx-auto mb-1" />
                <p className="text-lg font-bold text-orange-900">{filteredReviewEntries.length}</p>
                <p className="text-caption font-bold text-orange-600 uppercase tracking-wider">Total Shifts</p>
              </div>
            </div>

            {/* Date filter + CSV export */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input type="text" placeholder="Filter by date (e.g. 2026-07-06 or 'Today')" value={dateFilter} onChange={e => setDateFilter(e.target.value)} fieldSize="sm" className="pl-9" />
              </div>
              <Button variant="success" size="sm" onClick={() => selectedReviewEmp && exportTimesheetCsv(selectedReviewEmp, filteredReviewEntries)} disabled={filteredReviewEntries.length === 0} className="whitespace-nowrap"><Download className="h-3.5 w-3.5" /> Export CSV</Button>
            </div>

            {/* Sessions Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Session History</h4>
                <span className="text-caption font-bold text-slate-400">{filteredReviewEntries.length} record{filteredReviewEntries.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <Table density="compact" size="xs" minWidth={500}>
                  <THead className="bg-slate-50/80 sticky top-0">
                    <tr>
                      <Th>Date</Th>
                      <Th>Clock In</Th>
                      <Th>Clock Out</Th>
                      <Th align="right">Duration</Th>
                      <Th align="right">Status</Th>
                    </tr>
                  </THead>
                  <TBody>
{timesheetsLoading ? (
  <TableSkeletonRows rows={8} cols={7} />
) : (
<>
                    {filteredReviewEntries.map((entry) => (
                      <Tr key={entry.id}>
                        <Td className="font-bold text-slate-700">{localShiftDate(entry.clockIn, entry.date)}</Td>
                        <Td className="font-mono text-slate-500 text-caption">{entry.clockIn ? formatTimeNY(entry.clockIn) : '—'}</Td>
                        <Td className="font-mono text-slate-500 text-caption">{entry.clockOut ? formatTimeNY(entry.clockOut) : '—'}</Td>
                        <Td align="right" className="font-bold text-slate-900">{entry.duration || '—'}</Td>
                        <Td align="right">
                          <Badge variant={entry.status === 'in_progress' ? 'warning' : 'success'}>
                            {entry.status === 'in_progress' ? 'On Shift' : 'Completed'}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                    {filteredReviewEntries.length === 0 && (
                      <Tr>
                        <EmptyState as="td" colSpan={5} py={8}>
                          {reviewEntries.length === 0 ? 'No shifts recorded yet.' : 'No shifts match the date filter.'}
                        </EmptyState>
                      </Tr>
                    )}
                  </>
)}
</TBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => { setSelectedReviewEmp(null); setReviewEntries([]); }}
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {selectedProfileEmail && (
        <UserProfileModal
          isOpen={!!selectedProfileEmail}
          onClose={() => setSelectedProfileEmail(null)}
          employeeEmail={selectedProfileEmail}
          currentUserRole="hr"
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


