'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  MapPin,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { BrandLogoMark } from '@/components/BrandIdentity';

interface InviteTrip {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
}

export default function InviteJoinPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<InviteTrip | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [remembered, setRemembered] = useState<{ displayName: string; maskedIdentifier: string } | null>(null);

  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [wrongTrip, setWrongTrip] = useState<{ id: string; name: string } | null>(null);

  // Post-login location consent screen
  const [verifiedTrip, setVerifiedTrip] = useState<{ tripId: string; tripName: string; displayName: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');

  useEffect(() => {
    fetch(`/api/tourist/verify?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const d = await r.json();
        if (d?.remembered) setRemembered(d.remembered);
        if (!r.ok || !d?.valid) {
          setInviteError(d?.error || 'This invitation link is invalid or expired.');
        } else {
          setTrip(d.trip);
        }
      })
      .catch(() => setInviteError('Unable to verify invitation link.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent, overrideWithoutToken = false) {
    e.preventDefault();
    setErrorMsg('');
    setWrongTrip(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/tourist/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: overrideWithoutToken ? '' : token,
          fullName,
          identifier,
          rememberMe,
          consentGranted: false
        })
      });
      const data = await res.json();

      if (res.status === 409 && data?.wrongTripMatch && data?.matchedTrip) {
        setWrongTrip(data.matchedTrip);
        setErrorMsg(data.error);
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Could not verify your details.');
        return;
      }

      setVerifiedTrip({
        tripId: data.tripId,
        tripName: data.tripName || trip?.name || 'Your Tour',
        displayName: data.member?.display_name || fullName
      });
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLocationDecision(enable: boolean) {
    if (!verifiedTrip) return;
    if (!enable) {
      localStorage.setItem('lttbd_loc_pref', 'disabled');
      router.push(`/trip/${verifiedTrip.tripId}`);
      return;
    }

    if (!('geolocation' in navigator)) {
      setLocError('GPS is not supported in this browser. Continuing with sharing paused.');
      router.push(`/trip/${verifiedTrip.tripId}`);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        localStorage.setItem('lttbd_loc_pref', 'enabled');
        await fetch(`/api/tourist/trip/${verifiedTrip.tripId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_location',
            sharingEnabled: true,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            permissionStatus: 'granted'
          })
        });
        setLocating(false);
        router.push(`/trip/${verifiedTrip.tripId}`);
      },
      () => {
        setLocating(false);
        setLocError('Location permission was denied or GPS is off. You can enable it anytime from the Live Map.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col justify-center px-4 py-10">
      <div className="max-w-md w-full mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <BrandLogoMark />
          <Link href="/join" className="text-xs text-slate-300 hover:text-white underline">
            Find another trip
          </Link>
        </div>

        {loading ? (
          <div className="bg-white text-slate-900 rounded-3xl p-8 text-center text-sm font-medium">
            Identifying your trip invitation...
          </div>
        ) : inviteError ? (
          <div className="bg-white text-slate-900 rounded-3xl p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h1 className="text-lg font-bold">{inviteError}</h1>
            <Link
              href="/join"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 text-white px-5 py-3 text-sm font-bold"
            >
              Search my trip by name &amp; phone <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        ) : !verifiedTrip ? (
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="mb-5">
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                {trip?.destination}
              </span>
              <h1 className="text-2xl font-extrabold text-slate-900 mt-2">{trip?.name}</h1>
              <p className="text-xs text-slate-500 mt-1">
                {trip?.start_date} to {trip?.end_date} · No trip code needed
              </p>
            </div>

            {remembered && (
              <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setFullName(remembered.displayName)}
                  className="text-left"
                >
                  <div className="text-xs font-bold text-blue-800 flex items-center gap-1">
                    <BookmarkCheck className="w-3.5 h-3.5" /> Tap to fill saved name
                  </div>
                  <div className="text-sm font-semibold">{remembered.displayName} ({remembered.maskedIdentifier})</div>
                </button>
                <button
                  type="button"
                  onClick={() => fetch('/api/tourist/verify', { method: 'DELETE' }).then(() => setRemembered(null))}
                  className="p-1.5 text-slate-400 hover:text-rose-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
                <p>{errorMsg}</p>
                {wrongTrip && (
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e, true)}
                    className="mt-2.5 w-full rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 text-xs"
                  >
                    Switch &amp; Join {wrongTrip.name}
                  </button>
                )}
              </div>
            )}

            <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Passenger name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Passport number or phone number
                </label>
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter passport or mobile number"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Remember my masked details on this device</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 text-sm shadow-lg"
              >
                {submitting ? 'Verifying...' : 'Continue to my trip'} <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Secure passenger access · No account registration required</span>
            </div>
          </div>
        ) : (
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full mb-3">
              <CheckCircle2 className="w-4 h-4" /> Passenger identified
            </div>
            <h2 className="text-xl font-extrabold">{verifiedTrip.tripName}</h2>
            <p className="text-sm text-slate-600 mt-1">
              Enable live location so your tour leader can see your last known position and assist you in emergencies.
            </p>
            {locError && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                {locError}
              </div>
            )}
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={locating}
                onClick={() => handleLocationDecision(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 text-sm"
              >
                <MapPin className="w-4 h-4" /> {locating ? 'Getting GPS...' : 'Enable location'}
              </button>
              <button
                type="button"
                onClick={() => handleLocationDecision(false)}
                className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 text-sm"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
