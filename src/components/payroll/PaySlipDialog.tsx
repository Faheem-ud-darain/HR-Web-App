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
import { formatMoney, type PayrollRecord, type Profile, type PayrollCorrection } from '@/lib/hrData';
import { currentAmount } from '@/lib/core/payrollCorrections';
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
  /** Corrections already recorded for THIS employee and month, oldest first. */
  corrections: PayrollCorrection[];
  /** Records a correction on this (already paid) month; throws with a readable message on failure. */
  onCorrect: (record: PayrollRecord, correctedAmount: number, reason: string) => Promise<void>;
  configured: boolean;
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

export function PaySlipDialog({ record, profile, isAdmin, isOpen, onClose, onSaveBonus, onMarkPaid, busy, corrections, onCorrect, configured }: PaySlipDialogProps) {
  const [bonusText, setBonusText] = useState('');
  const [bonusFor, setBonusFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [corrAmount, setCorrAmount] = useState('');
  const [corrReason, setCorrReason] = useState('');
  const [corrBusy, setCorrBusy] = useState(false);
  const [corrError, setCorrError] = useState('');

  // Start each person with their saved bonus (adjusting state while rendering, as elsewhere in the app).
  const key = record ? `${record.employeeId}:${record.month}` : null;
  if (key !== bonusFor) {
    setBonusFor(key);
    setBonusText(record && record.bonus ? String(record.bonus) : '');
    setCorrecting(false); setCorrAmount(''); setCorrReason(''); setCorrError('');
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
          {(record.earlierPay || 0) > 0 && (
            <div className="flex justify-between gap-3 text-emerald-700"><span className="font-semibold">{record.earlierPayLabel || 'Earlier part-month pay'}</span><span className="shrink-0 font-bold">+{money(record.earlierPay || 0)}</span></div>
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

        {record.processed && (
          <div className="space-y-2 rounded-xl border border-slate-200 p-4">
            <p className="font-bold text-slate-700">Corrections after payment</p>
            {corrections.length === 0 ? (
              <p className="text-slate-500">This month was paid and has not been corrected. If something was wrong, record a correction: the original payment stays as it was, and the difference is settled separately by Admin.</p>
            ) : (
              <>
                <p className="text-slate-600">Paid {money(net)} · now stands at <span className="font-bold text-slate-900">{money(currentAmount(net, corrections))}</span></p>
                <ul className="space-y-2">
                  {corrections.map(c => (
                    <li key={c.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <p className="font-bold">{money(c.previousAmount)} → {money(c.correctedAmount)} <span className={c.difference > 0 ? 'text-emerald-700' : 'text-rose-700'}>({c.difference > 0 ? '+' : '−'}{money(Math.abs(c.difference))})</span></p>
                      <p className="mt-0.5 leading-snug">{c.reason}</p>
                      <p className="mt-1 text-[11px] text-amber-800/80">{new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {c.createdBy} · {c.settled ? 'Settled' : c.difference > 0 ? 'Still to pay the employee' : 'Still to recover'}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {!configured ? (
              <p className="text-amber-700">Corrections are not switched on yet. Ask your developer to run the setup step (ensurePayrollCorrections).</p>
            ) : !correcting ? (
              <Button variant="outline" size="sm" onClick={() => { setCorrecting(true); setCorrAmount(String(currentAmount(net, corrections))); }}>Record a correction</Button>
            ) : (
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <label className="block font-semibold text-slate-600">What should this month have been? ({record.region === 'USA' ? 'USD' : 'PKR'})</label>
                <Input aria-label="Corrected amount" type="text" inputMode="decimal" value={corrAmount} onChange={(e) => setCorrAmount(e.target.value)} fieldSize="md" />
                <label className="block font-semibold text-slate-600">Why? (everyone will see this)</label>
                <textarea aria-label="Reason for the correction" value={corrReason} onChange={(e) => setCorrReason(e.target.value)} rows={3} maxLength={500} className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-orange-400 focus:outline-none" placeholder="For example: the absence on 14 Sept was approved leave." />
                {corrError && <p role="alert" className="font-semibold text-rose-600">{corrError}</p>}
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" disabled={corrBusy}
                    onClick={async () => {
                      setCorrError(''); setCorrBusy(true);
                      try { await onCorrect(record, Number(corrAmount.replace(/[^0-9.]/g, '')), corrReason); setCorrecting(false); setCorrReason(''); }
                      catch (e) { setCorrError(e instanceof Error ? e.message : 'Could not save the correction.'); }
                      finally { setCorrBusy(false); }
                    }}>
                    {corrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save correction
                  </Button>
                  <Button variant="outline" size="sm" disabled={corrBusy} onClick={() => { setCorrecting(false); setCorrError(''); }}>Cancel</Button>
                </div>
                <p className="text-slate-400">The employee is told what changed and why. Admin settles the difference separately; it is never added to or taken from another month&apos;s salary.</p>
              </div>
            )}
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
