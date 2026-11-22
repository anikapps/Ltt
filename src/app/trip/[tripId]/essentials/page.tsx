'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Building2,
  Plane,
  Phone,
  Navigation,
  ShieldAlert,
  Calendar,
  MessageSquare,
  MapPin,
  ShieldCheck,
  Clock3,
  ArrowUpRight
} from 'lucide-react';
import RealQrCode from '@/components/RealQrCode';
import MinimalNav from '@/components/MinimalNav';
import { SafeTouristPeer, ItineraryItem, TripEssentialHub } from '@/types/lttbd';
import { buildGoogleMapsDirectionsUrl } from '@/lib/geo';

interface EssentialsResponse {
  trip: {
    id: string;
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    organizer_contact?: string;
    itinerary?: ItineraryItem[];
    essentials?: TripEssentialHub;
  };
  me: SafeTouristPeer | null;
}

function phoneHref(value?: string | null): string | null {
  const cleaned = (value || '').trim();
  if (!cleaned || /[^\d+\s().-]/.test(cleaned)) return null;
  const dialable = cleaned.replace(/[^\d+]/g, '');
  return dialable.replace(/\D/g, '').length >= 5 ? `tel:${dialable}` : null;
}

function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    (lat !== 0 || lng !== 0);
}

export default function TouristEssentialsPage() {
  const params = useParams<{ tripId: string }>();
  const router = useRouter();
  const tripId = params.tripId;
  const [state, setState] = useState<EssentialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/tourist/trip/${tripId}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push('/');
          return null;
        }
        if (!res.ok) throw new Error('Trip information could not be loaded.');
        return res.json();
      })
      .then((data) => {
        if (active && data) setState(data as EssentialsResponse);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load trip details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [tripId, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
        Loading your trip essentials…
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 h-9 w-9 text-rose-500" />
          <h1 className="text-lg font-bold text-slate-900">Trip details unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError || 'Please sign in to your trip again.'}</p>
          <Link href="/" className="mt-5 inline-flex rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Return to home</Link>
        </div>
      </div>
    );
  }

  const { trip, me } = state;
  const essentials: TripEssentialHub = trip.essentials || {
    hotel_name: '', hotel_address: '', hotel_phone: '', hotel_lat: 0, hotel_lng: 0,
    airport_name: '', airport_terminal: '', airport_lat: 0, airport_lng: 0,
    organizer_name: 'Tour Leader & Operations', organizer_phone: trip.organizer_contact || '',
    local_emergency_police: '', local_emergency_medical: '',
    embassy_name: '', embassy_phone: ''
  };

  const organizerPhone = essentials.organizer_phone || trip.organizer_contact || '';
  const organizerHref = phoneHref(organizerPhone);
  const policeHref = phoneHref(essentials.local_emergency_police);
  const medicalHref = phoneHref(essentials.local_emergency_medical);
  const embassyHref = phoneHref(essentials.embassy_phone);
  const hotelHref = phoneHref(essentials.hotel_phone);
  const hotelReady = Boolean(essentials.hotel_name.trim()) && validCoordinates(essentials.hotel_lat, essentials.hotel_lng);
  const airportReady = Boolean(essentials.airport_name.trim()) && validCoordinates(essentials.airport_lat, essentials.airport_lng);

  const hotelDirectionsUrl = hotelReady ? buildGoogleMapsDirectionsUrl({
    originLat: me?.latitude,
    originLng: me?.longitude,
    destLat: essentials.hotel_lat,
    destLng: essentials.hotel_lng,
    travelMode: 'driving'
  }) : null;
  const airportDirectionsUrl = airportReady ? buildGoogleMapsDirectionsUrl({
    originLat: me?.latitude,
    originLng: me?.longitude,
    destLat: essentials.airport_lat,
    destLng: essentials.airport_lng,
    travelMode: 'driving'
  }) : null;

  const qrIdentityPayload = typeof window !== 'undefined'
    ? `${window.location.origin}/trip/${trip.id}?tourist=${encodeURIComponent(me?.tourist_code || '')}`
    : `LTTBD:${trip.id}:${me?.tourist_code || ''}`;

  const contactCardClass = 'flex min-h-36 flex-col justify-between gap-3 rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur transition hover:bg-white/[0.12]';

  return (
    <div className="ltt-essentials-page flex min-h-screen flex-col bg-slate-50">
      <MinimalNav
        tripId={tripId}
        tripName={trip.name}
        touristLabel={`${trip.destination} • Trip essentials`}
      />

      <main className="mx-auto w-full max-w-6xl space-y-7 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-800">
              <ShieldCheck className="h-3.5 w-3.5" /> Your travel information
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Trip essentials</h1>
            <p className="mt-1 text-sm text-slate-600">Important contacts, accommodation, airport details and your digital trip ID.</p>
          </div>
          <Link href={`/trip/${tripId}/chat`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-800">
            <MessageSquare className="h-4 w-4" /> Contact the tour team
          </Link>
        </header>

        <section className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 p-5 text-white shadow-xl sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert className="h-5 w-5 text-amber-300" /> Support & emergency contacts
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-blue-100">Destination-specific information</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className={contactCardClass}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Tour leader & operations</p>
                <p className="mt-2 text-base font-bold">{essentials.organizer_name || 'Tour support team'}</p>
                <p className="mt-1 text-xs text-blue-100/80">Your primary point of contact during the trip.</p>
              </div>
              {organizerHref ? <a href={organizerHref} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-white"><Phone className="h-4 w-4" /> {organizerPhone} <ArrowUpRight className="h-3.5 w-3.5" /></a> : <span className="text-xs text-blue-100/70">Number not added — use the trip chat.</span>}
            </div>

            <div className={contactCardClass}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Local emergency services</p>
                <p className="mt-2 text-base font-bold">Police & medical assistance</p>
                <p className="mt-1 text-xs text-blue-100/80">Use the verified local numbers for this destination.</p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold text-cyan-200">
                {policeHref && <a href={policeHref} className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Police: {essentials.local_emergency_police}</a>}
                {medicalHref && <a href={medicalHref} className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Medical: {essentials.local_emergency_medical}</a>}
                {!policeHref && !medicalHref && <span className="text-xs font-normal text-blue-100/70">Local emergency numbers have not been added. Contact local authorities and your tour leader.</span>}
              </div>
            </div>

            <div className={contactCardClass}>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200">Consular assistance</p>
                <p className="mt-2 text-base font-bold">{essentials.embassy_name || 'Your country’s embassy or consulate'}</p>
                <p className="mt-1 text-xs text-blue-100/80">For passport and consular support while abroad.</p>
              </div>
              {embassyHref ? <a href={embassyHref} className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-cyan-200 hover:text-white"><Phone className="h-4 w-4" /> {essentials.embassy_phone} <ArrowUpRight className="h-3.5 w-3.5" /></a> : <span className="text-xs text-blue-100/70">Contact details have not been added.</span>}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800"><Building2 className="h-3.5 w-3.5" /> Group accommodation</span>
              {hotelReady && <span className="font-mono text-[10px] text-slate-400">{essentials.hotel_lat.toFixed(4)}, {essentials.hotel_lng.toFixed(4)}</span>}
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-950">{essentials.hotel_name || 'Hotel details not added yet'}</h2>
            <p className="mt-1 min-h-10 text-sm leading-relaxed text-slate-600">{essentials.hotel_address || 'Your tour organizer will add the confirmed hotel name and address here.'}</p>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {hotelDirectionsUrl ? <a href={hotelDirectionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-blue-800"><Navigation className="h-4 w-4" /> Directions</a> : <span className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-center text-xs text-slate-500">Map location pending</span>}
              {hotelHref ? <a href={hotelHref} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"><Phone className="h-4 w-4" /> Call hotel</a> : <span className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-400">No hotel phone</span>}
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-800"><Plane className="h-3.5 w-3.5" /> Airport information</span>
              {airportReady && <span className="font-mono text-[10px] text-slate-400">{essentials.airport_lat.toFixed(4)}, {essentials.airport_lng.toFixed(4)}</span>}
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-950">{essentials.airport_name || 'Airport details not added yet'}</h2>
            <p className="mt-1 min-h-10 text-sm leading-relaxed text-slate-600">{essentials.airport_terminal || 'Terminal, meeting location and departure instructions will appear here once confirmed.'}</p>
            <div className="mt-5 border-t border-slate-100 pt-4">
              {airportDirectionsUrl ? <a href={airportDirectionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-800"><Navigation className="h-4 w-4" /> Navigate to airport <ArrowUpRight className="h-3.5 w-3.5" /></a> : <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-center text-xs text-slate-500">Airport location pending confirmation by your organizer.</div>}
            </div>
          </article>
        </section>

        <section className="grid items-start gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.8fr)]">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 text-center shadow-sm sm:p-6">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><ShieldCheck className="h-5 w-5" /></div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Digital trip ID</p>
            <h2 className="mt-1 text-base font-bold text-slate-950">Your group pass</h2>
            <p className="mb-4 mt-1 text-xs text-slate-500">Show this QR code to your tour coordinator when requested.</p>
            <div className="inline-flex rounded-2xl border border-slate-100 bg-white p-2">
              <RealQrCode value={qrIdentityPayload} size={176} label={me?.display_name || 'Tourist'} sublabel={`ID: ${me?.tourist_code || 'Pending'} • ${me?.subgroup_name || 'Main Group'}`} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-700">{me?.display_name || 'Tour participant'}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{me?.tourist_code || 'Tourist ID pending'}</p>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-700" />
              <div>
                <h2 className="text-base font-bold text-slate-950">Your tour itinerary</h2>
                <p className="text-xs text-slate-500">The latest schedule shared by your organizer.</p>
              </div>
            </div>
            {trip.itinerary?.length ? (
              <div className="space-y-3">
                {trip.itinerary.map((item) => (
                  <div key={item.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><Clock3 className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{item.day_label} · {item.time_label}</p>
                      <h3 className="mt-1 text-sm font-bold text-slate-900">{item.title}</h3>
                      {item.location_name && <p className="mt-1 flex items-center gap-1 text-xs text-slate-600"><MapPin className="h-3.5 w-3.5 shrink-0" /> {item.location_name}</p>}
                      {item.instructions && <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.instructions}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                <Calendar className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-sm font-semibold text-slate-700">Itinerary not published yet</p>
                <p className="mt-1 text-xs text-slate-500">Your organizer will share the schedule here when it is ready.</p>
              </div>
            )}
          </article>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-slate-500">Trip details are maintained by your organizer. Check the group chat for urgent updates.</p>
          <Link href={`/trip/${tripId}/chat`} className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-blue-800 hover:text-blue-950"><MessageSquare className="h-4 w-4" /> Open trip chat</Link>
        </footer>
      </main>
    </div>
  );
}
