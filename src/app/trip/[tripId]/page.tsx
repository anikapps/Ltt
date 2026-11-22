'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  MapPin,
  AlertTriangle,
  Radio,
  WifiOff,
  Navigation,
  ExternalLink,
  Flag,
  Building2,
  MessageSquare,
  ClipboardCheck,
  ShieldAlert
} from 'lucide-react';
import GroupMap, { MapMarkerPerson } from '@/components/GroupMap';
import MinimalNav from '@/components/MinimalNav';
import {
  SafeTouristPeer,
  EmergencyAlert,
  MeetingPoint,
  HeadcountSession,
  AssistanceCategory,
  TripEssentialHub,
  GroupChatMessage
} from '@/types/lttbd';
import {
  getDistanceMeters,
  formatDistance,
  buildGoogleMapsDirectionsUrl
} from '@/lib/geo';

interface TouristMapStateResponse {
  trip: {
    id: string;
    name: string;
    destination: string;
    start_date: string;
    end_date: string;
    organizer_contact?: string;
    update_interval_seconds?: number;
    essentials?: TripEssentialHub;
    status: string;
  };
  me: SafeTouristPeer | null;
  peers: SafeTouristPeer[];
  meetingPoints: MeetingPoint[];
  headcounts: HeadcountSession[];
  groupMessages?: GroupChatMessage[];
  myAlerts: EmergencyAlert[];
}

const SOS_CATEGORIES: AssistanceCategory[] = [
  'Lost / separated from group',
  'Medical assistance',
  'Accident / injury',
  'Transport assistance',
  'Safety / security concern',
  'Cannot find meeting point',
  'Other'
];

export default function TouristHomeMapPage() {
  const params = useParams<{ tripId: string }>();
  const router = useRouter();
  const tripId = params.tripId;

  const [state, setState] = useState<TouristMapStateResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [lastCoords, setLastCoords] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);

  // Navigation Confirmation Modal State
  const [navTargetMember, setNavTargetMember] = useState<MapMarkerPerson | null>(null);
  const [navTargetMp, setNavTargetMp] = useState<MeetingPoint | null>(null);

  // SOS Modal
  const [confirmSosModal, setConfirmSosModal] = useState(false);
  const [sosCategory, setSosCategory] = useState<AssistanceCategory>('Lost / separated from group');
  const [sosDescription, setSosDescription] = useState('');
  const [sendingHelp, setSendingHelp] = useState(false);

  const sharingRef = useRef(sharingEnabled);
  sharingRef.current = sharingEnabled;

  const fetchGroupState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tourist/trip/${tripId}`);
      if (res.status === 401) {
        router.push('/');
        return;
      }
      if (res.status === 410) {
        setState(null);
        setLoading(false);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as TouristMapStateResponse;
      setState(data);
      if (data.me) {
        setSharingEnabled(data.me.sharing_enabled);
      }
    } catch {
      // Smoothly keep state
    } finally {
      setLoading(false);
    }
  }, [tripId, router]);

  const transmitLocationUpdate = useCallback(
    async (
      enabled: boolean,
      coords?: { lat: number; lng: number; acc: number } | null,
      statusOverride?: 'sharing' | 'disabled' | 'unavailable'
    ) => {
      try {
        await fetch(`/api/tourist/trip/${tripId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'location_update',
            sharingEnabled: enabled,
            latitude: coords ? coords.lat : undefined,
            longitude: coords ? coords.lng : undefined,
            accuracy: coords ? coords.acc : undefined,
            statusOverride
          })
        });
        await fetchGroupState();
      } catch {
        // Silent retry
      }
    },
    [tripId, fetchGroupState]
  );

  const captureAndSendGps = useCallback(() => {
    if (!sharingRef.current) return;
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      transmitLocationUpdate(true, null, 'unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy
        };
        setLastCoords(coords);
        transmitLocationUpdate(true, coords, 'sharing');
      },
      () => {
        // A denied or unavailable GPS fix is a real unavailable state, not a fabricated pin.
        setLastCoords(null);
        transmitLocationUpdate(true, null, 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
  }, [transmitLocationUpdate]);

  useEffect(() => {
    fetchGroupState();
  }, [fetchGroupState]);

  const gpsIntervalSec = state?.trip.update_interval_seconds || 20;

  useEffect(() => {
    if (!state) return;
    if (sharingEnabled) {
      captureAndSendGps();
    }
    const gpsTimer = setInterval(() => {
      if (sharingRef.current) {
        captureAndSendGps();
      }
    }, gpsIntervalSec * 1000);

    const pollTimer = setInterval(fetchGroupState, 8000);

    return () => {
      clearInterval(gpsTimer);
      clearInterval(pollTimer);
    };
  }, [state?.trip.id, sharingEnabled, gpsIntervalSec, captureAndSendGps, fetchGroupState]);

  const handleToggleSharing = async () => {
    const nextState = !sharingEnabled;
    setSharingEnabled(nextState);
    if (!nextState) {
      await transmitLocationUpdate(false, null, 'disabled');
    } else {
      captureAndSendGps();
    }
  };

  const handleHeadcountCheckIn = async (sessionId: string) => {
    await fetch(`/api/tourist/trip/${tripId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'headcount_checkin',
        sessionId,
        status: 'present'
      })
    });
    await fetchGroupState();
  };

  // When SOS is sent, immediately record it and redirect to the dedicated Operations Chat page!
  const handleSubmitSos = async () => {
    setSendingHelp(true);
    try {
      const res = await fetch(`/api/tourist/trip/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'emergency_help',
          category: sosCategory,
          note: sosDescription || sosCategory,
          latitude: lastCoords?.lat ?? state?.me?.latitude ?? null,
          longitude: lastCoords?.lng ?? state?.me?.longitude ?? null,
          accuracy: lastCoords?.acc ?? state?.me?.accuracy ?? null
        })
      });
      if (res.ok) {
        setConfirmSosModal(false);
        router.push(`/trip/${tripId}/chat?sos=1`);
      }
    } finally {
      setSendingHelp(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-slate-500">
        Opening LTT BD Satellite Map...
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center">
        <div className="bg-white max-w-md w-full p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <h1 className="text-base font-bold text-slate-900">Trip Completed</h1>
          <p className="text-xs text-slate-600">
            This tour has ended and all trip-associated personal data and location records have been removed.
          </p>
        </div>
      </div>
    );
  }

  const { trip, me, peers, meetingPoints, headcounts, groupMessages = [], myAlerts } = state;
  const activeAlert = myAlerts.find(
    (a) => a.status !== 'resolved' && a.status !== 'Resolved' && a.status !== 'Closed' && a.status !== 'Cancelled'
  );
  const nextMeetingPoint = meetingPoints[0] || null;

  const myLat = lastCoords?.lat ?? me?.latitude ?? null;
  const myLng = lastCoords?.lng ?? me?.longitude ?? null;

  const activeNavLat = navTargetMember?.latitude ?? navTargetMp?.latitude ?? null;
  const activeNavLng = navTargetMember?.longitude ?? navTargetMp?.longitude ?? null;
  const activeNavTitle = navTargetMember?.display_name ?? navTargetMp?.title ?? '';

  const navDistance =
    activeNavLat !== null && activeNavLng !== null && myLat !== null && myLng !== null
      ? getDistanceMeters(myLat, myLng, activeNavLat, activeNavLng)
      : null;

  const googleMapsUrl =
    activeNavLat !== null && activeNavLng !== null
      ? buildGoogleMapsDirectionsUrl({
          originLat: myLat,
          originLng: myLng,
          destLat: activeNavLat,
          destLng: activeNavLng,
          travelMode: 'walking'
        })
      : '#';

  return (
    <div className="ltt-tourist-map-page flex-1 flex flex-col bg-slate-100 min-h-screen">
      <MinimalNav
        tripId={tripId}
        tripName={trip.name}
        touristLabel={me ? `${me.display_name} (${me.tourist_code}) • ${me.subgroup_name}` : trip.destination}
        chatCount={groupMessages.length}
        hasActiveSos={Boolean(activeAlert)}
        sharingEnabled={sharingEnabled}
        sharingStatus={me?.effective_status}
        onToggleSharing={handleToggleSharing}
      />

      <div className="max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4 flex-1 flex flex-col">
        {/* Top Action Bar: Next Meeting Point + Prominent Pulsing Red "I NEED HELP" Button */}
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
          {nextMeetingPoint ? (
            <button
              type="button"
              onClick={() => {
                setNavTargetMember(null);
                setNavTargetMp(nextMeetingPoint);
              }}
              className="text-left min-w-0 flex-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3.5 py-2 rounded-xl transition"
            >
              <div className="text-[10px] font-extrabold uppercase text-amber-800 flex items-center gap-1">
                <Flag className="w-3 h-3" /> Next Meeting Point (Tap for Google Maps Directions)
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                {nextMeetingPoint.title} — {nextMeetingPoint.notes}
              </div>
            </button>
          ) : (
            <div className="text-xs text-slate-600 font-medium px-2">
              Click any tourist in the list beside the map to inspect their live location and get directions.
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/trip/${tripId}/essentials`}
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5"
            >
              <Building2 className="w-4 h-4 text-brand-600" />
              Hotel &amp; Airport
            </Link>
            <button
              type="button"
              onClick={() => setConfirmSosModal(true)}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 active:scale-95 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 transition ring-2 ring-red-400/50"
            >
              <AlertTriangle className="w-4 h-4 animate-bounce" />
              I NEED HELP (SOS)
            </button>
          </div>
        </div>

        {/* Active SOS Banner if tourist has an open emergency */}
        {activeAlert && (
          <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-3 border-2 border-amber-400">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-amber-300 animate-bounce shrink-0" />
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider">
                  SOS Alert Active — Status: {activeAlert.status}
                </div>
                <p className="text-xs text-red-100">
                  {activeAlert.category} • Operations has received your live GPS location.
                </p>
              </div>
            </div>
            <Link
              href={`/trip/${tripId}/chat?sos=1`}
              className="bg-gold-400 hover:bg-gold-500 text-navy-950 font-extrabold text-xs px-4 py-2 rounded-xl shadow"
            >
              Open Live Chat with Operations &rarr;
            </Link>
          </div>
        )}

        {/* Active Digital Headcount Roll Call */}
        {headcounts.map((hc) => {
          const myResp = hc.responses.find((r) => r.member_id === me?.member_id);
          if (myResp) return null;
          return (
            <div
              key={hc.id}
              className="bg-brand-600 text-white rounded-2xl px-4 py-3 flex items-center justify-between gap-2 shadow"
            >
              <div className="text-xs font-bold flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 text-gold-400 shrink-0" />
                <span>Roll Call Active: {hc.title}</span>
              </div>
              <button
                type="button"
                onClick={() => handleHeadcountCheckIn(hc.id)}
                className="bg-gold-400 hover:bg-gold-500 text-navy-950 font-extrabold text-xs px-3.5 py-1.5 rounded-xl shrink-0 shadow"
              >
                ✓ Confirm I Am Present
              </button>
            </div>
          );
        })}

        {/* Main Satellite Group Map with Built-In Side-by-Side Tourist List & Inspector */}
        <div className="bg-white p-3 rounded-3xl border border-slate-200 shadow-sm flex-1">
          <GroupMap
            members={peers}
            meetingPoints={meetingPoints}
            essentials={trip.essentials}
            currentMemberId={me?.member_id}
            focusedMemberId={focusedMemberId}
            routeTargetMember={navTargetMember}
            routeTargetMeetingPoint={navTargetMp}
            isAdminView={false}
            showSideList={true}
            heightClass="h-[460px] sm:h-[520px]"
            onRequestDirections={(m) => {
              setNavTargetMp(null);
              setNavTargetMember(m);
            }}
            onRequestMeetingPointDirections={(mp) => {
              setNavTargetMember(null);
              setNavTargetMp(mp);
            }}
          />
        </div>
      </div>

      {/* Google Maps Navigation Confirmation Modal */}
      {(navTargetMember || navTargetMp) && activeNavLat !== null && activeNavLng !== null && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Directions to {activeNavTitle}
                </h3>
                <p className="text-xs text-slate-500">
                  {navDistance !== null
                    ? `${formatDistance(navDistance)} from your location`
                    : 'Route previewed on map'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 border border-slate-200 leading-relaxed">
              Confirm below to open turn-by-turn directions to <strong>{activeNavTitle}</strong> in <strong>Google Maps</strong>.
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setNavTargetMember(null);
                  setNavTargetMp(null);
                }}
                className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setNavTargetMember(null);
                  setNavTargetMp(null);
                }}
                className="py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-extrabold shadow-md flex items-center justify-center gap-1.5"
              >
                Open Google Maps
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* SOS Help Request Modal (Redirects immediately to Operations Live Chat!) */}
      {confirmSosModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border-2 border-red-600 space-y-4">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h3 className="text-base font-extrabold text-slate-900">Request Immediate Help (SOS)</h3>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                This sends your name, contact details, and live GPS coordinates to Operations and opens a live emergency chat with your Tour Leader.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
              <select
                value={sosCategory}
                onChange={(e) => setSosCategory(e.target.value as AssistanceCategory)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                {SOS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Note / Landmark</label>
              <input
                type="text"
                placeholder="Describe where you are or what you need..."
                value={sosDescription}
                onChange={(e) => setSosDescription(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setConfirmSosModal(false)}
                className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendingHelp}
                onClick={handleSubmitSos}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold shadow-md"
              >
                {sendingHelp ? 'Opening SOS Chat...' : 'SEND SOS & CHAT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
