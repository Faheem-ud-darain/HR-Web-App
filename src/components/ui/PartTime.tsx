'use client';

import React from 'react';
import { Badge } from './Badge';
import { Checkbox } from './Checkbox';
import { PART_TIME_DAY_MINUTES, canSeePartTime, hoursText } from '@/lib/core/workDay';
import { useSessionEmail, useSessionRole } from '@/lib/useSession';

// The two pieces of the part-time setting, shared by every screen: the switch HR/Admin use (profile editor) and the badge that marks a
// part-time employee wherever a name is shown. The numbers come from core/workDay.ts, never typed here.
const HOURS = hoursText(PART_TIME_DAY_MINUTES);

export function PartTimeField({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Checkbox
      checked={checked}
      onChange={onChange}
      className="min-h-0! rounded-xl border border-slate-200 bg-slate-50/60 p-3"
      hint={`A full day is ${HOURS} hours instead of 8. Pay is deducted only for the hours short of ${HOURS}, and a day under half of that counts as an absence. The salary is not changed.`}
    >
      Part-time employee
    </Checkbox>
  );
}

/** Marks a part-time employee. Shows nothing for full-time staff, and nothing to anyone but HR, Admin and that employee: the rule is here so no page can show it to anyone else. */
export function PartTimeBadge({ partTime, email, className }: { partTime?: boolean; email: string; className?: string }) {
  const viewerEmail = useSessionEmail();
  const viewerRole = useSessionRole();
  return partTime && canSeePartTime({ email: viewerEmail, role: viewerRole }, email) ? <Badge variant="info" size="sm" className={className}>Part-Time</Badge> : null;
}
