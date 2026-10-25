'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Profile } from '@/lib/hrData';

// The "HR Consent & Data Agreement" popup (GPS disclosure, salary reserve, leave and increment rules).
// It used to live inline in the dashboard layout AFTER the onboarding early-return, so a new employee
// still going through onboarding never saw it — and could finish onboarding without ever being shown
// the location disclosure. Rendering it from one place that both paths use fixes that.
export function ConsentOverlay({ profile, onAccept }: { profile: Profile | null; onAccept: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm fade-enter">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl p-4 sm:p-8 dialog-enter">
        <div className="text-center pb-4 border-b border-slate-200 mb-6">
          <h2 className="text-xl font-bold text-slate-900">DelCargo HR Consent & Data Agreement</h2>
          <p className="text-xs text-slate-500 mt-1">Please review the terms of data access before continuing.</p>
        </div>
        
        <div className="space-y-4 text-xs text-slate-700 bg-slate-50 p-6 rounded-lg border border-slate-200/50 max-h-[420px] overflow-y-auto leading-relaxed font-medium">
          <p className="text-sm font-semibold text-slate-900">Hello {profile?.fullName || 'Employee'}, welcome to the team {profile?.teams?.join(' and ') || 'Operations'}!</p>
          <p className="font-semibold text-slate-800">Please review the following important HR policies:</p>
          
          <ol className="list-decimal pl-5 space-y-2.5">
            <li>If you&apos;re on automatic GPS attendance, this app uses your device&apos;s location — including while the app is closed or your screen is locked — solely to detect when you arrive at or leave your assigned warehouse, so your shift can start/end automatically. It is not used to track you outside of that purpose. See our <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-600 underline font-semibold">Privacy Policy</a> for full details on what&apos;s collected and why.</li>
            <li>Your first month’s salary will be reserved and can be claimed upon resignation. If you join after the 5th of a month, the pay for the days you worked that month is paid together with your salary two months later, and your first full month is the one that is reserved.</li>
            <li>Kindly share your CV, clear front and back images of CNIC along with your bank account details.</li>
            <li>You are entitled to 1 paid time-off (PTO) leave per month.</li>
            <li>PTO requests must be submitted at least 2 weeks in advance.</li>
            <li>For emergency leaves, 2 days’ salary will be deducted for each day of emergency leave. However, if you take no more than 3 emergency leaves in a year, the deducted amount will be reimbursed at year-end.</li>
            <li>
              Unused PTOs can be:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Accumulated and used together (e.g., for vacations),</li>
                <li>Rolled over to the next year, or</li>
                <li>Cashed out at the end of the year.</li>
              </ul>
            </li>
            <li>An annual anniversary increment will be applied on your work anniversary month (PKR 10,000 for Pakistan-based staff, $100 for USA-based staff).</li>
            <li>Salary details are confidential. Please do not disclose your salary to other employees. If someone asks or insists, report it to HR immediately.</li>
          </ol>

          <div className="pt-4 border-t border-slate-200/60 text-slate-500 font-semibold space-y-0.5">
            <p>If you have any questions or need clarification, feel free to reach out.</p>
            <p className="mt-2">Thank you!</p>
            <p className="text-slate-700">HR Manager</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end pt-4 border-t border-slate-200">
          <Button
            variant="primary"
            size="md"
            onClick={onAccept}
          >
            <CheckCircle2 className="h-4 w-4" /> I Agree & Consent
          </Button>
        </div>
      </div>
    </div>
  );
}
