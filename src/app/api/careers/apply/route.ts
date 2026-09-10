import { NextResponse } from 'next/server';
import { adminHasAppliedForPosition, adminCreateCareerApplication } from '@/lib/pbAdmin';

export const runtime = 'edge';

// Public, unauthenticated by design — job applicants are external
// candidates with no app account and nothing to log in with (see
// CareersView.tsx's own `canApply = role === 'public'` gate). This route
// itself is the trust boundary: it's the only thing allowed to write to
// hr_career_applications once that collection's own PocketBase rules are
// locked down (plan 012, Phase 1). Validates and writes server-side via
// the admin client instead of the old public `pb.collection(...)` calls.
export async function POST(request: Request) {
  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const positionId = typeof body?.positionId === 'string' ? body.positionId.trim() : '';
  const positionTitle = typeof body?.positionTitle === 'string' ? body.positionTitle.trim() : '';
  const applicantName = typeof body?.applicantName === 'string' ? body.applicantName.trim() : '';
  const applicantEmail = typeof body?.applicantEmail === 'string' ? body.applicantEmail.trim() : '';
  const coverLetter = typeof body?.coverLetter === 'string' ? body.coverLetter : '';

  if (!positionId || !positionTitle || !applicantName || !applicantEmail) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }
  // Same lightweight shape check the HTML5 `type="email"` input on the
  // client already enforces — this route can be hit directly, so it can't
  // rely on that alone.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
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

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[careers/apply] error:', err);
    return NextResponse.json({ error: 'Could not submit your application. Please try again.' }, { status: 500 });
  }
}
