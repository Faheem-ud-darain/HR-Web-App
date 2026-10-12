import React from 'react';

// The one loading spinner. Previously a 4-line inline <svg> was pasted into
// the landing page, the auth page and the dashboard layout.
export function Spinner({ className = 'h-8 w-8 text-orange-600' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" role="status" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}

// Full-viewport centered spinner for "checking session / loading app" gates.
// `fit="min"` (min-h-screen) lets content taller than the viewport scroll;
// `fit="exact"` (h-screen) is for app-shell layouts that never scroll.
export function PageLoader({ fit = 'min' }: { fit?: 'min' | 'exact' }) {
  return (
    <div className={`${fit === 'min' ? 'min-h-screen' : 'h-screen'} flex items-center justify-center bg-slate-50`}>
      <Spinner />
    </div>
  );
}
