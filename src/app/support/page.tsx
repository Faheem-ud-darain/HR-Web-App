'use client';

import React from 'react';
import Link from 'next/link';
import { DocPage, DocSection, DocNotice } from '@/components/landing/PublicPage';

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
    <DocPage badge="Support" title="Support" meta={<>
          <p>Delcargo Internal — DelCargo HR Operations Platform</p>
          <p>Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </>}>

        <DocNotice>
          This app is an internal workforce-management tool for DelCargo Logistics employees and
          contractors. It is not a consumer product and is not intended for use by the general
          public.
        </DocNotice>

        <DocSection title="Contact Support">
          <p>
            For any question, issue, or account request related to the Delcargo Internal app —
            including login problems, the desktop DelCargo Tracker app, timesheets, leave,
            payroll, or anything else — email:
          </p>
          <p className="pt-1">
            <a href="mailto:hr@delcargo.us" className="text-brand font-bold text-base hover:underline">hr@delcargo.us</a>
          </p>
          <p className="text-xs text-ink/60">
            We aim to respond within 1–2 business days. Please include your account email and, if
            reporting a bug, what device/OS and app version you&apos;re using.
          </p>
        </DocSection>

        <DocSection title="Frequently Asked Questions" className="space-y-3">

          <div className="space-y-1.5">
            <p className="font-bold text-ink text-sm">I can&apos;t log in / forgot my password.</p>
            <p>
              Use the &quot;Forgot Password&quot; link on the login screen to reset it via a one-time
              code sent to your registered email. If you no longer have access to that email,
              contact HR at the address above.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-ink text-sm">My shift won&apos;t start / I&apos;m told to reconnect my tracker.</p>
            <p>
              If HR/Admin has screen tracking enabled on your account, Start Shift requires the
              DelCargo Tracker desktop app to be installed, running, and up to date. A &quot;Tracker
              App Required&quot; or &quot;Reconnect Tracker Required&quot; message means the app either
              isn&apos;t running or its setup code needs to be refreshed — open the Tracker Setup page
              in the app, copy the current setup code, and paste it into the DelCargo Tracker
              program on your computer. If it still won&apos;t connect, contact HR.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-ink text-sm">My screenshots/activity aren&apos;t showing up.</p>
            <p>
              This is almost always the same reconnect issue above (an outdated or unrecognized
              setup code), or the DelCargo Tracker app not currently running. Reconnecting per the
              steps above resolves most cases; email HR if the problem continues.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-ink text-sm">I&apos;m not receiving push notifications.</p>
            <p>
              Check that notifications are allowed for the app in your device&apos;s system settings,
              and check your notification preferences on your Profile page inside the app.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-ink text-sm">How do I request time off, check my payroll, or raise an HR issue?</p>
            <p>
              Use the Leaves, Salary, and Tickets sections inside the app. For anything those
              sections can&apos;t cover, email HR directly.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="font-bold text-ink text-sm">How do I delete my account or data?</p>
            <p>
              Since this app is provisioned and managed by DelCargo for its employees and
              contractors, account and data deletion requests go through HR rather than a
              self-service option in the app. Email HR and we&apos;ll process the request.
            </p>
          </div>
        </DocSection>

        <DocSection title="More Information">
          <p>
            See our{' '}
            <Link href="/privacy" className="text-brand font-semibold hover:underline">Privacy Policy</Link>
            {' '}for details on what data the app collects and how it&apos;s used.
          </p>
        </DocSection>
    </DocPage>
  );
}
