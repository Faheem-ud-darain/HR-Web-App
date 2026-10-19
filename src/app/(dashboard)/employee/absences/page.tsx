'use client';

import React from 'react';
import { AbsenceDetailsView } from '@/components/ui/lazy';
import { useSessionEmail } from '@/lib/useSession';

export default function EmployeeAbsencesPage() {
  const email = useSessionEmail();
  if (!email) return null;
  return <AbsenceDetailsView role="employee" filterEmail={email} />;
}
