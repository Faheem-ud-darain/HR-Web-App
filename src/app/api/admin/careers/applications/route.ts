import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminListCareerApplications, adminUpdateCareerApplicationStatus, adminListCareerApplicationsForEmail, adminDeleteCareerApplicationsForEmail } from '@/lib/pbAdmin';

export const runtime = 'edge';

function toCareerApplication(a: any) {
  return {
    id: a.id, positionId: a.position_id, positionTitle: a.position_title, applicantName: a.applicant_name,
    applicantEmail: a.applicant_email, coverLetter: a.cover_letter, submittedAt: a.submitted_at,
    status: a.status || 'pending',
  };
}

// HR/Admin-only read of every submitted application (applicant PII) — the
// authenticated replacement for the old public `useCareerApplications()`
// (plan 012, Phase 1). CareersView.tsx only ever showed this list when
// `role === 'hr' || role === 'admin'` client-side, but that was never
// actually enforced server-side until now — the collection's own
// PocketBase rules were the only thing standing between "logged in as
// Employee" and "sees every applicant's name, email, and cover letter,"
// and those rules were public.
//
// Optional `?email=` narrows to one applicant's own applications — added
// for hrData.ts's exportEmployeeArchive ("Download Archive" HR/Admin
// action), which used to read hr_career_applications directly via the
// public client before that collection's rules were locked down.
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (session.role !== 'hr' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  try {
    const email = new URL(request.url).searchParams.get('email');
    const rows = email ? await adminListCareerApplicationsForEmail(email) : await adminListCareerApplications();
    return NextResponse.json({ applications: rows.map(toCareerApplication) });
  } catch (err: any) {
    console.error('[admin/careers/applications GET] error:', err);
    return NextResponse.json({ error: 'Could not load applications.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (session.role !== 'hr' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = typeof body?.id === 'string' ? body.id : '';
  const status = typeof body?.status === 'string' ? body.status : '';
  const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];
  if (!id || !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'id and a valid status are required.' }, { status: 400 });
  }

  try {
    await adminUpdateCareerApplicationStatus(id, status);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[admin/careers/applications POST] error:', err);
    return NextResponse.json({ error: 'Could not update application status.' }, { status: 500 });
  }
}

// Purge every application under one email — used only by hrActions.
// deleteEmployee's permanent-delete flow (see that function's own
// comment). ?email= required; there is deliberately no by-id delete here,
// since nothing else in the app removes a single application.
export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (session.role !== 'hr' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }
  const email = new URL(request.url).searchParams.get('email');
  if (!email) return NextResponse.json({ error: 'email is required.' }, { status: 400 });
  try {
    await adminDeleteCareerApplicationsForEmail(email);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[admin/careers/applications DELETE] error:', err);
    return NextResponse.json({ error: 'Could not delete applications.' }, { status: 500 });
  }
}
