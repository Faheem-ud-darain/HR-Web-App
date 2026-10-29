'use client';

import { useRouter } from 'next/navigation';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { CheckCircleIcon as CheckCircle2, ClockIcon as Clock, WalletIcon as Wallet, WarningIcon as AlertTriangle } from '@/components/ui/icons';
import { formatMoney, getAccruedPTOForDisplay, getPTOAccrualDate, getRemainingPTO, type LeaveApplication, type PayrollSelf, type Profile } from '@/lib/hrData';

// The four numbers an employee checks most: leave left, leave earned so far, tasks that need attention, and this month's pay.
export function EmployeeStats({ profile, leaves, tasksNeedingAttention, payroll }: { profile: Profile | null; leaves: LeaveApplication[] | undefined; tasksNeedingAttention: number; payroll: PayrollSelf | null | undefined }) {
  const router = useRouter();
  const record = payroll?.payrollRecord;
  const net = payroll && record ? payroll.baseSalary + (payroll.pendingIncrement || 0) + (record.bonus || 0) - (record.deductions || 0) : 0;
  const accrual = profile ? getPTOAccrualDate(profile) : null;
  return (
    <div className={`grid grid-cols-2 gap-3 md:gap-4 ${record ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      <StatCard label="Leave Balance" size="md" chip={{ icon: Clock, tone: 'orange' }} onClick={() => router.push('/employee/leaves')}
        value={<>{profile && accrual ? getRemainingPTO(leaves || [], profile.fullName, accrual) : 0} <span className="text-sm font-medium">days</span></>} />
      <StatCard label="Accrued PTO" size="md" chip={{ icon: CheckCircle2, tone: 'emerald' }}
        value={<>{accrual ? getAccruedPTOForDisplay(accrual) : 0} <span className="text-sm font-medium">days</span></>} />
      <StatCard label="Tasks Needing Attention" size="md" chip={{ icon: AlertTriangle, tone: 'amber' }} valueTone={tasksNeedingAttention > 0 ? 'danger' : 'default'}
        value={<>{tasksNeedingAttention} <span className="text-sm font-medium">{tasksNeedingAttention === 1 ? 'task' : 'tasks'}</span></>} />
      {record && payroll && (
        <StatCard label="Net Payable This Month" size="md" chip={{ icon: Wallet, tone: 'emerald' }} valueTone="success" value={formatMoney(net, payroll.region)} onClick={() => router.push('/employee/salary')}
          labelExtra={<Badge variant={record.processed ? 'success' : 'warning'} size="sm">{record.processed ? 'Paid' : 'Pending'}</Badge>}
          sub={record.deductions > 0 ? `Includes ${formatMoney(record.deductions, payroll.region)} in deductions` : undefined} />
      )}
    </div>
  );
}
