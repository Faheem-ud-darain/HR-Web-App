import React from 'react';

// One row of a small popup menu (role="menuitem"): an icon and a label, 44px tall so it is easy to tap. Pass `checked` for a
// row that is switched on or off (role="menuitemcheckbox").
export function MenuItem({ icon, onClick, checked, children }: { icon: React.ReactNode; onClick: () => void; checked?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      {icon}
      {children}
    </button>
  );
}
