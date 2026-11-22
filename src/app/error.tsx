'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the error available to the runtime's error reporting without exposing details to travellers.
    console.error('LTT BD route error:', error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><AlertTriangle className="h-7 w-7" /></span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-slate-950">We hit a temporary problem.</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">Your trip information is safe. Try loading this page again, or return to the LTT BD home page.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => reset()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-800"><RefreshCw className="h-4 w-4" /> Try again</button>
          <Link href="/" className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Go home</Link>
        </div>
        {error.digest && <p className="mt-6 text-[10px] text-slate-400">Reference: {error.digest}</p>}
      </section>
    </main>
  );
}
