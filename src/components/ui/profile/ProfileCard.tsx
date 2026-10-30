import React from 'react';
import type { IconWeight } from '@phosphor-icons/react';
import { PencilSimpleIcon as Pencil } from '@/components/ui/icons';
import { Button } from '@/components/ui/Button';
import { SectionCard } from '@/components/ui/SectionCard';

// A section of a profile page: a title (with an Edit button, or any other action, on the right) and a body.
export function ProfileCard({ title, subtitle, action, onEdit, children }: { title: string; subtitle?: string; action?: React.ReactNode; onEdit?: () => void; children: React.ReactNode }) {
  const right = action ?? (onEdit && <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit</Button>);
  return <SectionCard title={title} subtitle={subtitle} action={right}>{children}</SectionCard>;
}

// What a section says when there is nothing in it yet.
export const ProfileEmpty = ({ children }: { children: React.ReactNode }) => (
  <p className="px-4 md:px-6 py-6 text-center text-xs text-slate-500 italic font-semibold">{children}</p>
);

// Currency symbols drawn like an icon, for the salary row.
const glyph = (symbol: string) => function Glyph({ className }: { className?: string }) { return <span className={`font-bold text-sm leading-none ${className}`}>{symbol}</span>; };
export const DollarSign = glyph('$');
export const RupeeSign = glyph('₨');

// One line of a profile section: a small icon tile, a tiny caps label and the value under it.
export function InfoRow({ icon: Icon, label, value, mono = false, iconClass = 'bg-slate-100 text-slate-500', valueClass = 'text-slate-900' }: {
  // A Phosphor icon, or a small custom glyph such as a currency sign (which ignores the weight).
  icon?: React.ComponentType<{ className?: string; weight?: IconWeight }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  iconClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3.5 md:py-4">
      {Icon && (
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass.split(' ')[0]}`}>
          <Icon weight="duotone" className={`h-4 w-4 ${iconClass.split(' ')[1]}`} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-caption font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-semibold mt-0.5 break-words ${mono ? 'font-mono' : ''} ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}

// The rows of a profile section, divided by thin lines.
export const InfoList = ({ children }: { children: React.ReactNode }) => <div className="divide-y divide-slate-100">{children}</div>;
