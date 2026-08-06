'use client';

import React, { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { appReleaseActions, AppRelease } from '@/lib/appReleases';
import { Download, Smartphone } from 'lucide-react';

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
  
  useEffect(() => {
    async function checkUpdate() {
      // 1. Only run this check inside the native Android Capacitor app.
      if (Capacitor.getPlatform() !== 'android') return;

      try {
        const release = await appReleaseActions.getLatestRelease();
        if (!release || !release.is_mandatory) return;
        
        setLatestRelease(release);
        
        // 2. Get current installed version
        const info = await App.getInfo();
        const currentVersion = info.version; // e.g. "1.0.5"

        // 3. Compare
        if (compareVersions(release.version, currentVersion) === 1) {
          setNeedsUpdate(true);
        }
      } catch (e) {
        console.error('Failed to check for app updates:', e);
      }
    }
    
    checkUpdate();
  }, []);

  if (needsUpdate && latestRelease) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[9999] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center">
          <div className="h-20 w-20 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center mb-6">
            <Smartphone className="h-10 w-10" />
          </div>
          
          <h1 className="text-2xl font-black text-slate-900 mb-2">Update Required</h1>
          <p className="text-slate-500 font-medium mb-6">
            You are using an older version of the app. Please update to version <span className="font-bold text-slate-700">{latestRelease.version}</span> to continue using the system.
          </p>

          <a 
            href={appReleaseActions.getApkUrl(latestRelease)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              const url = appReleaseActions.getApkUrl(latestRelease);
              if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()) {
                e.preventDefault();
                window.location.href = url;
              }
            }}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="h-5 w-5" />
            Download Update
          </a>

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

  // If no update needed, render the normal app.
  return <>{children}</>;
}
