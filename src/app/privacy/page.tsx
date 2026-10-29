'use client';

import React from 'react';
import { DocPage, DocSection, DocNotice } from '@/components/landing/PublicPage';

// DRAFT privacy policy — written to satisfy Apple/Google's submission
// requirement that a privacy policy URL exists and accurately describes
// what the app collects (see the App Store / Play Store readiness review).
// This is a starting point, not a finished legal document — have it
// reviewed by an actual lawyer before relying on it, especially the data
// retention and third-party sharing sections, which depend on decisions
// (whether GDPR/CCPA apply to any staff) that only DelCargo can make.
//
// KEEP IT TRUE: every statement below describes what the code does today (the
// providers in section 7, the retention periods in section 8). When one of those
// changes (a new service receives data, a retention rule moves), change this page
// and LAST_UPDATED in the same commit.
const LAST_UPDATED = 'October 29, 2026';

export default function PrivacyPolicyPage() {
  return (
    <DocPage badge="Privacy Policy" title="Privacy Policy" meta={<>
          <p>Delcargo Internal — DelCargo HR Operations Platform</p>
          <p>Last updated: {LAST_UPDATED}</p>
        </>}>

        <DocNotice>
          This app is an internal workforce-management tool for DelCargo Logistics employees and
          contractors. It is not a consumer product and is not intended for use by the general
          public.
        </DocNotice>

        <DocSection title="1. Who this applies to">
          <p>
            This policy covers the Delcargo Internal mobile app (iOS/Android) and web dashboard
            used by DelCargo employees, team leads, HR staff, and administrators to manage
            attendance, tasks, leave, payroll information, and internal communication.
          </p>
        </DocSection>

        <DocSection title="2. What we collect">
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Account &amp; profile data:</strong> name, email, phone number, job title, team assignment, and (where provided) bank details, CNIC/ID images, and CV/passport documents for HR/onboarding purposes. Your password is stored only as a one-way hash, never in readable form.</li>
            <li>
              <strong>Attendance &amp; location:</strong> for employees on automatic GPS-based
              attendance (currently USA-based staff), the app checks your device&apos;s location
              against your assigned warehouse&apos;s geofence to automatically start and end your
              shift as you arrive at or leave the site. To do this reliably, the app requests{' '}
              <strong>&quot;Always&quot; location access</strong> and continues checking your
              location while the app is closed or your device is locked — not just while the app
              is open. This is used only to detect warehouse arrival/departure for attendance
              purposes; it is not used to track your movements at other times or in other
              locations, and location history beyond the current shift is not retained.
              Employees on manual attendance (e.g. remote/Pakistan-based staff) use Start/End
              Shift buttons instead and are never subject to location tracking.
            </li>
            <li><strong>Work records:</strong> timesheets, absences and deductions, tasks, leave requests, payroll and salary records, announcements you have read, support tickets, and team chat messages you create or participate in within the app.</li>
            <li><strong>Activity indicators:</strong> whether you have seen a message, announcement or ticket reply (read receipts and &quot;seen&quot; markers), who is currently typing in a chat or ticket, and the time you were last active in a ticket, so that colleagues and HR can see that a message has been read and answered.</li>
            <li><strong>Photos &amp; documents:</strong> profile pictures and any images/PDFs you choose to attach to tickets, chat or HR forms (camera or photo library, only when you actively choose to attach one).</li>
            <li><strong>Device &amp; security information:</strong> the IP address of your sign-in and password-reset requests (used to limit repeated attempts and protect accounts), a random identifier for each device you sign in on (shown to you in your list of signed-in devices), and the app or desktop-agent version you are running.</li>
            <li><strong>Push notification identifiers:</strong> a device token used to deliver notifications (via OneSignal) for things like ticket replies, leave decisions, and announcements — see Section 7.</li>
            <li><strong>Optional Google connection:</strong> if you choose to connect your Google account, we store the access Google gives us so that meetings and calendar entries can be created for you. You can disconnect it at any time from your Profile page.</li>
          </ul>
        </DocSection>

        <DocSection title="3. Desktop screen-tracking agent (separate tool)">
          <p>
            DelCargo also offers a separate, optional desktop application (&quot;DelCargo Tracker&quot;)
            that HR/Admin can enable for specific employees&apos; work computers. This is a distinct,
            separately installed program — <strong>it is not part of, and is not bundled with, the
            mobile app or this web dashboard</strong>, and is not distributed through the Apple App
            Store or Google Play. Employees are shown which account a setup code belongs to
            before connecting the desktop agent, and screen tracking only runs when explicitly
            enabled for that employee.
          </p>
          <p>When it is enabled, the agent records:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>periodic <strong>screenshots</strong> of the screen during a shift (taken only while a shift is running, and skipped while the screen is locked);</li>
            <li>whether the computer is <strong>active or idle</strong>, and a regular signal that the agent is running, so that working time and gaps can be shown to HR/Admin;</li>
            <li>technical status such as the agent version, device name and whether captures are succeeding.</li>
          </ul>
          <p>
            Screenshots can be viewed only by HR and Admin. They are kept for the month they were
            taken and until the 10th of the following month, and are then deleted automatically,
            except for employees HR has specifically marked to be excluded from automatic deletion.
          </p>
        </DocSection>

        <DocSection title="4. Del, the AI assistant (HR and Admin only)">
          <p>
            HR and Admin users can ask <strong>Del</strong>, a built-in AI assistant, questions
            about staff pay, leave, absences, support tickets and tracker health, and can ask it to
            draft a reply to a ticket. Employees and team leads do not have access to Del.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Del is <strong>read-only</strong>: it looks information up and answers; it cannot change, approve or delete anything.</li>
            <li>To answer, the question and the specific records it needs (for example one employee&apos;s leave or pay breakdown) are sent to our AI provider, <strong>Groq</strong>, for processing. <strong>Bank account numbers, IBANs and similar details are never sent</strong> to the AI provider; they are filled in locally only after the answer comes back.</li>
            <li>The person asking can save a chat to carry on later. Saved chats are visible only to the person who had them and are <strong>deleted automatically after 30 days</strong>; bank numbers are saved masked.</li>
            <li>Del&apos;s answers can contain mistakes and should be checked before acting on them.</li>
          </ul>
        </DocSection>

        <DocSection title="5. How we use this data">
          <p>
            Data collected through the app is used solely for internal HR and operations
            purposes: verifying attendance, processing leave and payroll, assigning and tracking
            tasks, responding to support tickets, keeping accounts secure, and internal team
            communication. We do not sell your data or use it for advertising.
          </p>
        </DocSection>

        <DocSection title="6. Who can see it">
          <p>
            Within the app, what you can see depends on your role: employees see their own records
            and the channels and tickets they belong to; team leads additionally see their team;
            HR and Admin can see staff records, including payroll, documents and tracking data.
            Chat messages and tickets are visible to the people in that conversation and to HR and
            Admin, who can oversee all channels and tickets.
          </p>
        </DocSection>

        <DocSection title="7. Third-party services">
          <p>We use the following service providers to run the app. We do not sell your data to any of them.</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Cloudflare</strong> hosts and delivers the web app and runs our scheduled clean-up jobs, and stores saved Del chats.</li>
            <li><strong>DigitalOcean</strong> hosts the database server (in the United States) that holds the records described above.</li>
            <li><strong>OneSignal</strong> delivers push notifications, which involves sharing a device push token and your account email address with OneSignal so a notification can be addressed to you.</li>
            <li><strong>Resend</strong> sends password-reset emails, which involves sharing your email address and the one-time code with Resend.</li>
            <li><strong>Groq</strong> processes Del requests as described in Section 4.</li>
            <li><strong>Google</strong>, only if you connect your Google account (Section 2).</li>
          </ul>
          <p>We do not share your HR records with any other third party beyond what is required to operate the app, or where the law requires it.</p>
        </DocSection>

        <DocSection title="8. Data retention">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Your profile, timesheets, leave, payroll and other work records are kept for as long as your employment/engagement with DelCargo continues and for a reasonable period afterward for legal and record-keeping purposes.</li>
            <li>Desktop-agent screenshots: until the 10th of the month after they were taken (Section 3).</li>
            <li>Saved Del chats: 30 days (Section 4).</li>
            <li>In-app notifications: about 60 days. Typing indicators and sign-in attempt counters: a day or two.</li>
            <li>If your account is removed, your profile and onboarding documents are deleted from the app.</li>
          </ul>
        </DocSection>

        <DocSection title="9. How we protect it">
          <p>
            Data is sent over encrypted (HTTPS) connections, passwords are stored as one-way hashes,
            sign-in attempts are rate-limited, and what each person can open in the app is limited
            by role. No system is perfectly secure; if you believe your account or data has been
            exposed, tell HR straight away.
          </p>
        </DocSection>

        <DocSection title="10. Your choices">
          <p>
            You can control notification categories from your Profile page. Location access
            (including the &quot;Always&quot; level described above) can be denied or downgraded to
            &quot;While Using&quot; at the OS level at any time, though this will prevent automatic
            location-based clock-in/out from working — in that case, contact HR to be switched to
            manual attendance. You can disconnect Google from your Profile page and sign out of any
            device. To request a copy of, or correction to, your data, contact HR directly (see below).
          </p>
        </DocSection>

        <DocSection title="11. Changes to this policy">
          <p>
            If we change what we collect or who receives it, we will update this page and the
            &quot;Last updated&quot; date above.
          </p>
        </DocSection>

        <DocSection title="12. Contact">
          <p>
            Questions about this policy or your data can be sent to{' '}
            <a href="mailto:hr@delcargo.us" className="text-brand font-semibold hover:underline">hr@delcargo.us</a>.
          </p>
        </DocSection>
    </DocPage>
  );
}
