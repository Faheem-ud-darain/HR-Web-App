'use client';

// Shared "Net Payable" modal for HR and Admin payroll pages (item 5 of the
// 2026-09-03 payroll overhaul) — shows an employee's net payable salary for
// the record's month, their bank account details, an itemized breakdown of
// every deduction (and why), their running reserved-salary balance (see
// PayrollRecord.reservedThisMonth's comment — reserved is NOT lost pay, it
// pays out at resignation/termination), and a "Mark as Paid" action that
// delegates to the same processing handler each page already had (its own
// "Complete Payout"/"Process" button) — this modal doesn't duplicate that
// write logic, just gives HR/Admin a second, more detailed place to trigger
// it from.
import React from 'react';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { formatMoney, PayrollRecord, Profile } from '@/lib/hrData';
import { CheckCircle2, Landmark, Loader2, ReceiptText } from 'lucide-react';

interface NetPayableModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PayrollRecord | null;
  profile: Profile | undefined;
  onMarkPaid: (employeeId: string) => void;
  isProcessing: boolean;
}

export function NetPayableModal({ isOpen, onClose, record, profile, onMarkPaid, isProcessing }: NetPayableModalProps) {
  if (!record) return null;

  const netPayable = record.baseSalary + record.bonus - record.deductions + record.incrementAmount;
  const reservedBalance = (profile?.reservedSalaryBalance || 0) + (profile?.manualReservedAmount || 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Net Payable — ${record.name}`}>
      <div className="space-y-4 font-sans text-xs">
        {/* Net payable headline */}
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Net Payable This Month</p>
          <p className="text-2xl font-black text-emerald-900 mt-1">{formatMoney(netPayable, record.region)}</p>
          <div className="mt-2">
            {record.processed ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Pending</Badge>}
          </div>
        </div>

        {/* Bank details */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="font-bold text-slate-700 flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5" /> Bank Details</p>
          <div className="grid grid-cols-2 gap-2 text-slate-700">
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Bank Name</p>
              <p className="font-semibold">{profile?.bankName || 'Not on file'}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-semibold uppercase">Account Number</p>
              <p className="font-semibold font-mono">{profile?.accountNumber || 'Not on file'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] text-slate-400 font-semibold uppercase">IBAN</p>
              <p className="font-semibold font-mono">{profile?.iban || 'Not on file'}</p>
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="font-bold text-slate-700 flex items-center gap-1.5"><ReceiptText className="h-3.5 w-3.5" /> Pay Breakdown</p>
          <div className="flex justify-between items-center text-slate-700">
            <span className="font-semibold text-slate-500">Base Salary</span>
            <span className="font-bold font-mono">{formatMoney(record.baseSalary, record.region)}</span>
          </div>
          {record.incrementAmount > 0 && (
            <div className="flex justify-between items-center text-emerald-700">
              <span className="font-semibold">Increment</span>
              <span className="font-bold font-mono">+{formatMoney(record.incrementAmount, record.region)}</span>
            </div>
          )}
          {record.bonus > 0 && (
            <div className="flex justify-between items-center text-emerald-700">
              <span className="font-semibold">Bonus</span>
              <span className="font-bold font-mono">+{formatMoney(record.bonus, record.region)}</span>
            </div>
          )}

          {record.deductionBreakdown.length > 0 && (
            <div className="pt-2 mt-1 border-t border-slate-200 space-y-1.5">
              <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Deductions — why salary was reduced</p>
              {record.deductionBreakdown.map((item, i) => (
                <div key={i} className="flex justify-between items-start gap-3 text-rose-700">
                  <span className="font-medium leading-snug">{item.label}</span>
                  <span className="font-bold font-mono shrink-0">-{formatMoney(item.amount, record.region)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 mt-1 border-t border-slate-300 text-slate-900">
            <span className="font-bold">Net Payable</span>
            <span className="font-black font-mono">{formatMoney(netPayable, record.region)}</span>
          </div>
        </div>

        {/* Reserved balance — informational, not part of this month's pay */}
        {reservedBalance > 0 && (
          <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900">
            <p className="font-bold text-[11px]">Reserved Salary Balance: {formatMoney(reservedBalance, record.region)}</p>
            <p className="text-[10px] text-indigo-700 mt-0.5 leading-relaxed">
              Not part of this month&apos;s net payable — held and paid out only when this employee resigns or is terminated.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
          {record.processed ? (
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs px-4 py-2">
              <CheckCircle2 className="h-4 w-4" /> Salary Already Paid
            </div>
          ) : (
            <button
              onClick={() => onMarkPaid(record.employeeId)}
              disabled={isProcessing}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5"
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark as Paid
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
