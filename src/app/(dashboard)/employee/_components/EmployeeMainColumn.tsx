'use client';

import React from 'react';
import type { PayrollSelf } from '@/lib/hrData';
import { Card, CardContent } from '@/components/ui/Card';
import { getRemainingPTO, getPTOAccrualDate, getAccruedPTOForDisplay, formatMoney, Profile, LeaveApplication, Task } from '@/lib/hrData';
import { Clock, CheckCircle2, AlertTriangle, Calendar, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { TASK_PRIORITY_STYLES, TASK_STATUS_STYLES, TASK_STATUS_LABELS } from '@/components/ui/StatusBadges';
import { formatDateNY } from '@/lib/timezone';
import { TableScroll, Table, THead, Th, TBody, Tr, Td } from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';

interface EmployeeMainColumnProps {
  userProfile: Profile | null;
  allLeaves: LeaveApplication[] | undefined;
  tasksNeedingAttention: number;
  payrollSelf: PayrollSelf | null | undefined;
  myTasks: Task[];
  setSelectedTask: React.Dispatch<React.SetStateAction<Task | null>>;
  leaves: LeaveApplication[];
  searchQuery: string;
  getStatusBadge: (status: string) => React.JSX.Element;
}

export function EmployeeMainColumn({ userProfile, allLeaves, tasksNeedingAttention, payrollSelf, myTasks, setSelectedTask, leaves, searchQuery, getStatusBadge }: EmployeeMainColumnProps) {
  return (
    <div className="lg:col-span-8 space-y-6">
      
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Card className="col-span-1 sm:col-span-1 stagger-item" style={{ animationDelay: '0ms' }}>
          <CardContent className="pt-4 md:pt-5 px-3 md:px-5">
            <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-2">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Leave Balance</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-0.5 md:mt-1 tracking-tight">
                  {userProfile ? getRemainingPTO(allLeaves || [], userProfile.fullName, getPTOAccrualDate(userProfile)) : 0} <span className="text-xs md:text-base font-medium">Days</span>
                </p>
              </div>
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 self-end md:self-auto">
                <Clock className="h-4 w-4 md:h-5 md:w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-1 sm:col-span-1 stagger-item" style={{ animationDelay: '50ms' }}>
          <CardContent className="pt-4 md:pt-5 px-3 md:px-5">
            <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-2">
              <div>
                <p className="text-[10px] md:text-xs font-semibold text-slate-500">Accrued</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-0.5 md:mt-1 tracking-tight">
                  {userProfile ? getAccruedPTOForDisplay(getPTOAccrualDate(userProfile)) : 0} <span className="text-xs md:text-base font-medium">Days</span>
                </p>
              </div>
              <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 self-end md:self-auto">
                <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1 stagger-item" style={{ animationDelay: '100ms' }}>
          <CardContent className="pt-4 md:pt-5 px-4 md:px-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500">Tasks Needing Attention</p>
                <p className={`text-2xl font-bold mt-1 tracking-tight ${tasksNeedingAttention > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {tasksNeedingAttention} {tasksNeedingAttention === 1 ? 'Task' : 'Tasks'}
                </p>
              </div>
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tasksNeedingAttention > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    
      {/* Net Payable This Month (item 9, 2026-09-03) — how much salary
          the employee will actually get at the end of the month,
          itemized breakdown lives on the My Salary page. */}
      {payrollSelf?.payrollRecord && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="pt-4 md:pt-5 px-4 md:px-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-emerald-700">Net Payable This Month</p>
                <p className="text-2xl font-bold text-emerald-900 mt-1 tracking-tight">
                  {formatMoney(
                    payrollSelf.baseSalary + (payrollSelf.pendingIncrement || 0) + (payrollSelf.payrollRecord.bonus || 0) - (payrollSelf.payrollRecord.deductions || 0),
                    payrollSelf.region
                  )}
                </p>
                {payrollSelf.payrollRecord.deductions > 0 && (
                  <p className="text-[10px] text-emerald-700 mt-1">
                    Includes {formatMoney(payrollSelf.payrollRecord.deductions, payrollSelf.region)} in deductions — see My Salary for the full breakdown.
                  </p>
                )}
              </div>
              <Badge variant={payrollSelf.payrollRecord.processed ? 'success' : 'warning'}>
                {payrollSelf.payrollRecord.processed ? 'Paid' : 'Pending'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    
      {/* Tasks list */}
      {myTasks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">My Assigned Tasks ({myTasks.length})</h2>
          <div className="space-y-2">
            {myTasks.map(task => {
              const isOverdue = task.status !== 'done' && new Date(task.dueDate) < new Date();
              const isDueSoon = !isOverdue && task.status !== 'done' && (new Date(task.dueDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 3;
              return (
                <Card 
                  key={task.id} 
                  onClick={() => setSelectedTask(task)}
                  className={`p-4 border transition-colors transition-shadow cursor-pointer hover:border-orange-300 hover:shadow-sm group ${isOverdue ? 'border-rose-300 bg-rose-50/10' : task.status === 'done' ? 'opacity-70 border-emerald-100 bg-emerald-50/5' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`font-bold text-sm text-slate-900 ${task.status === 'done' ? 'line-through opacity-50' : ''}`}>{task.title}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${TASK_PRIORITY_STYLES[task.priority]}`}>{task.priority}</span>
                        {isOverdue && <span className="text-[9px] font-bold text-rose-700 bg-rose-100 border border-rose-200 px-1.5 py-0.2 rounded-full">OVERDUE</span>}
                        {isDueSoon && <span className="text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.2 rounded-full">DUE SOON</span>}
                      </div>
                      {task.description && <p className="text-xs text-slate-500 mb-1.5 line-clamp-1">{task.description}</p>}
                      <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1"><Calendar className="h-3 w-3 shrink-0" /> Due: {formatDateNY(task.dueDate)} · {task.team}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${TASK_STATUS_STYLES[task.status]}`}>{TASK_STATUS_LABELS[task.status]}</span>
                      <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    
      {/* Leaves History */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Recent Leave Requests</h2>
        <Card className="overflow-hidden p-0 border border-slate-200 bg-white">
          {/* Desktop table */}
          <TableScroll hideOnMobile>
            <Table density="cozy" size="xs" minWidth={500}>
              <THead>
                <tr>
                  <Th>Type</Th>
                  <Th>Duration</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                </tr>
              </THead>
              <TBody>
                {leaves
                  .filter(l => 
                    l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    l.reason.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((leave) => (
                    <Tr key={leave.id}>
                      <Td className="font-bold text-slate-900">{leave.type}</Td>
                      <Td className="text-slate-600 font-medium">{leave.duration}</Td>
                      <Td className="text-slate-500">{leave.reason}</Td>
                      <Td>{getStatusBadge(leave.status)}</Td>
                    </Tr>
                  ))}
                {leaves.length === 0 && (
                  <Tr>
                    <EmptyState as="td" colSpan={4} py={6}>No leave history found.</EmptyState>
                  </Tr>
                )}
              </TBody>
            </Table>
          </TableScroll>
          {/* Mobile card stack */}
          <div className="md:hidden space-y-2 p-3">
            {leaves
              .filter(l =>
                l.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
                l.reason.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((leave) => (
                <div key={leave.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-900">{leave.type}</p>
                    {getStatusBadge(leave.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Duration</p>
                      <p className="text-xs font-semibold text-slate-700">{leave.duration}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Reason</p>
                      <p className="text-xs font-semibold text-slate-700">{leave.reason}</p>
                    </div>
                  </div>
                </div>
              ))}
            {leaves.length === 0 && (
              <EmptyState py={6} size="xs">No leave history found.</EmptyState>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
