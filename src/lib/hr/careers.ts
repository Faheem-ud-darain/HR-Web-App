// src/lib/hr/careers.ts
// Careers (job postings + applicant pipeline) — kept as its own module
// (an 11th file beyond the plan's 10-module list) rather than folded into
// tasks.ts or profiles.ts: it's a self-contained hiring pipeline with its
// own type (CareerPosition/CareerApplication) and no real overlap with
// either domain's own logic. Extracted from the former hrData.ts monolith
// (plan 014). See plans/014-split-hrdata-monolith.md.

'use client';
import { useQuery } from '@tanstack/react-query';
import { getAuthToken } from '../session';
import { API_BASE } from '../apiBase';
import type { CareerPosition, CareerApplicationStatus, CareerApplication } from './types';
import { pbList, pbCreate, pbDelete } from './shared';

function toCareer(c: any): CareerPosition {
  return { id: c.id, title: c.title, department: c.department, location: c.location, description: c.description, requirements: c.requirements || [] };
}

export function useCareers() {
  return useQuery({ queryKey: ['hr_careers'], queryFn: async () => (await pbList('hr_careers')).map(toCareer) });
}

export async function getCareerApplicationsAdmin(): Promise<CareerApplication[]> {
  const token = getAuthToken();
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/admin/careers/applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.applications || []) as CareerApplication[];
}

export async function updateApplicationStatusAdmin(id: string, status: CareerApplicationStatus): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/admin/careers/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
}

export async function getCareerApplicationsForEmailAdmin(email: string): Promise<any[]> {
  const token = getAuthToken();
  if (!token) return [];
  try {
    const res = await fetch(`${API_BASE}/api/admin/careers/applications?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.applications || [];
  } catch {
    return [];
  }
}

export async function deleteCareerApplicationsForEmailAdmin(email: string): Promise<void> {
  const token = getAuthToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/api/admin/careers/applications?email=${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort, same as the other independent purge branches in deleteEmployee
  }
}

export const careerActions = {
  // ── Careers ───────────────────────────────────────────────────────────
  addCareer: (position: Omit<CareerPosition, 'id'>) =>
    pbCreate('hr_careers', { title: position.title, department: position.department, location: position.location, type: '', description: position.description, requirements: position.requirements, status: 'open', created_by: '' }),
  deleteCareer: (id: string) => pbDelete('hr_careers', id),
  // hasAppliedForPosition / submitCareerApplication / updateApplicationStatus
  // (public direct-PocketBase reads/writes of applicant PII) were removed
  // as part of plan 012, Phase 1 — replaced by submitCareerApplicationPublic,
  // getCareerApplicationsAdmin, and updateApplicationStatusAdmin below,
  // matching the same Authorization: Bearer <token> pattern
  // upsertPayrollRecordAdmin/usePayrollSelf already use.

  // Public, no session — job applicants have no app account (see
  // CareersView.tsx's `canApply = role === 'public'`). Talks to
  // src/app/api/careers/apply, the sole writer left for
  // hr_career_applications once that collection's PocketBase rules are
  // locked down. Throws with the route's own error message (e.g. the
  // duplicate-application guard) so the caller can show it inline.
  submitCareerApplicationPublic: async (app: {
    positionId: string; positionTitle: string; applicantName: string; applicantEmail: string; coverLetter: string;
  }): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/careers/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Request failed: ${res.status}`);
    }
  },
};
