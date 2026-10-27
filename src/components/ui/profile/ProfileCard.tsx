import React from 'react';
import { Card } from '@/components/ui/Card';

// A section of a profile page: a title (with an optional action on the right, e.g. an Edit button) and a body.
export function ProfileCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="border border-slate-200 p-0 overflow-hidden">
      <div className={`px-6 pt-5 pb-2 border-b border-slate-100 ${action ? 'flex items-center justify-between' : ''}`}>
        <div>
          <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-400 mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

// One line of a profile section: a small icon tile, a tiny caps label and the value under it.
export function InfoRow({ icon: Icon, label, value, mono = false, iconClass = 'bg-slate-100 text-slate-500', valueClass = 'text-slate-900' }: {
  // Any component that draws an icon and accepts a className (a Lucide icon, or a currency symbol).
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  iconClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-4">
      {Icon && (
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconClass.split(' ')[0]}`}>
          <Icon className={`h-4 w-4 ${iconClass.split(' ')[1]}`} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-semibold mt-0.5 truncate ${mono ? 'font-mono' : ''} ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
}
