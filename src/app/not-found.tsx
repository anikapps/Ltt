import Link from 'next/link';
import { ArrowLeft, Compass, MapPin } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><MapPin className="h-7 w-7" /></span>
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700">404 · Route not found</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">This stop isn’t on the itinerary.</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">The page may have moved, or the invitation link may be incomplete. Check the link with your tour organizer.</p>
        <Link href="/" className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"><ArrowLeft className="h-4 w-4" /> Back to LTT BD</Link>
        <div className="mt-8 flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400"><Compass className="h-3.5 w-3.5" /> LTT BD</div>
      </section>
    </main>
  );
}
