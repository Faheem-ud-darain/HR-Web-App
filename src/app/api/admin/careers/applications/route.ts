import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/serverAuth';
import { adminListCareerApplications, adminUpdateCareerApplicationStatus } from '@/lib/pbAdmin';

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
export async function GET(request: Request) {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  if (session.role !== 'hr' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  try {
    const rows = await adminListCareerApplications();
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