'use client';

import React from 'react';
import Link from 'next/link';

// DRAFT privacy policy — written to satisfy Apple/Google's submission
// requirement that a privacy policy URL exists and accurately describes
// what the app collects (see the App Store / Play Store readiness review).
// This is a starting point, not a finished legal document — have it
// reviewed by an actual lawyer before relying on it, especially the data
// retention and third-party sharing sections, which depend on decisions
// (how long screenshots/timesheets are kept, whether GDPR/CCPA apply to
// any staff) that only DelCargo can make.
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans">
      {/* min-h-16 + pt-safe, not h-16 — see the same fix + explanation in
          src/app/page.tsx's header. */}
      <header className="min-h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sm:px-12 sticky top-0 z-50 pt-safe">
        <div className="flex items-center gap-2">
          <div className="font-bold text-lg text-orange-600 tracking-tight">DelCargo Logistics</div>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Privacy Policy</span>
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
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Privacy Policy</h1>
          <p className="text-xs text-slate-500 font-semibold">Delcargo Internal — DelCargo HR Operations Platform</p>
          <p className="text-xs text-slate-500 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold p-4 rounded-lg">
          This app is an internal workforce-management tool for DelCargo Logistics employees and
          contractors. It is not a consumer product and is not intended for use by the general
          public.
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">1. Who this applies to</h2>
          <p>
            This policy covers the Delcargo Internal mobile app (iOS/Android) and web dashboard
            used by DelCargo employees, team leads, HR staff, and administrators to manage
            attendance, tasks, leave, payroll information, and internal communication.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">2. What we collect</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Account &amp; profile data:</strong> name, email, phone number, job title, team assignment, and (where provided) bank details, CNIC/ID images, and CV/passport documents for HR/onboarding purposes.</li>
            <li>
              <strong>Attendance &amp; location:</strong> for employees on automatic GPS-based
              attendance (currently USA-based staff), the app checks your device's location
              against your assigned warehouse's geofence to automatically start and end your
              shift as you arrive at or leave the site. To do this reliably, the app requests{' '}
              <strong>&quot;Always&quot; location access</strong> and continues checking your
              location while the app is closed or your device is locked — not just while the app
              is open. This is used only to detect warehouse arrival/departure for attendance
              purposes; it is not used to track your movements at other times or in other
              locations, and location history beyond the current shift is not retained.
              Employees on manual attendance (e.g. remote/Pakistan-based staff) use Start/End
              Shift buttons instead and are never subject to location tracking.
            </li>
            <li><strong>Work records:</strong> timesheets, tasks, leave requests, support tickets, and team chat messages you create or participate in within the app.</li>
            <li><strong>Photos &amp; documents:</strong> profile pictures and any images/PDFs you choose to attach to tickets or HR forms (camera or photo library, only when you actively choose to attach one).</li>
            <li><strong>Push notification identifiers:</strong> a device token used to deliver notifications (via OneSignal) for things like ticket replies, leave decisions, and announcements — see Section 5.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">3. Desktop screen-tracking agent (separate tool)</h2>
          <p>
            DelCargo also offers a separate, optional desktop application ("DelCargo Tracker")
            that HR/Admin can enable for specific employees' work computers to periodically
            capture screenshots for time-tracking purposes. This is a distinct, separately
            installed program — <strong>it is not part of, and is not bundled with, the mobile
            app or this web dashboard</strong>, and is not distributed through the Apple App
            Store or Google Play. Employees are shown which account a setup code belongs to
            before connecting the desktop agent, and screen tracking only runs when explicitly
            enabled for that employee.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">4. How we use this data</h2>
          <p>
            Data collected through the app is used solely for internal HR and operations
            purposes: verifying attendance, processing leave and payroll, assigning and tracking
            tasks, responding to support tickets, and internal team communication. We do not
            sell your data or use it for advertising.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">5. Third-party services</h2>
          <p>
            We use <strong>OneSignal</strong> to deliver push notifications, which involves
            sharing a device push token with OneSignal. We do not share your HR records
            (payroll, leave, tickets, etc.) with OneSignal or any other third party beyond what's
            required to operate the app.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">6. Data retention &amp; access</h2>
          <p>
            Your data is retained for as long as your employment/engagement with DelCargo
            continues and for a reasonable period afterward for legal and record-keeping
            purposes. Access is restricted to HR and Admin roles within the platform.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">7. Your choices</h2>
          <p>
            You can control notification categories from your Profile page. Location access
            (including the "Always" level described above) can be denied or downgraded to
            "While Using" at the OS level at any time, though this will prevent automatic
            location-based clock-in/out from working — in that case, contact HR to be switched to
            manual attendance. To request a copy of, or correction to, your data, contact HR
            directly (see below).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-slate-900">8. Contact</h2>
          <p>
            Questions about this policy or your data can be sent to{' '}
            <a href="mailto:hr@delcargo.us" className="text-orange-600 font-semibold hover:underline">hr@delcargo.us</a>.
          </p>
        </section>
      </main>

      <footer className="h-14 border-t border-slate-200 bg-white flex items-center justify-center text-[10px] font-semibold text-slate-400">
        © {new Date().getFullYear()} DelCargo Operations Team. All rights reserved.
      </footer>
    </div>
  );
}
