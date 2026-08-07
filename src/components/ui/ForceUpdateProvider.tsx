'use client';

import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { appReleaseActions, AppRelease } from '@/lib/appReleases';
import { Download, Smartphone, X } from 'lucide-react';

function cleanVersion(v: string) {
  return v ? v.replace(/^v/i, '').trim() : '0';
}

// Robust semver compare: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal.
function compareVersions(v1: string, v2: string) {
  const p1 = cleanVersion(v1).split('.').map(n => parseInt(n, 10) || 0);
  const p2 = cleanVersion(v2).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function ForceUpdateProvider({ children }: { children: React.ReactNode }) {
  const [latestRelease, setLatestRelease] = useState<AppRelease | null>(null);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  
  useEffect(() => {
    async function checkUpdate() {
      // Only run this check inside the native Android Capacitor app.
      // Web portal users should never see this popup — they always use the
      // latest deployed version by definition.
      if (Capacitor.getPlatform() !== 'android') return;

      try {
        const release = await appReleaseActions.getLatestRelease();
        if (!release) return;
        
        // Get current installed version from native build config
        const info = await App.getInfo();
        const currentVersion = info.version; // e.g. "1.0.5"

        // Only prompt if the latest published release is newer than installed
        if (compareVersions(release.version, currentVersion) === 1) {
          setLatestRelease(release);
          setNeedsUpdate(true);
        }
      } catch (e) {
        console.error('Failed to check for app updates:', e);
      }
    }
    
    checkUpdate();
  }, []);

  const handleDownload = () => {
    if (!latestRelease) return;
    const url = appReleaseActions.getApkUrl(latestRelease);
    // On Capacitor native, open in system browser so Android can pick up the APK install intent
    if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
      window.open(url, '_system');
    } else {
      window.location.href = url;
    }
  };

  const isMandatory = latestRelease?.is_mandatory ?? true;

  if (needsUpdate && latestRelease && !dismissed) {
    return (
      <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center relative">
          {/* Close/Later button — only for optional updates */}
          {!isMandatory && (
            <button
              onClick={() => setDismissed(true)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1"
              title="Skip for now"
            >
              <X className="h-5 w-5" />
            </button>
          )}

          <div className="h-20 w-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-6">
            <Smartphone className="h-10 w-10" />
          </div>
          
          <h1 className="text-2xl font-black text-slate-900 mb-2">
            {isMandatory ? 'Update Required' : 'Update Available'}
          </h1>
          <p className="text-slate-500 font-medium mb-6">
            {isMandatory
              ? <>A mandatory update to version <span className="font-bold text-slate-700">{latestRelease.version}</span> is required to continue using the app.</>
              : <>Version <span className="font-bold text-slate-700">{latestRelease.version}</span> is available. Update now for the latest features and fixes.</>
            }
          </p>

          <button
            onClick={handleDownload}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <Download className="h-5 w-5" />
            Download Update
          </button>

          {!isMandatory && (
            <button
              onClick={() => setDismissed(true)}
              className="mt-3 w-full py-3 rounded-xl font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors text-sm"
            >
              Later
            </button>
          )}

          {latestRelease.release_notes && (
            <div className="mt-6 text-left w-full">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">What's New:</span>
              <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg whitespace-pre-wrap border border-slate-100">
                {latestRelease.release_notes}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If no update needed (or dismissed optional update), render the normal app.
  return <>{children}</>;
}
