'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  LogOut,
  MapPin,
  Navigation,
  Phone,
  Plane,
  ShieldAlert
} from 'lucide-react';
import { MinimalNav } from '@/components/MinimalNav';
import type { AnnouncementItem, TripEssentialHub } from '@/types/lttbd';

interface EssentialsState {
  trip: {
    id: string;
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    organizer_contact: string;
    essentials?: TripEssentialHub;
  };
  me: {
    id: string;
    tourist_code: string;
    display_name: string;
    subgroup_name: string;
  };
  announcements: AnnouncementItem[];
}

export default function TripEssentialsPage() {
  const params = useParams<{ tripId: string }>();
  const router = useRouter();
  const tripId = params.tripId;

  const [data, setData] = useState<EssentialsState | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`lttbd_checklist_${tripId}`);
    if (saved) {
      try {
        setCheckedIds(JSON.parse(saved));
      } catch {}
    }

    fetch(`/api/tourist/trip/${tripId}`)
      .then(async (r) => {
        if (r.status === 401) {
          router.push('/join');
          return;
        }
        if (r.ok) {
          const json = await r.json();
          setData(json);
          localStorage.setItem(`lttbd_essentials_cache_${tripId}`, JSON.stringify(json));
        }
      })
      .catch(() => {
        const cached = localStorage.getItem(`lttbd_essentials_cache_${tripId}`);
        if (cached) {
          try {
            setData(JSON.parse(cached));
          } catch {}
        }
      });
  }, [tripId, router]);

  function toggleChecklist(id: string) {
    setCheckedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(`lttbd_checklist_${tripId}`, JSON.stringify(next));
      return next;
    });
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch(`/api/tourist/trip/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout_tourist' })
      });
      localStorage.setItem('lttbd_loc_pref', 'disabled');
      router.push('/join');
    } finally {
      setLoggingOut(false);
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Loading Trip Essentials...
      </div>
    );
  }

  const firstName = data.me.display_name.split(' ')[0] || 'Traveller';
  const ess = data.trip.essentials;
  const latestAnn = data.announcements[0];
  const flights = ess?.flights || [];
  const checklist = ess?.checklist || [
    { id: 'c1', label: 'Passport & visa copy', category: 'Documents' as const, required: true },
    { id: 'c2', label: 'Hotel voucher & flight ticket', category: 'Documents' as const, required: true },
    { id: 'c3', label: 'Power bank & adapter', category: 'Packing' as const, required: false }
  ];

  const hotelDirections =
    typeof ess?.hotel_lat === 'number' && typeof ess?.hotel_lng === 'number'
      ? `https://www.google.com/maps/dir/?api=1&destination=${ess.hotel_lat},${ess.hotel_lng}&travelmode=driving`
      : ess?.hotel_name
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ess.hotel_name} ${ess.hotel_address || data.trip.destination}`)}`
      : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <MinimalNav
        role="tourist"
        tripId={tripId}
        tripName={data.trip.name}
        userName={`${data.me.display_name} (${data.me.tourist_code})`}
      />

      <main className="max-w-4xl w-full mx-auto px-4 py-6 space-y-5 flex-1">
        {/* Greeting Header */}
        <section className="rounded-3xl bg-gradient-to-br from-slate-900 to-blue-950 text-white p-6 shadow-lg">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-300">{data.trip.name}</div>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">Good day, {firstName}!</h1>
          <p className="text-sm text-blue-100 mt-1">
            Your Trip Essentials — everything you need for {data.trip.destination} in one place (cached offline).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/trip/${tripId}`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white text-slate-900 px-3.5 py-2 text-xs font-bold"
            >
              <MapPin className="w-3.5 h-3.5 text-blue-700" /> Back to Live Map
            </Link>
          </div>
        </section>

        {/* Latest Announcement */}
        {latestAnn && (
          <section className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-800">
              <Bell className="w-4 h-4" /> Latest announcement · {latestAnn.priority}
            </div>
            <div className="text-base font-bold text-slate-900 mt-1">{latestAnn.title}</div>
            <p className="text-sm text-slate-700 mt-0.5">{latestAnn.body}</p>
            <div className="text-[11px] text-slate-500 mt-2">
              From {latestAnn.created_by} · {new Date(latestAnn.created_at).toLocaleString()}
            </div>
          </section>
        )}

        {/* 4 Essential Cards: Hotels, Flights, Contacts, Checklist */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Hotels */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-700" /> Hotels &amp; Accommodation
            </h2>
            <div className="mt-3 text-sm font-bold text-slate-900">{ess?.hotel_name || 'Hotel details pending'}</div>
            <div className="text-xs text-slate-600 mt-0.5">{ess?.hotel_address || 'Address will appear once confirmed.'}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              {hotelDirections && (
                <a
                  href={hotelDirections}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 text-white px-3.5 py-2 text-xs font-bold"
                >
                  <Navigation className="w-3.5 h-3.5" /> Directions
                </a>
              )}
              {ess?.hotel_phone && (
                <a
                  href={`tel:${ess.hotel_phone}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 text-slate-800 px-3.5 py-2 text-xs font-semibold"
                >
                  <Phone className="w-3.5 h-3.5" /> {ess.hotel_phone}
                </a>
              )}
            </div>
          </section>

          {/* Flight Details */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Plane className="w-4 h-4 text-indigo-700" /> Flight &amp; Airport Details
            </h2>
            <div className="mt-3 text-sm font-bold text-slate-900">{ess?.airport_name || 'Airport details pending'}</div>
            <div className="text-xs text-slate-600 mt-0.5">{ess?.airport_terminal || ''}</div>
            {flights.length > 0 ? (
              <div className="mt-3 space-y-2">
                {flights.map((f) => (
                  <div key={f.id} className="rounded-xl bg-slate-50 p-2.5 text-xs">
                    <div className="font-bold text-slate-900">{f.airline} {f.flight_number} · {f.route}</div>
                    <div className="text-slate-600">{f.departure_time} → {f.arrival_time} · Baggage: {f.baggage_allowance}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-500">Flight schedule &amp; baggage info will appear here.</div>
            )}
          </section>
        </div>

        {/* Daily Itinerary */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-emerald-700" /> Daily Travel Itinerary
          </h2>
          {ess?.itinerary && ess.itinerary.length > 0 ? (
            <div className="space-y-2.5">
              {ess.itinerary.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-blue-700">{item.day_label} · {item.time_label}</div>
                    <div className="text-sm font-bold text-slate-900">{item.title}</div>
                    {item.notes && <div className="text-xs text-slate-600 mt-0.5">{item.notes}</div>}
                    {!item.notes && item.instructions && <div className="text-xs text-slate-600 mt-0.5">{item.instructions}</div>}
                  </div>
                  <div className="text-xs font-semibold text-slate-500">{item.location_name}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No itinerary stops added yet.</p>
          )}
        </section>

        {/* Travel Checklist */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
            <CheckSquare className="w-4 h-4 text-blue-700" /> Travel Checklist
          </h2>
          <div className="space-y-2">
            {checklist.map((c) => {
              const done = checkedIds.includes(c.id);
              return (
                <label key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => toggleChecklist(c.id)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span className={`text-sm ${done ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                    {c.label}
                  </span>
                  <span className="ml-auto text-[11px] font-semibold text-slate-400">{c.category}</span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Emergency & Organizer Contacts */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-rose-600" /> Emergency &amp; Organizer Contacts
          </h2>
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-bold text-slate-500 uppercase">Tour Organizer</div>
              <div className="font-bold text-slate-900 mt-1">{ess?.organizer_hotline || data.trip.organizer_contact || 'Not set'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-bold text-slate-500 uppercase">Local Police / Medical</div>
              <div className="font-bold text-slate-900 mt-1">
                {ess?.local_emergency_police || 'N/A'} / {ess?.local_emergency_medical || 'N/A'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="font-bold text-slate-500 uppercase">{ess?.embassy_name || 'Embassy'}</div>
              <div className="font-bold text-slate-900 mt-1">{ess?.embassy_phone || 'Not set'}</div>
            </div>
          </div>
        </section>

        {/* Log Out at the Bottom (per spec: revokes session, stops location sharing, preserves remembered login) */}
        <section className="pt-4 pb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-slate-900">Log out</div>
              <div className="text-xs text-slate-500">
                Securely leave your trip session and stop location sharing. Your remembered name stays saved if enabled.
              </div>
            </div>
            <button
              type="button"
              disabled={loggingOut}
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-4 py-2.5 text-xs transition"
            >
              <LogOut className="w-4 h-4" /> {loggingOut ? 'Logging out...' : 'Log out'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
