'use client';

import React from 'react';
import Link from 'next/link';

// Support page — satisfies Apple/Google's App Store Connect requirement for
// a live, publicly-reachable "Support URL" (distinct from the Privacy
// Policy URL in src/app/privacy/page.tsx, which App Review also checks).
// Apple's own guidance for what belongs on a support page is basically:
// a way to actually reach a human (email/phone), and enough self-serve
// help (FAQ) that App Review can see the app isn't abandonware. Keep the
// FAQ below in sync with real recurring support requests — see
// Notes/PROJECT_HISTORY.md 1j/1k/1l for the tracker "Reconnect Required" /
// stale-setup-code flow this FAQ documents.
export default function SupportPage() {
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* min-h-16 + pt-safe, not h-16 — matches src/app/privacy/page.tsx's
          header (see that file's comment for why). */}
      <header className="min-h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-12 sticky top-0 z-50 pt-safe">
        <div className="flex items-center gap-2">
          <div className="font-bold text-lg text-orange-600 tracking-tight">DelCargo Logistics</div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Support</span>
        </div>
        <Link
          href="/"
          className="text-xs font-bold text-slate-600 hover:text-orange-600 transition-colors"
        >
          ← Back to Home
        </Link>
      </header>

      <main className="flex-1 py-12 px-6 sm:px-12 max-w-3xl mx-auto w-full text-sm text-slate-700 leading-relaxed space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Support</h1>
          <p className="text-xs text-slate-500 font-semibold">Delcargo Internal — DelCargo HR Operations Platform</p>
          <p className="text-xs text-slate-500 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold p-4 rounded-lg">
          This app is an internal workforce-management tool for DelCargo Logistics employees and
          contractors. It is not a consumer product and is not intended for use by the general
          public.
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">Contact Support</h2>
          <p>
            For any question, issue, or account request related to the Delcargo Internal app —
            including login problems, the desktop DelCargo Tracker app, timesheets, leave,
            payroll, or anything else — email:
          </p>
          <p className="pt-1">
            <a href="mailto:hr@delcargo.us" className="text-orange-600 font-bold text-base hover:underline">hr@delcargo.us</a>
          </p>
          <p className="text-xs text-slate-500">
            We aim to respond within 1–2 business days. Please include your account email and, if
            reporting a bug, what device/OS and app version you're using.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">Frequently Asked Questions</h2>

          <div className="space-y-1.5">
            <p className="font-bold text-slate-900 text-sm">I can't log in / forgot my password.</p>
            <p>
              Use the &quot;Forgot Password&quot; link on the login screen to reset it via a one-time
              code sent to your registered email. If you no longer have access to that email,
              contact HR at the address above.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-slate-900 text-sm">My shift won't start / I'm told to reconnect my tracker.</p>
            <p>
              If HR/Admin has screen tracking enabled on your account, Start Shift requires the
              DelCargo Tracker desktop app to be installed, running, and up to date. A &quot;Tracker
              App Required&quot; or &quot;Reconnect Tracker Required&quot; message means the app either
              isn't running or its setup code needs to be refreshed — open the Tracker Setup page
              in the app, copy the current setup code, and paste it into the DelCargo Tracker
              program on your computer. If it still won't connect, contact HR.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-slate-900 text-sm">My screenshots/activity aren't showing up.</p>
            <p>
              This is almost always the same reconnect issue above (an outdated or unrecognized
              setup code), or the DelCargo Tracker app not currently running. Reconnecting per the
              steps above resolves most cases; email HR if the problem continues.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-slate-900 text-sm">I'm not receiving push notifications.</p>
            <p>
              Check that notifications are allowed for the app in your device's system settings,
              and check your notification preferences on your Profile page inside the app.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-slate-900 text-sm">How do I request time off, check my payroll, or raise an HR issue?</p>
            <p>
              Use the Leaves, Salary, and Tickets sections inside the app. For anything those
              sections can't cover, email HR directly.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-slate-900 text-sm">How do I delete my account or data?</p>
            <p>
              Since this app is provisioned and managed by DelCargo for its employees and
              contractors, account and data deletion requests go through HR rather than a
              self-service option in the app. Email HR and we'll process the request.
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">More Information</h2>
          <p>
            See our{' '}
            <Link href="/privacy" className="text-orange-600 font-semibold hover:underline">Privacy Policy</Link>
            {' '}for details on what data the app collects and how it's used.
          </p>
        </section>
      </main>

      <footer className="h-14 border-t border-slate-200 bg-white flex items-center justify-center text-[10px] font-semibold text-slate-400">
        © {new Date().getFullYear()} DelCargo Operations Team. All rights reserved.
      </footer>
    </div>
  );
}
