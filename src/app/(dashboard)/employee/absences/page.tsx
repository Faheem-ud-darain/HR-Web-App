'use client';

import React, { useEffect, useState } from 'react';
import { AbsenceDetailsView } from '@/components/ui/AbsenceDetailsView';
import { getSessionEmail } from '@/lib/session';

export default function EmployeeAbsencesPage() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => { setEmail(getSessionEmail()); }, []);
  if (!email) return null;
  return <AbsenceDetailsView role="employee" filterEmail={email} />;
}
