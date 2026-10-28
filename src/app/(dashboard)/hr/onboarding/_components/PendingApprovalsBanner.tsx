'use client';

import React from 'react';
import { ListChecksIcon as ClipboardCheck } from '@/components/ui/icons';
import { displayName, type Profile } from '@/lib/hrData';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

// The amber box above the list: everyone waiting for their documents to be reviewed.
export function PendingApprovalsBanner({ pending, onReview }: { pending: Profile[]; onReview: (emp: Profile) => void }) {
  return (
    <Card className="border border-amber-200 bg-amber-50/40 overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-200/70 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-amber-600" />
        <h2 className="font-bold text-slate-900 text-sm">Pending Document Approvals ({pending.length})</h2>
      </div>
      <div className="divide-y divide-amber-200/60">
        {pending.map(emp => (
          <div key={emp.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">{displayName(emp, 'hr')}</p>
              <p className="text-xs text-slate-500 font-medium">{emp.email} · {emp.jobTitle || 'Staff'}</p>
            </div>
            <Button variant="outline" size="md" className="self-start sm:self-auto !border-amber-300 !text-amber-800 hover:!bg-amber-100" onClick={() => onReview(emp)}>Review Documents</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
