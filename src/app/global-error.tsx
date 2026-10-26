'use client';

// Last resort: used only when the root layout itself fails, so it brings its own <html> and <body>
// and uses plain inline styles (nothing from the app's stylesheet or providers can be relied on).
export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, textAlign: 'center' }}>
            <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: '#475569', margin: '0 0 16px' }}>
              The app could not start. Your data is safe. Try again, or reload the page.
            </p>
            {error.digest && <p style={{ fontSize: 11, color: '#94a3b8' }}>Reference: {error.digest}</p>}
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ background: '#ea580c', color: '#fff', border: 0, borderRadius: 12, padding: '12px 16px', fontWeight: 700, fontSize: 14, minHeight: 44, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
