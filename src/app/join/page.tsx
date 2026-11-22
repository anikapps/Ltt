'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Link2, ShieldCheck, Compass, AlertCircle } from 'lucide-react';
import MinimalNav from '@/components/MinimalNav';

function readInviteToken(value: string): string {
  const raw = value.trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    const joinIndex = parts.findIndex((part) => part.toLowerCase() === 'join');
    if (joinIndex >= 0 && parts[joinIndex + 1]) return parts[joinIndex + 1];
    const queryToken = url.searchParams.get('invite') || url.searchParams.get('code');
    if (queryToken) return queryToken.trim();
  } catch {
    // The traveller may have pasted only a short invite code or a relative path.
  }

  const withoutPrefix = raw.replace(/^\/?join\//i, '').replace(/^\//, '');
  const token = withoutPrefix.split(/[?#\s]/)[0]?.trim() || '';
  return /^[a-z0-9_-]{3,160}$/i.test(token) ? token : '';
}

export default function JoinTripGatewayPage() {
  const router = useRouter();
  const [inviteInput, setInviteInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = readInviteToken(inviteInput);
    if (!token) {
      setError('Enter a valid trip invitation link or invitation code from your tour organizer.');
      return;
    }
    router.push(`/join/${encodeURIComponent(token)}`);
  };

  return (
    <main className="flex min-h-screen flex-col bg-slate-50">
      <MinimalNav tripName="LTT BD" touristLabel="Join your group" />
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <section className="w-full max-w-xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,35,69,0.12)]">
          <div className="bg-gradient-to-br from-[#101f3b] via-[#183968] to-[#2459a7] px-6 py-8 text-white sm:px-9 sm:py-10">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-lg"><Compass className="h-6 w-6" /></div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200">Welcome aboard</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Join your trip.</h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-blue-100">Enter the invitation link or code shared by your tour organizer to securely join your travel group.</p>
          </div>

          <div className="space-y-6 px-6 py-7 sm:px-9 sm:py-9">
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <label htmlFor="trip-invite" className="block text-sm font-semibold text-slate-800">Trip invitation link or code</label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="trip-invite"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste your trip link or enter the code"
                  value={inviteInput}
                  onChange={(event) => { setInviteInput(event.target.value); setError(''); }}
                  className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  aria-describedby={error ? 'invite-error' : 'invite-help'}
                />
              </div>
              {error ? (
                <p id="invite-error" role="alert" className="flex items-start gap-2 text-xs font-medium text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
              ) : (
                <p id="invite-help" className="text-xs leading-relaxed text-slate-500">You can paste the full WhatsApp invitation URL or enter the short code exactly as provided.</p>
              )}
              <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-900/15 transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200">
                Continue to secure check-in <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <p className="text-xs font-bold text-emerald-900">Your details stay protected</p>
                <p className="mt-1 text-xs leading-relaxed text-emerald-800/90">Your name and registered contact or passport details are checked against the organizer’s passenger list. Other travellers cannot view your passport or phone number.</p>
              </div>
            </div>

            <p className="text-center text-xs text-slate-500">Need an invitation? Contact your tour leader or the person who arranged your booking.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
