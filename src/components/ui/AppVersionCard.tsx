'use client';

import { useEffect, useState } from 'react';
import { Card } from './Card';
import { Capacitor } from '@capacitor/core';
import { Info, Globe, Smartphone, Apple } from 'lucide-react';
import { APP_VERSIONS, AppPlatform } from '@/lib/appVersion';

// Shown at the bottom of every Profile Settings page (employee/hr/admin).
// Purely informational — no editable state, no PocketBase calls. Version
// numbers come from src/lib/appVersion.ts (hand-maintained, see that file's
// header comment for why it can't be read live from package.json/
// build.gradle/Info.plist at runtime).
const PLATFORM_META: { key: AppPlatform; label: string; icon: typeof Globe }[] = [
  { key: 'web', label: 'Website', icon: Globe },
  { key: 'android', label: 'Android app', icon: Smartphone },
  { key: 'ios', label: 'iOS app', icon: Apple },
];

export function AppVersionCard() {
  // Capacitor.getPlatform() returns 'web' | 'android' | 'ios' — used only
  // here to highlight which row matches the device the user is currently
  // on; every row is shown regardless, so this can't fail loudly on web
  // (where Capacitor.getPlatform() always safely returns 'web').
  const [currentPlatform, setCurrentPlatform] = useState<AppPlatform>('web');

  useEffect(() => {
    const p = Capacitor.getPlatform();
    if (p === 'android' || p === 'ios') setCurrentPlatform(p);
    else setCurrentPlatform('web');
  }, []);

  return (
    <Card className="border border-slate-200 p-0 overflow-hidden">
      <div className="px-6 pt-5 pb-2 border-b border-slate-100">
        <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" /> App Version
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Current version for the app you&apos;re using, plus the other platforms for reference.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {PLATFORM_META.map(({ key, label, icon: Icon }) => {
          const isCurrent = key === currentPlatform;
          return (
            <div key={key} className="flex items-center gap-4 px-6 py-4">
              <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                <p className="text-sm font-semibold text-slate-900 mt-0.5 truncate">Version {APP_VERSIONS[key]}</p>
              </div>
              {isCurrent && (
                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full flex-shrink-0">
                  You&apos;re here
                </span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
