'use client';

import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

// What every error page shows: plain words, a retry, and a way home. Used by app/error.tsx and
// app/(dashboard)/error.tsx so a crash in one screen never leaves a blank page.
export function ErrorPanel({ error, onRetry, fullScreen = false }: { error: Error & { digest?: string }; onRetry: () => void; fullScreen?: boolean }) {
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);

  return (
    <div role="alert" className={`${fullScreen ? 'min-h-screen' : 'min-h-[60vh]'} flex items-center justify-center bg-slate-50 p-6`}>
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
        <p className="mt-1 text-sm text-slate-600">
          This screen could not load. Your data is safe. Try again, and if it keeps happening tell HR or Admin what you were doing.
        </p>
        {error.digest && <p className="mt-2 text-[11px] text-slate-400">Reference: {error.digest}</p>}
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <button type="button" onClick={onRetry} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 min-h-[44px]">
            Try again
          </button>
          {/* A full page load on purpose: if the router itself is what broke, this still works. */}
          <button type="button" onClick={() => window.location.assign('/')} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]">
            Go to the start page
          </button>
        </div>
      </div>
    </div>
  );
}
