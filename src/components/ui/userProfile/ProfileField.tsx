import React from 'react';
import type { Icon } from '@phosphor-icons/react';

// One labelled value in the profile card's two-column grid; an optional icon sits before the value.
export function ProfileField({ label, icon: Icon, title, className = '', children }: {
  label: string; icon?: Icon; title?: string; className?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase" title={title}>{label}</p>
      <p className={`text-xs font-semibold text-slate-700 mt-0.5 flex items-center gap-1 ${className}`}>
        {Icon && <Icon weight="duotone" className="h-3.5 w-3.5 text-slate-400" />} {children}
      </p>
    </div>
  );
}
