import { NextResponse } from 'next/server';
import { adminHasAppliedForPosition, adminCreateCareerApplication, adminAddNotification } from '@/lib/pbAdmin';
import { rateLimitByIp } from '@/lib/rateLimit';
import { cleanText, cleanEmail } from '@/lib/sanitize';
import type { PbRow } from '@/lib/pbTypes';

export const runtime = 'edge';

// Public, unauthenticated by design — job applicants are external
// candidates with no app account and nothing to log in with (see
// CareersView.tsx's own `canApply = role === 'public'` gate). This route
// itself is the trust boundary: it's the only thing allowed to write to
// hr_career_applications once that collection's own PocketBase rules are
// locked down (plan 012, Phase 1). Validates and writes server-side via
// the admin client instead of the old public `pb.collection(...)` calls.
export async function POST(request: Request) {
  const limited = await rateLimitByIp(request, 'careers-apply', 5, 60 * 60 * 1000);
  if (limited) return limited;
  let body: PbRow;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Public, unauthenticated form: every field is normalised and capped here,
  // regardless of what the client-side inputs already enforce.
  const positionId = cleanText(body?.positionId, { max: 64 });
  const positionTitle = cleanText(body?.positionTitle, { max: 150 });
  const applicantName = cleanText(body?.applicantName, { max: 100 });
  const applicantEmail = cleanEmail(body?.applicantEmail);
  const coverLetter = cleanText(body?.coverLetter, { max: 5000, multiline: true });

  if (!positionId || !positionTitle || !applicantName || !applicantEmail) {
    // cleanEmail() returns '' for anything that isn't a plausible address.
    const hasEmailInput = typeof body?.applicantEmail === 'string' && body.applicantEmail.trim() !== '';
    if (positionId && positionTitle && applicantName && hasEmailInput) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  try {
    const alreadyApplied = await adminHasAppliedForPosition(positionId, applicantEmail);
    if (alreadyApplied) {
      return NextResponse.json(
        { error: 'You have already submitted an application for this position with this email address. Our HR team already has it on file.' },
        { status: 409 }
      );
    }

    await adminCreateCareerApplication({ positionId, positionTitle, applicantName, applicantEmail, coverLetter });

    // The Applications review panel is available to HR and Admin alike, so tell both. Best effort:
    // the application is already saved, so a failed notification must never fail the response (the
    // applicant would otherwise see an error and a retry would hit the 409 duplicate guard).
    const note = `New application for "${positionTitle}" submitted by ${applicantName} (${applicantEmail})`;
    await Promise.allSettled([
      adminAddNotification('all', 'hr', note),
      adminAddNotification('all', 'admin', note),
    ]).then(results => results.forEach(r => {
      if (r.status === 'rejected') console.error('[careers/apply] notification failed:', r.reason);
    }));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[careers/apply] error:', err);
    return NextResponse.json({ error: 'Could not submit your application. Please try again.' }, { status: 500 });
  }
}
