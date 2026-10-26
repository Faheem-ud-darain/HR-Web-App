import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center shadow-sm">
        <p className="text-4xl font-bold text-orange-600" aria-hidden="true">404</p>
        <h1 className="mt-1 text-lg font-bold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-600">This page does not exist or has moved. Check the address, or go back to the start page.</p>
        <Link href="/" className="mt-5 inline-flex items-center justify-center rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 min-h-[44px]">
          Go to the start page
        </Link>
      </div>
    </div>
  );
}
