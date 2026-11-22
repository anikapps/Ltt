'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  MapPin,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Navigation,
  UserCheck,
  Phone
} from 'lucide-react';
import MinimalNav from '@/components/MinimalNav';

interface PublicTripInfo {
  id: string;
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  organizer_contact?: string;
  retention_days?: number;
  status: string;
}



export default function TouristJoinPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;

  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteReason, setInviteReason] = useState('');
  const [trip, setTrip] = useState<PublicTripInfo | null>(null);

  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [consentGranted, setConsentGranted] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function checkInvite() {
      try {
        const res = await fetch(`/api/tourist/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok || !data.valid) {
          setInviteValid(false);
          setInviteReason(data.reason || 'Invalid or expired invitation link.');
        } else {
          setInviteValid(true);
          setTrip(data.trip);
        }
      } catch {
        setInviteValid(false);
        setInviteReason('Unable to verify invitation link.');
      } finally {
        setLoadingInvite(false);
      }
    }
    checkInvite();
  }, [token]);

  const requestLocationAccess = (): Promise<{ lat: number; lng: number; acc: number } | null> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        setGpsStatus('denied');
        resolve(null);
        return;
      }
      setGpsStatus('requesting');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy
          };
          setCoords(c);
          setGpsStatus('granted');
          resolve(c);
        },
        () => {
          // Never manufacture a location. Join can continue with sharing paused.
          setCoords(null);
          setGpsStatus('denied');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 15000 }
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!fullName.trim()) {
      setErrorMsg('Please enter your Full Name or Short Name.');
      return;
    }
    if (!contactNumber.trim() && !passportNumber.trim()) {
      setErrorMsg('Please provide at least one contact identifier: Mobile Number OR Passport Number.');
      return;
    }

    setSubmitting(true);
    try {
      let finalCoords = coords;
      if (consentGranted && !finalCoords) {
        finalCoords = await requestLocationAccess();
      }
      // A granted checkbox is not enough when the device has denied or cannot provide GPS.
      const finalConsent = consentGranted && Boolean(finalCoords);

      const res = await fetch('/api/tourist/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteToken: token,
          fullName,
          preferredDisplayName: fullName,
          contactNumber: contactNumber || undefined,
          passportNumber: passportNumber || undefined,
          emergencyContact: emergencyContact || undefined,
          consentGranted: finalConsent,
          initialLat: finalConsent ? finalCoords?.lat ?? null : null,
          initialLng: finalConsent ? finalCoords?.lng ?? null : null,
          initialAcc: finalConsent ? finalCoords?.acc ?? null : null
        })
      });
      const data = await res.json();
      if (!res.ok || !data.verified) {
        setErrorMsg(data.error || 'Could not join trip.');
        return;
      }

      router.push(`/trip/${data.tripId}`);
    } catch {
      setErrorMsg('We could not connect to LTT BD. Check your internet connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingInvite) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-slate-500">
        Verifying LTT BD trip invitation...
      </div>
    );
  }

  if (!inviteValid || !trip) {
    return (
      <div className="flex-1 flex flex-col bg-slate-100 min-h-screen">
        <MinimalNav tripName="LTT BD" />
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-xl border border-slate-200 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
            <h1 className="text-base font-bold text-slate-900">Invitation Unavailable</h1>
            <p className="text-xs text-slate-600">{inviteReason}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ltt-onboarding-page flex-1 flex flex-col bg-gradient-to-br from-navy-950 via-navy-900 to-brand-800 min-h-screen">
      <MinimalNav
        tripId={trip.id}
        tripName={trip.name}
        touristLabel={`${trip.destination} • Quick Tourist Onboarding`}
      />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="ltt-onboarding-card bg-white max-w-lg w-full rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/20 space-y-5">
          {/* Trip Identity Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shrink-0 shadow-md">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600">
                  YOUR TOUR INVITATION
                </span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-tight">{trip.name}</h1>
                <p className="text-xs text-slate-500">
                  {trip.destination} • {trip.start_date} to {trip.end_date}
                </p>
              </div>
            </div>
          </div>

          {/* Organizer Contact & Privacy Disclosure */}
          <div className="bg-brand-50 border border-brand-200 rounded-2xl p-3.5 text-xs text-slate-800 space-y-1">
            <div className="font-bold text-brand-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-brand-600" />
                Consent-Based Live Location &amp; Privacy
              </span>
              {trip.organizer_contact && (
                <a
                  href={`tel:${trip.organizer_contact}`}
                  className="text-[11px] text-brand-700 underline flex items-center gap-1"
                >
                  <Phone className="w-3 h-3" />
                  {trip.organizer_contact}
                </a>
              )}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Your mobile and passport details are used only to verify your invitation and are never shown to other tourists. Your GPS location is shared only after you opt in.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <div>
                <label htmlFor="full-name" className="block text-xs font-bold text-slate-700 mb-1">
                  Full name on booking *
                </label>
                <input
                  id="full-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="e.g., TANVIR AHMED"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Verify your passenger details</p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Enter the name shown on your booking and either your mobile number or passport number.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="contact-number" className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile number
                  </label>
                  <input
                    id="contact-number"
                    type="tel"
                    autoComplete="tel"
                    placeholder="017XXXXXXXX"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="passport-number" className="block text-xs font-semibold text-slate-700 mb-1">
                    Passport number
                  </label>
                  <input
                    id="passport-number"
                    type="text"
                    autoComplete="off"
                    placeholder="B11223344"
                    value={passportNumber}
                    onChange={(e) => setPassportNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm uppercase bg-white"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="emergency-contact" className="block text-xs font-semibold text-slate-700 mb-1">Emergency contact number <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                id="emergency-contact"
                type="tel"
                autoComplete="tel"
                placeholder="A family member or trusted contact"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
              />
            </div>

            {/* Explicit Revocable Location Consent Choice */}
            <div className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGranted}
                  onChange={(e) => {
                    const granted = e.target.checked;
                    setConsentGranted(granted);
                    if (!granted) {
                      setCoords(null);
                      setGpsStatus('idle');
                    }
                  }}
                  className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs text-slate-700 leading-relaxed">
                  <strong>I consent to share my live GPS location</strong> with my tour group and organizers. I can pause or resume sharing at any time.
                </span>
              </label>
              <p className="pl-6 text-[10px] leading-relaxed text-slate-500">You can join with sharing turned off. Your location will not appear on the group map unless you opt in and your device provides a location.</p>

              <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Navigation className="w-3.5 h-3.5 text-brand-600" />
                  {gpsStatus === 'granted'
                    ? 'Your location is ready to share'
                    : gpsStatus === 'denied'
                      ? 'Location unavailable — you can still join'
                      : consentGranted
                        ? 'Allow device location access'
                        : 'Location sharing is off until you opt in'}
                </span>
                <button
                  type="button"
                  onClick={requestLocationAccess}
                  disabled={!consentGranted || gpsStatus === 'requesting'}
                  className="text-xs font-bold px-3 py-1 rounded-xl bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  {gpsStatus === 'granted' ? '✓ Location ready' : gpsStatus === 'requesting' ? 'Checking…' : 'Enable location'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-navy-900 to-brand-700 hover:from-navy-800 hover:to-brand-600 text-white font-extrabold py-3.5 rounded-2xl text-sm shadow-xl flex items-center justify-center gap-2 transition"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Opening Live Satellite Map...
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  Join Trip &amp; Open Live Map
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
