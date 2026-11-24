'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  Compass,
  MapPin,
  ShieldCheck,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { BrandLogoMark } from '@/components/BrandIdentity';

interface RememberedInfo {
  displayName: string;
  maskedIdentifier: string;
  tripId: string;
  tripName: string;
}

export default function SmartJoinPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [remembered, setRemembered] = useState<RememberedInfo | null>(null);
  const [activeTrip, setActiveTrip] = useState<{ id: string; name: string; destination: string } | null>(null);
  const [autoSwitched, setAutoSwitched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [candidates, setCandidates] = useState<Array<{ tripId: string; tripName: string; subgroup: string; maskedName: string }>>([]);

  // Post-login location permission step
  const [verifiedTrip, setVerifiedTrip] = useState<{ tripId: string; tripName: string; displayName: string } | null>(null);
  const [permState, setPermState] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState('');

  useEffect(() => {
    fetch('/api/tourist/verify')
      .then((r) => r.json())
      .then((d) => {
        if (d?.remembered) setRemembered(d.remembered);
        if (d?.activeTrip) setActiveTrip(d.activeTrip);
      })
      .catch(() => {});

    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((res) => setPermState(res.state as 'prompt' | 'granted' | 'denied'))
        .catch(() => {});
    }
  }, []);

  async function handleClearRemembered() {
    await fetch('/api/tourist/verify', { method: 'DELETE' });
    setRemembered(null);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setCandidates([]);
    setSubmitting(true);

    try {
      const res = await fetch('/api/tourist/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedTripId: activeTrip?.id || '',
          fullName,
          identifier,
          rememberMe,
          consentGranted: false
        })
      });
      const data = await res.json();

      if (res.status === 300 && data?.ambiguous) {
        setCandidates(data.candidates || []);
        setErrorMsg(data.error || 'Multiple passengers matched. Please enter your full name and exact phone or passport.');
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to verify your booking.');
        return;
      }

      if (data.autoSwitched) setAutoSwitched(true);
      // Show post-login location permission step immediately
      setVerifiedTrip({
        tripId: data.tripId,
        tripName: data.tripName || 'Your Tour',
        displayName: data.member?.display_name || fullName
      });
    } catch {
      setErrorMsg('Network error. Please check your internet connection.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnableLocationAndContinue(enable: boolean) {
    if (!verifiedTrip) return;
    setLocError('');

    if (!enable) {
      localStorage.setItem('lttbd_loc_pref', 'disabled');
      router.push(`/trip/${verifiedTrip.tripId}`);
      return;
    }

    if (!('geolocation' in navigator)) {
      setPermState('unsupported');
      setLocError('This browser does not support GPS location. You can still view the map and trip essentials.');
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
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermState('denied');
          setLocError('Location permission was denied. Open your browser site settings to allow Location, or continue with sharing paused.');
        } else {
          setLocError('GPS signal is currently unavailable (turn on Device Location / GPS and try again, or continue with sharing paused).');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col justify-center px-4 py-10">
      <div className="max-w-md w-full mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Back to LTT BD
          </Link>
          <BrandLogoMark />
        </div>

        {!verifiedTrip ? (
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="mb-6">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                <Compass className="w-3.5 h-3.5" /> Welcome to LTT BD
              </span>
              <h1 className="text-2xl font-extrabold text-slate-900 mt-3">Your journey, connected.</h1>
              {activeTrip && (
                <div className="mt-2.5 rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 text-xs text-slate-700">
                  Running tour selected: <strong className="text-slate-900">{activeTrip.name}</strong> ({activeTrip.destination})
                </div>
              )}
              <p className="text-sm text-slate-600 mt-1">
                Enter your name and passport or mobile number to open your live trip.
              </p>
            </div>

            {remembered && (
              <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setFullName(remembered.displayName)}
                  className="text-left flex-1"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800">
                    <BookmarkCheck className="w-3.5 h-3.5" /> Remembered Passenger ({remembered.tripName})
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">{remembered.displayName}</div>
                  <div className="text-xs text-slate-500">ID: {remembered.maskedIdentifier} · Tap to fill name</div>
                </button>
                <button
                  type="button"
                  onClick={handleClearRemembered}
                  title="Remove saved details"
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {candidates.length > 0 && (
              <div className="mb-4 space-y-2">
                {candidates.map((c, idx) => (
                  <div key={idx} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <span className="font-bold">{c.maskedName}</span> · {c.tripName} ({c.subgroup})
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Passenger name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name or part of your name"
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
                  placeholder="e.g., 01711223344 or A12345678"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span>Remember my masked details on this device</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-bold py-3.5 text-sm shadow-lg transition"
              >
                {submitting ? 'Searching active trips...' : 'Continue to my trip'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Secure passenger access · No account registration required</span>
            </div>
          </div>
        ) : (
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full mb-3">
              <CheckCircle2 className="w-4 h-4" /> {autoSwitched ? 'Automatically switched to your registered tour' : 'Passenger identified'}
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">{verifiedTrip.tripName}</h2>
            <p className="text-sm text-slate-600 mt-1">
              Welcome, <span className="font-semibold text-slate-900">{verifiedTrip.displayName}</span>. Help your tour organizer keep you safe:
            </p>

            <ul className="mt-4 space-y-2 text-sm text-slate-700 bg-slate-50 rounded-2xl p-4">
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                <span>See your latest known position on the group map</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Coordinate bus &amp; hotel movements</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Assist you faster during emergencies</span>
              </li>
            </ul>

            <div className="mt-4 text-xs text-slate-500">
              Browser permission status: <span className="font-bold uppercase text-slate-800">{permState}</span>
            </div>

            {locError && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                {locError}
              </div>
            )}

            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={locating}
                onClick={() => handleEnableLocationAndContinue(true)}
                className="w-full rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold py-3.5 text-sm shadow-lg transition"
              >
                {locating ? 'Requesting GPS...' : 'Allow location sharing (Recommended)'}
              </button>
              <button
                type="button"
                onClick={() => handleEnableLocationAndContinue(false)}
                className="w-full rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3 text-sm transition"
              >
                Continue without sharing for now
              </button>
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">You can pause or resume location sharing at any time.</p>
          </div>
        )}
      </div>
    </main>
  );
}
