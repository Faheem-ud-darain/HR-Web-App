import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

interface SectionCardProps {
  title: string;
  subtitle?: string;
  // A small number beside the title (items in the list, how many are new).
  count?: number;
  // The control on the right of the header: a "View all" link, an Edit button.
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

// One block of a page: a card with a header (title, optional count and subtitle, an action on the right) and a body that
// runs edge to edge, so lists and tables can draw their own dividers. The same card is used on every dashboard and
// profile page.
export function SectionCard({ title, subtitle, count, action, className = '', children }: SectionCardProps) {
  return (
    <Card className={`border border-slate-200 p-0 overflow-hidden ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3.5 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            {title}
            {count !== undefined && count > 0 && <Badge variant="default" size="sm">{count}</Badge>}
          </h3>
          {subtitle && <p className="mt-0.5 text-caption text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}
