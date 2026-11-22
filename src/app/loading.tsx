import { Compass } from 'lucide-react';

export default function Loading() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center" role="status" aria-live="polite">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-900/15">
        <Compass className="h-7 w-7 animate-pulse" />
      </span>
      <div>
        <p className="text-sm font-bold text-slate-900">Getting your trip ready</p>
        <p className="mt-1 text-xs text-slate-500">Connecting your LTT BD experience…</p>
      </div>
    </main>
  );
}
