'use client';

// One person's pay for one month, in plain words: how much, where to send it, how it was worked
// out, and (Admin only) a button to mark it paid. Replaces the old "Net Payable" popup and the
// bonus/deduction boxes that used to sit in every table row and saved on every keystroke.
import React, { useState } from 'react';
import { CheckCircle2, Copy, Landmark, Loader2, ReceiptText, AlertTriangle, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatMoney, type PayrollRecord, type Profile } from '@/lib/hrData';
import { netPay, groupDeductions, payrollFlags, payPeriod } from '@/lib/core/payrollView';

interface PaySlipDialogProps {
  record: PayrollRecord | null;
  profile: Profile | undefined;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSaveBonus: (record: PayrollRecord, bonus: number) => Promise<void>;
  onMarkPaid: (record: PayrollRecord) => void;
  busy: boolean;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {}); }}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
    >
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}{done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function PaySlipDialog({ record, profile, isAdmin, isOpen, onClose, onSaveBonus, onMarkPaid, busy }: PaySlipDialogProps) {
  const [bonusText, setBonusText] = useState('');
  const [bonusFor, setBonusFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start each person with their saved bonus (adjusting state while rendering, as elsewhere in the app).
  const key = record ? `${record.employeeId}:${record.month}` : null;
  if (key !== bonusFor) {
    setBonusFor(key);
    setBonusText(record && record.bonus ? String(record.bonus) : '');
  }

  if (!record) return null;
  const net = netPay(record);
  const groups = groupDeductions(record.deductionBreakdown);
  const flags = payrollFlags(record, profile);
  const bonusValue = Number(bonusText.replace(/[^0-9.]/g, '')) || 0;
  const bonusChanged = bonusValue !== (Number(record.bonus) || 0);
  const money = (n: number) => formatMoney(n, record.region);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Salary for ${payPeriod(record.month).salaryMonth} — ${record.name}`}>
      <div className="space-y-4 font-sans text-xs">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Amount to pay</p>
          <p className="mt-1 text-2xl font-black text-emerald-900">{money(net)}</p>
          <div className="mt-2">{record.processed ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Not paid yet</Badge>}</div>
          <p className="mt-2 text-[11px] font-semibold text-emerald-800">Salary for {payPeriod(record.month).salaryMonth} · paid at the start of {payPeriod(record.month).paidMonth}</p>
        </div>

        {flags.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 font-bold text-amber-900"><AlertTriangle className="h-3.5 w-3.5" /> Please check before paying</p>
            {flags.map(f => (
              <p key={f.kind} className="leading-snug text-amber-900"><span className="font-bold">{f.label}.</span> {f.detail}</p>
            ))}
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-1.5 font-bold text-slate-700"><Landmark className="h-3.5 w-3.5" /> Where to send the money</p>
          <dl className="space-y-1.5 text-slate-700">
            {[
              ['Bank', profile?.bankName || ''],
              ['Account number', profile?.accountNumber || ''],
              ['IBAN', profile?.iban || ''],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="font-semibold text-slate-500">{label}</dt>
                <dd className="flex items-center gap-2 font-semibold">
                  <span className={label === 'Bank' ? '' : 'font-mono'}>{value || 'Not on file'}</span>
                  <CopyButton text={value} label={label} />
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-1.5 font-bold text-slate-700"><ReceiptText className="h-3.5 w-3.5" /> How this was worked out</p>
          <div className="flex justify-between text-slate-700"><span className="font-semibold text-slate-500">Monthly salary</span><span className="font-bold">{money(record.baseSalary)}</span></div>
          {record.incrementAmount > 0 && (
            <div className="flex justify-between text-emerald-700"><span className="font-semibold">Yearly increment</span><span className="font-bold">+{money(record.incrementAmount)}</span></div>
          )}
          {record.bonus > 0 && (
            <div className="flex justify-between text-emerald-700"><span className="font-semibold">Bonus</span><span className="font-bold">+{money(record.bonus)}</span></div>
          )}
          {groups.map(g => (
            <details key={g.key} className="group rounded-lg border border-slate-200 bg-white px-3 py-2">
              <summary className="flex cursor-pointer list-none items-center justify-between text-rose-700">
                <span className="font-semibold">{g.label}</span>
                <span className="font-bold">−{money(g.total)}</span>
              </summary>
              <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-slate-600">
                {g.items.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 leading-snug">
                    <span>{item.label}</span><span className="shrink-0 font-semibold">−{money(item.amount)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {groups.length === 0 && <p className="text-slate-400">Nothing was deducted this month.</p>}
          <div className="flex justify-between border-t border-slate-300 pt-2 text-slate-900"><span className="font-bold">Amount to pay</span><span className="font-black">{money(net)}</span></div>
        </div>

        {!record.processed && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-4">
            <p className="font-bold text-slate-700">Add a bonus</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  aria-label="Bonus amount"
                  type="text"
                  inputMode="decimal"
                  value={bonusText}
                  onChange={(e) => setBonusText(e.target.value)}
                  placeholder="0"
                  fieldSize="md"
                />
              </div>
              <Button
                variant="outline"
                size="md"
                disabled={!bonusChanged || saving}
                onClick={async () => { setSaving(true); try { await onSaveBonus(record, bonusValue); } finally { setSaving(false); } }}
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save bonus
              </Button>
            </div>
            <p className="text-slate-400">Nothing is saved until you press Save bonus.</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
          {record.processed ? (
            <span className="flex items-center gap-1.5 px-2 py-2 font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Already paid</span>
          ) : isAdmin ? (
            <Button variant="primary" size="md" disabled={busy} onClick={() => onMarkPaid(record)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark as paid
            </Button>
          ) : (
            <span className="text-slate-500">Admin marks salaries as paid after sending the money.</span>
          )}
        </div>
      </div>
    </Modal>
  );
}
