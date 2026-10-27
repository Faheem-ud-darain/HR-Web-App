'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { setThemePreference, useResolvedTheme, useThemePreference, type ThemePreference } from '@/lib/theme';
import { triggerHaptic } from '@/lib/haptics';
import { Card } from './Card';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Automatic', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

// Segmented control, like Settings > Display & Brightness on iOS.
export function ThemeSegmentedControl() {
  const pref = useThemePreference();
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => { triggerHaptic.selection(); setThemePreference(value); }}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Settings card for the Profile pages.
export function AppearanceCard() {
  return (
    <Card className="border border-slate-200 p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-2 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Appearance</h3>
        <p className="text-xs text-slate-500 pb-3 pt-1">Automatic matches your phone or computer, switching to dark at night.</p>
      </div>
      <div className="p-4">
        <ThemeSegmentedControl />
      </div>
    </Card>
  );
}

// Quick toggle for the top bar: flips between light and dark in one tap. (The three-way choice, including
// Automatic, lives on the Profile page.)
export function ThemeIconButton({ className = '' }: { className?: string }) {
  const resolved = useResolvedTheme();
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      onClick={() => { triggerHaptic.light(); setThemePreference(dark ? 'light' : 'dark'); }}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={`p-2 rounded-full text-slate-500 hover:bg-slate-100 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center ${className}`}
    >
      {dark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}
