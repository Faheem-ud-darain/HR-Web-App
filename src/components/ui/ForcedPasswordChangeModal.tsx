'use client';

import React, { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Profile, changeOwnPassword } from '@/lib/hrData';

interface ForcedPasswordChangeModalProps {
  profile: Profile | null | undefined;
  onChanged: () => void;
}

// Plan 013 step 2: a hard gate shown the first time an employee (or HR/
// Admin) logs in after either onboarding approval or an admin-triggered
// password reset — see admin/profile/route.ts's approveOnboarding/
// resetPassword actions, which are the only two places `mustChangePassword`
// gets set on the hr_profile_extra_ overlay. The point is that an
// HR-issued temp password shouldn't quietly remain the account's real
// password forever; this forces the swap once, right after it matters,
// rather than leaving it to the employee's discretion.
//
// Same non-dismissible-except-its-own-action shape as AbsentPopup/
// AnnouncementPopup (not the shared <Modal>, which closes on backdrop/
// Escape/X clicks) — there is deliberately no way to skip this. Reuses
// changeOwnPassword (the same self-service call the Profile pages already
// use), which verifies the CURRENT password server-side — the employee
// still needs to know the temp password HR gave them to get through this,
// which is the correct check (proves they're the one who received it).
export function ForcedPasswordChangeModal({ profile, onChanged }: ForcedPasswordChangeModalProps) {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!profile?.mustChangePassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (saving) return;

    if (!currentPass || !newPass || !confirmPass) {
      setError('Please fill in all fields.');
      return;
    }
    if (newPass.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPass === currentPass) {
      setError('New password must be different from your current one.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await changeOwnPassword(currentPass, newPass);
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      onChanged();
    } catch (err: any) {
      setError(err?.message || 'Could not update your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-toast)] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm fade-enter"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="forced-password-change-title"
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden dialog-enter">
        <div className="px-5 pt-5 pb-4 bg-orange-50 border-b border-orange-200 flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center shrink-0">
            <KeyRound className="h-5 w-5 text-orange-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wider">Action Required</p>
            <h2 id="forced-password-change-title" className="font-bold text-slate-900 text-base leading-tight mt-0.5">
              Set a new password to continue
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-700 leading-relaxed">
            Your account was just approved (or your password was reset by HR/Admin). For security, you need to
            replace the temporary password you were given with one only you know before continuing.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current (Temporary) Password</label>
            <input
              type="password"
              value={currentPass}
              onChange={e => setCurrentPass(e.target.value)}
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Password</label>
            <input
              type="password"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
            <input
              type="password"
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              className="w-full bg-slate-50/50 hover:bg-slate-50 border border-slate-200 focus:border-orange-500 focus:bg-white rounded-xl py-2.5 px-3.5 text-xs outline-none text-slate-900 transition-colors focus:ring-2 focus:ring-orange-100 font-semibold"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-100 rounded-xl font-semibold flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 shrink-0" />
              {error}
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="primary" disabled={saving} className="shrink-0 shadow-sm active:scale-97 transition-transform">
              <ShieldCheck className="h-4 w-4" /> {saving ? 'Saving…' : 'Set New Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
