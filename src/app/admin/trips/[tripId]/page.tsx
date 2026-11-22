'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Upload,
  Copy,
  Share2,
  Phone,
  MapPin,
  UserMinus,
  ShieldAlert,
  Users,
  CheckCircle,
  Trash2,
  UserPlus,
  RefreshCw,
  FileSpreadsheet,
  FlaskConical,
  Flag,
  ClipboardCheck,
  Bell,
  Download,
  Settings,
  Send,
  ExternalLink,
  Navigation,
  QrCode,
  Calendar,
  MessageCircle,
  BarChart3
} from 'lucide-react';
import GroupMap, { MapMarkerPerson } from '@/components/GroupMap';
import RealQrCode from '@/components/RealQrCode';
import BrandIdentity from '@/components/BrandIdentity';
import {
  Trip,
  TripAdmin,
  TripInvite,
  AdminPassengerView,
  EmergencyAlert,
  AuditLog,
  AdminRole,
  MeetingPoint,
  HeadcountSession,
  AnnouncementItem,
  GroupChatMessage,
  TripEssentialHub
} from '@/types/lttbd';
import {
  buildGoogleMapsDirectionsUrl,
  getDistanceMeters,
  formatDistance
} from '@/lib/geo';

interface TripDetailResponse {
  trip: Trip;
  admins: TripAdmin[];
  invites: TripInvite[];
  passengers: AdminPassengerView[];
  meetingPoints: MeetingPoint[];
  headcounts: HeadcountSession[];
  announcements: AnnouncementItem[];
  groupMessages?: GroupChatMessage[];
  alerts: EmergencyAlert[];
  logs: AuditLog[];
  stats: {
    rosterTotal: number;
    registeredCount: number;
    sharingCount: number;
    disabledCount: number;
    offlineCount: number;
    separatedCount?: number;
    activeAlertsCount: number;
  };
}

export default function AdminTripConsolePage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params.tripId;

  const [activeSection, setActiveSection] = useState<
    | 'command_map'
    | 'directory'
    | 'incidents'
    | 'group_chat'
    | 'coordination'
    | 'itinerary'
    | 'roster_invites'
    | 'settings_audit'
  >('command_map');

  const [detail, setDetail] = useState<TripDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusedMemberId, setFocusedMemberId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Admin GPS Origin & Google Maps Navigation Target State
  const [adminCoords, setAdminCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [adminNavTarget, setAdminNavTarget] = useState<MapMarkerPerson | null>(null);
  const [adminNavMp, setAdminNavMp] = useState<MeetingPoint | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  // Filters
  const [passengerSearch, setPassengerSearch] = useState('');
  const [subgroupFilter, setSubgroupFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [adminChatText, setAdminChatText] = useState('');
  const [adminChatChannel, setAdminChatChannel] = useState<'sos' | 'group'>('sos');
  const [selectedSosId, setSelectedSosId] = useState<string>('');
  const [adminSosReplyText, setAdminSosReplyText] = useState('');

  // Roster Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);

  // Meeting Point creation state
  const [mpTitle, setMpTitle] = useState('');
  const [mpLat, setMpLat] = useState('');
  const [mpLng, setMpLng] = useState('');
  const [mpRadius, setMpRadius] = useState('300');
  const [mpNotes, setMpNotes] = useState('');

  // Headcount creation state
  const [hcTitle, setHcTitle] = useState('');
  const [hcSubgroup, setHcSubgroup] = useState('All');

  // Announcement creation state
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSubgroup, setAnnSubgroup] = useState('All');
  const [annPriority, setAnnPriority] = useState<'normal' | 'important' | 'urgent'>('normal');

  // Itinerary Builder state
  const [itDay, setItDay] = useState('Day 2 • 15 Nov 2026');
  const [itTime, setItTime] = useState('10:00 AM');
  const [itTitle, setItTitle] = useState('');
  const [itLocation, setItLocation] = useState('');
  const [itInstructions, setItInstructions] = useState('');

  // Incident management state
  const [responderInput, setResponderInput] = useState<Record<string, string>>({});
  const [internalNoteInput, setInternalNoteInput] = useState<Record<string, string>>({});
  const [resolutionInput, setResolutionInput] = useState<Record<string, string>>({});
  const [replyInput, setReplyInput] = useState<Record<string, string>>({});

  // Multi-admin form state
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>('tour_manager');

  // Trip Settings form state
  const [staleSec, setStaleSec] = useState(180);
  const [intervalSec, setIntervalSec] = useState(20);
  const [retentionDays, setRetentionDays] = useState(7);
  const [sepMeters, setSepMeters] = useState(500);
  const [orgContact, setOrgContact] = useState('');

  const [confirmEndTrip, setConfirmEndTrip] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/trips/${tripId}`);
      if (!res.ok) return;
      const data = (await res.json()) as TripDetailResponse;
      setDetail(data);
      setStaleSec(data.trip.stale_threshold_seconds || 180);
      setIntervalSec(data.trip.update_interval_seconds || 20);
      setRetentionDays(data.trip.retention_days || 7);
      setSepMeters(data.trip.separation_threshold_meters || 500);
      setOrgContact(data.trip.organizer_contact || '');
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadDetail();
    const timer = setInterval(loadDetail, 10000);
    return () => clearInterval(timer);
  }, [loadDetail]);

  // Capture Organizer / Admin Browser GPS if available for Directions Origin
  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setAdminCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          // Keep the origin unknown when browser GPS is unavailable; never invent one.
          setAdminCoords(null);
        }
      );
    }
  }, []);

  const handleRosterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadErrors([]);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/admin/trips/${tripId}/roster`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          setUploadErrors(data.errors);
        } else {
          setFeedback({ type: 'error', text: data.error || 'Roster import failed.' });
        }
        return;
      }
      setFeedback({
        type: 'success',
        text: `Imported and verified ${data.importedCount} passengers into the trip roster.`
      });
      await loadDetail();
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePostAction = async (payload: Record<string, unknown>, successMsg?: string) => {
    setFeedback(null);
    const res = await fetch(`/api/admin/trips/${tripId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback({ type: 'error', text: data.error || 'Action failed.' });
      return null;
    }
    if (successMsg) {
      setFeedback({ type: 'success', text: successMsg });
    }
    await loadDetail();
    return data;
  };

  const handleSafeCsvExport = () => {
    if (!detail) return;
    const headers = [
      'SL',
      'Tourist Code',
      'Display Name',
      'Subgroup',
      'Joined Status',
      'Sharing Status',
      'Last GPS Update',
      'Latitude',
      'Longitude'
    ];
    const rows = detail.passengers.map((p) => [
      p.serial_no,
      p.tourist_code || '',
      `"${p.display_name}"`,
      `"${p.subgroup_name || 'Main Group'}"`,
      p.is_claimed ? 'Joined' : 'Pending',
      p.effective_status,
      p.location_updated_at || '',
      p.latitude ?? '',
      p.longitude ?? ''
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.trip.name.replace(/[^a-z0-9]+/gi, '_')}_Safe_Attendance_Report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !detail) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500">
        Loading LTT BD Admin Command Centre...
      </div>
    );
  }

  const { trip, admins, invites, passengers, meetingPoints, headcounts, announcements, groupMessages = [], alerts, logs, stats } = detail;
  const activeInvite = invites.find((i) => !i.is_revoked);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const inviteUrl = activeInvite ? `${origin}/join/${activeInvite.token}` : '';

  const openAlerts = alerts.filter(
    (a) => a.status !== 'resolved' && a.status !== 'Resolved' && a.status !== 'Closed' && a.status !== 'Cancelled'
  );
  const activeEmergencySet = new Set(openAlerts.map((a) => a.member_id));

  const filteredPassengers = passengers.filter((p) => {
    if (subgroupFilter !== 'All' && p.subgroup_name !== subgroupFilter) return false;
    if (statusFilter === 'Joined' && !p.is_claimed) return false;
    if (statusFilter === 'Sharing' && p.effective_status !== 'sharing') return false;
    if (statusFilter === 'Offline' && p.effective_status !== 'offline' && p.effective_status !== 'unavailable') return false;
    if (statusFilter === 'Separated' && !p.possible_separation) return false;
    if (!passengerSearch.trim()) return true;
    const q = passengerSearch.trim().toLowerCase();
    return (
      p.display_name.toLowerCase().includes(q) ||
      (p.tourist_code && p.tourist_code.toLowerCase().includes(q)) ||
      p.contact_number_admin.toLowerCase().includes(q) ||
      p.effective_status.toLowerCase().includes(q)
    );
  });

  const mapMarkers: MapMarkerPerson[] = filteredPassengers
    .filter((p) => p.is_claimed)
    .map((p) => ({
      ...p,
      hasActiveEmergency: activeEmergencySet.has(p.member_id),
      contactNumberAdmin: p.contact_number_admin
    }));

  // Analytics Percentages
  const sharingPct =
    stats.registeredCount > 0 ? Math.round((stats.sharingCount / stats.registeredCount) * 100) : 0;
  const inZoneCount = Math.max(0, stats.sharingCount - (stats.separatedCount || 0));
  const zoneCompliancePct =
    stats.sharingCount > 0 ? Math.round((inZoneCount / stats.sharingCount) * 100) : 100;
  const latestHc = headcounts[0];
  const hcPct =
    latestHc && stats.registeredCount > 0
      ? Math.round((latestHc.responses.length / stats.registeredCount) * 100)
      : 0;

  // Admin Directions Target Calculation
  const primaryMp = meetingPoints.find((m) => m.is_active) || meetingPoints[0];
  const adminOriginLat = adminCoords?.lat ?? primaryMp?.latitude ?? null;
  const adminOriginLng = adminCoords?.lng ?? primaryMp?.longitude ?? null;

  const targetDestLat = adminNavTarget?.latitude ?? adminNavMp?.latitude ?? null;
  const targetDestLng = adminNavTarget?.longitude ?? adminNavMp?.longitude ?? null;
  const targetDestName = adminNavTarget?.display_name ?? adminNavMp?.title ?? '';

  const adminNavDistance =
    targetDestLat !== null && targetDestLng !== null && adminOriginLat !== null && adminOriginLng !== null
      ? getDistanceMeters(adminOriginLat, adminOriginLng, targetDestLat, targetDestLng)
      : null;

  const adminGoogleMapsUrl =
    targetDestLat !== null && targetDestLng !== null
      ? buildGoogleMapsDirectionsUrl({
          originLat: adminOriginLat,
          originLng: adminOriginLng,
          destLat: targetDestLat,
          destLng: targetDestLng,
          travelMode: 'walking'
        })
      : '#';

  const handleCopyInvite = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setFeedback({ type: 'success', text: 'Invitation URL copied to clipboard.' });
  };

  const handleWhatsAppShare = () => {
    if (!inviteUrl) return;
    const message = `Welcome to LTT BD for "${trip.name}" (${trip.destination})! Open this link (or use code ${activeInvite?.invitation_code || 'KL2026'}) to join our live group map: ${inviteUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="ltt-admin-console flex-1 flex flex-col bg-slate-50">
      {/* Deep-Navy Command Centre Top Bar */}
      <header className="bg-navy-950 text-white px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" aria-label="Back to operations dashboard" className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <BrandIdentity variant="light" compact tagline="" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold">{trip.name}</h1>
              <span className="text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-400/30">
                {trip.status}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {trip.destination} • {trip.start_date} to {trip.end_date} • Capacity: {stats.rosterTotal}/{trip.max_tourists}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href="/"
            className="text-xs font-bold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/10 transition"
          >
            Home
          </Link>
          <Link
            href={`/trip/${tripId}`}
            className="text-xs font-bold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/10 transition"
          >
            Tourist Map
          </Link>
          <Link
            href={`/trip/${tripId}/chat`}
            className="text-xs font-bold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/10 transition"
          >
            Tourist Chat
          </Link>
          <Link
            href={`/trip/${tripId}/essentials`}
            className="text-xs font-bold text-slate-300 hover:text-white px-2.5 py-1.5 rounded-full hover:bg-white/10 transition"
          >
            Hotel &amp; Info
          </Link>
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="text-xs font-bold text-navy-950 bg-gold-400 hover:bg-gold-500 px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
          >
            <QrCode className="w-3.5 h-3.5" />
            Invite QR Poster
          </button>
          <button
            type="button"
            onClick={handleSafeCsvExport}
            className="text-xs font-bold text-white bg-white/10 hover:bg-white/20 border border-white/15 px-3 py-2 rounded-xl flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export Safe CSV
          </button>
          <button
            type="button"
            onClick={loadDetail}
            className="text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 px-3 py-2 rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sync Live
          </button>
          {trip.status !== 'completed' && (
            <button
              type="button"
              onClick={() => setConfirmEndTrip(true)}
              className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              End Trip &amp; Purge
            </button>
          )}
        </div>
      </header>

      {/* Command Centre Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center gap-2 overflow-x-auto">
        {[
          { id: 'command_map', label: 'Live Map & Radar', icon: MapPin },
          { id: 'incidents', label: `SOS Incident Inbox (${openAlerts.length})`, icon: ShieldAlert },
          { id: 'directory', label: `Tourist Directory (${passengers.length})`, icon: Users },
          { id: 'group_chat', label: `Live Group Chat (${groupMessages.length})`, icon: MessageCircle },
          { id: 'coordination', label: 'Headcounts, Zones & Broadcasts', icon: ClipboardCheck },
          { id: 'itinerary', label: `Daily Itinerary (${trip.itinerary?.length || 0})`, icon: Calendar },
          { id: 'roster_invites', label: 'Roster Import & Links', icon: FileSpreadsheet },
          { id: 'settings_audit', label: 'Staff, Settings & Audit', icon: Settings }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as typeof activeSection)}
              className={`py-3.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition ${
                isActive
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span>{feedback.text}</span>
            <button type="button" onClick={() => setFeedback(null)} className="font-bold ml-4">
              ✕
            </button>
          </div>
        )}

        {/* UNMISTAKABLE PULSING EMERGENCY SOS SIREN BANNER WHEN ANY TOURIST NEEDS HELP */}
        {openAlerts.length > 0 && (
          <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white rounded-3xl p-5 shadow-2xl border-4 border-amber-400 animate-pulse space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white text-red-700 flex items-center justify-center font-extrabold shadow-lg shrink-0">
                  <ShieldAlert className="w-7 h-7 animate-bounce" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-widest bg-amber-400 text-navy-950 px-2.5 py-0.5 rounded-full">
                    🚨 URGENT EMERGENCY ASSISTANCE REQUIRED ({openAlerts.length} OPEN)
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold mt-1">
                    {openAlerts[0].passenger_name} ({openAlerts[0].tourist_code || 'TB'}) — {openAlerts[0].category}
                  </h2>
                  <p className="text-xs text-red-100">
                    Contact: <strong>{openAlerts[0].contact_details}</strong> • Triggered at {new Date(openAlerts[0].created_at).toLocaleTimeString()}
                    {openAlerts[0].note ? ` • Note: "${openAlerts[0].note}"` : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {openAlerts[0].latitude !== null && openAlerts[0].longitude !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection('command_map');
                      setFocusedMemberId(openAlerts[0].member_id);
                      const target = mapMarkers.find((m) => m.member_id === openAlerts[0].member_id);
                      if (target) setAdminNavTarget(target);
                    }}
                    className="bg-gold-400 hover:bg-gold-500 text-navy-950 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg"
                  >
                    <Navigation className="w-4 h-4" />
                    Locate &amp; Google Maps Directions
                  </button>
                )}
                <a
                  href={`tel:${openAlerts[0].contact_details}`}
                  className="bg-white text-red-700 hover:bg-red-50 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg"
                >
                  <Phone className="w-4 h-4" />
                  Call Tourist
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSosId(openAlerts[0].id);
                    setAdminChatChannel('sos');
                    setActiveSection('group_chat');
                  }}
                  className="bg-white text-navy-950 hover:bg-slate-100 font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4 text-red-600" />
                  Live Chat with Tourist
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('incidents')}
                  className="bg-navy-950 hover:bg-navy-900 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg"
                >
                  Open SOS Inbox &rarr;
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Linked Overview KPI Cards (Click Any Card to Filter & Jump Directly!) */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('All');
              setSubgroupFilter('All');
              setPassengerSearch('');
              setActiveSection('directory');
              document.getElementById('admin-target-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`text-left p-3.5 rounded-2xl border shadow-sm transition group ${
              activeSection === 'directory' && statusFilter === 'All'
                ? 'bg-brand-50 border-brand-600 ring-2 ring-brand-500/30'
                : 'bg-white hover:bg-brand-50 border-slate-200 hover:border-brand-500'
            }`}
          >
            <div className="text-[11px] text-slate-500 group-hover:text-brand-700 font-semibold flex items-center justify-between">
              <span>Total Roster</span>
              <span className="text-[10px] font-bold text-brand-600">All ({stats.rosterTotal}) &rarr;</span>
            </div>
            <div className="text-xl font-extrabold text-slate-900">{stats.rosterTotal}</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('Joined');
              setSubgroupFilter('All');
              setActiveSection('directory');
              document.getElementById('admin-target-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`text-left p-3.5 rounded-2xl border shadow-sm transition group ${
              activeSection === 'directory' && statusFilter === 'Joined'
                ? 'bg-brand-50 border-brand-600 ring-2 ring-brand-500/30'
                : 'bg-white hover:bg-brand-50 border-slate-200 hover:border-brand-500'
            }`}
          >
            <div className="text-[11px] text-slate-500 group-hover:text-brand-700 font-semibold flex items-center justify-between">
              <span>Joined App</span>
              <span className="text-[10px] font-bold text-brand-600">Joined &rarr;</span>
            </div>
            <div className="text-xl font-extrabold text-slate-900">{stats.registeredCount}</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('Sharing');
              setActiveSection('directory');
              document.getElementById('admin-target-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`text-left p-3.5 rounded-2xl border shadow-sm transition group ${
              statusFilter === 'Sharing'
                ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-500/30'
                : 'bg-white hover:bg-teal-50 border-slate-200 hover:border-teal-500'
            }`}
          >
            <div className="text-[11px] text-slate-500 group-hover:text-teal-700 font-semibold flex items-center justify-between">
              <span>Sharing Now</span>
              <span className="text-[10px] font-bold text-teal-600">Live &rarr;</span>
            </div>
            <div className="text-xl font-extrabold text-teal-600">{stats.sharingCount}</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('Offline');
              setActiveSection('directory');
              document.getElementById('admin-target-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`text-left p-3.5 rounded-2xl border shadow-sm transition group ${
              statusFilter === 'Offline'
                ? 'bg-slate-200 border-slate-600 ring-2 ring-slate-400/30'
                : 'bg-white hover:bg-slate-100 border-slate-200 hover:border-slate-400'
            }`}
          >
            <div className="text-[11px] text-slate-500 font-semibold flex items-center justify-between">
              <span>Stale / Offline</span>
              <span className="text-[10px] font-bold text-slate-600">Offline &rarr;</span>
            </div>
            <div className="text-xl font-extrabold text-slate-600">{stats.offlineCount}</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setStatusFilter('Separated');
              setActiveSection('directory');
              document.getElementById('admin-target-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`text-left p-3.5 rounded-2xl border shadow-sm transition group ${
              statusFilter === 'Separated'
                ? 'bg-amber-50 border-amber-600 ring-2 ring-amber-500/30'
                : 'bg-white hover:bg-amber-50 border-slate-200 hover:border-amber-500'
            }`}
          >
            <div className="text-[11px] text-slate-500 group-hover:text-amber-800 font-semibold flex items-center justify-between">
              <span>Possible Separation</span>
              <span className="text-[10px] font-bold text-amber-600">Filter &rarr;</span>
            </div>
            <div className="text-xl font-extrabold text-amber-600">{stats.separatedCount || 0}</div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSection('incidents');
              document.getElementById('admin-target-section')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`text-left p-3.5 rounded-2xl border shadow-sm transition group ${
              openAlerts.length > 0
                ? 'bg-red-600 text-white border-red-700 ring-4 ring-red-400/50 animate-pulse'
                : activeSection === 'incidents'
                ? 'bg-red-50 border-red-500 ring-2 ring-red-400/30'
                : 'bg-white hover:bg-red-50 border-slate-200 hover:border-red-400'
            }`}
          >
            <div
              className={`text-[11px] font-semibold flex items-center justify-between ${
                openAlerts.length > 0 ? 'text-red-100' : 'text-slate-500'
              }`}
            >
              <span>Open SOS Alerts</span>
              <span className="text-[10px] font-bold">Inbox &rarr;</span>
            </div>
            <div
              className={`text-xl font-extrabold ${
                openAlerts.length > 0 ? 'text-white' : 'text-red-600'
              }`}
            >
              {openAlerts.length}
            </div>
          </button>
        </div>
        <div id="admin-target-section" />

        {/* Live Telemetry & Safety Health Bars */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm grid sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
              <span className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-brand-600" /> Live GPS Sharing Coverage
              </span>
              <span className="text-brand-700">{sharingPct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-600 rounded-full transition-all" style={{ width: `${sharingPct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
              <span>Geofence Cluster Compliance</span>
              <span className="text-emerald-700">{zoneCompliancePct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${zoneCompliancePct}%` }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
              <span>Latest Headcount Check-In Rate</span>
              <span className="text-amber-600">{hcPct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${hcPct}%` }} />
            </div>
          </div>
        </div>

        {/* SECTION 1: COMMAND MAP & RADAR */}
        {activeSection === 'command_map' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div id="admin-main-panel" className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Live Group Command Map (Click Any Tourist Pin for Google Maps Directions)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Click any tourist marker to view their distance, call/WhatsApp them, or launch turn-by-turn Google Maps directions.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <select
                    value={subgroupFilter}
                    onChange={(e) => setSubgroupFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white font-semibold"
                  >
                    <option value="All">All Subgroups</option>
                    <option value="Bus A">Bus A</option>
                    <option value="Bus B">Bus B</option>
                    <option value="Main Group">Main Group</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white font-semibold"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Sharing">Sharing Now</option>
                    <option value="Offline">Stale / Offline</option>
                    <option value="Separated">Possible Separation</option>
                  </select>
                </div>
              </div>

              <GroupMap
                members={mapMarkers}
                meetingPoints={meetingPoints}
                essentials={trip.essentials}
                adminOriginCoords={adminCoords}
                focusedMemberId={focusedMemberId}
                routeTargetMember={adminNavTarget}
                routeTargetMeetingPoint={adminNavMp}
                isAdminView={true}
                heightClass="h-[500px]"
                onRequestDirections={(person) => {
                  setAdminNavMp(null);
                  setAdminNavTarget(person);
                }}
                onRequestMeetingPointDirections={(mp) => {
                  setAdminNavTarget(null);
                  setAdminNavMp(mp);
                }}
              />
            </div>

            <div className="space-y-4">
              {/* Quick Tourist Radar List with Direct Directions & WhatsApp Buttons */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Navigation className="w-4 h-4 text-brand-600" />
                    Quick Locate &amp; Directions ({mapMarkers.length})
                  </h3>
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {mapMarkers.map((m) => (
                    <div key={m.member_id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setFocusedMemberId(m.member_id)}
                        className="text-left min-w-0 flex-1 hover:text-brand-600"
                      >
                        <div className="font-bold text-slate-900 truncate">{m.display_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {m.tourist_code} • {m.subgroup_name}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedMemberId(m.member_id);
                            setAdminNavMp(null);
                            setAdminNavTarget(m);
                          }}
                          className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow-sm"
                          title="Get Google Maps Directions to this tourist"
                        >
                          <Navigation className="w-3 h-3" />
                          Directions
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active SOS Queue Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    Active SOS Queue ({openAlerts.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveSection('incidents')}
                    className="text-xs font-bold text-brand-600 hover:underline"
                  >
                    Inbox &rarr;
                  </button>
                </div>
                {openAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2 text-center">
                    No active emergency requests right now.
                  </p>
                ) : (
                  openAlerts.slice(0, 3).map((al) => (
                    <div key={al.id} className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>{al.passenger_name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white">
                          {al.priority || 'High'}
                        </span>
                      </div>
                      <div className="text-red-800 font-semibold">{al.category}</div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const target = mapMarkers.find((m) => m.member_id === al.member_id);
                            if (target) {
                              setFocusedMemberId(target.member_id);
                              setAdminNavTarget(target);
                            }
                          }}
                          className="bg-brand-600 text-white px-2.5 py-1 rounded-lg font-bold flex items-center gap-1"
                        >
                          <Navigation className="w-3 h-3" />
                          Directions
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveSection('incidents')}
                          className="bg-red-600 text-white px-2.5 py-1 rounded-lg font-bold"
                        >
                          Respond
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Destructive capacity simulator is restricted to the local sample trip. */}
              {process.env.NODE_ENV === 'development' && trip.id === '11111111-2222-3333-4444-555555555555' && trip.status !== 'completed' && (
                <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-sm space-y-2.5">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <FlaskConical className="w-4 h-4 text-amber-700" />
                    Local sample-trip load simulator
                  </h3>
                  <p className="text-[11px] leading-relaxed text-amber-900">Development testing only. Replaces the sample passenger data and should never be used on a real trip.</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 5, 25, 50, 100].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() =>
                          handlePostAction(
                            { action: 'simulate_tourists', count: cnt },
                            `Loaded ${cnt} demo tourists onto map.`
                          )
                        }
                        className="bg-slate-100 hover:bg-brand-600 hover:text-white text-slate-800 font-bold text-xs py-2 rounded-xl transition"
                      >
                        {cnt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: INCIDENT INBOX */}
        {activeSection === 'incidents' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                SOS &amp; Assistance Incident Inbox ({alerts.length})
              </h2>
              <p className="text-xs text-slate-500">
                Acknowledge requests, assign field responders, launch Google Maps directions to the tourist, and close with resolution notes.
              </p>
            </div>

            {alerts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No assistance requests recorded for this trip.
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {alerts.map((alert) => {
                  const gmapsUrl =
                    alert.latitude !== null && alert.longitude !== null
                      ? buildGoogleMapsDirectionsUrl({
                          originLat: adminOriginLat,
                          originLng: adminOriginLng,
                          destLat: alert.latitude,
                          destLng: alert.longitude,
                          travelMode: 'walking'
                        })
                      : null;

                  return (
                    <div
                      key={alert.id}
                      className="rounded-2xl border border-slate-200 p-4 space-y-3 bg-slate-50/50 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-extrabold text-sm text-slate-900">
                            {alert.passenger_name}
                          </span>{' '}
                          <span className="font-mono text-[11px] text-slate-500">
                            ({alert.tourist_code || 'TB'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                            {alert.priority || 'High'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-extrabold text-[11px]">
                            {alert.status}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1 text-slate-700">
                        <div>
                          <strong>Category:</strong> {alert.category || 'Assistance Request'}
                        </div>
                        <div>
                          <strong>Contact:</strong>{' '}
                          <a href={`tel:${alert.contact_details}`} className="text-brand-700 underline font-semibold">
                            {alert.contact_details}
                          </a>
                        </div>
                        {alert.note && (
                          <div>
                            <strong>Tourist Note:</strong> {alert.note}
                          </div>
                        )}
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                        <input
                          type="text"
                          placeholder={alert.assigned_responder || 'Assign Responder (e.g. Guide Rahim)'}
                          value={responderInput[alert.id] ?? alert.assigned_responder ?? ''}
                          onChange={(e) =>
                            setResponderInput((prev) => ({ ...prev, [alert.id]: e.target.value }))
                          }
                          className="rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
                        />
                        <input
                          type="text"
                          placeholder={alert.internal_notes || 'Internal staff-only note...'}
                          value={internalNoteInput[alert.id] ?? alert.internal_notes ?? ''}
                          onChange={(e) =>
                            setInternalNoteInput((prev) => ({ ...prev, [alert.id]: e.target.value }))
                          }
                          className="rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
                        />
                      </div>

                      {alert.messages && alert.messages.length > 0 && (
                        <div className="bg-white rounded-xl p-2.5 border border-slate-200 max-h-32 overflow-y-auto space-y-1">
                          {alert.messages.map((m) => (
                            <div key={m.id} className="text-[11px]">
                              <span className="font-bold text-slate-900">{m.sender_name}: </span>
                              <span className="text-slate-700">{m.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Reply to tourist..."
                          value={replyInput[alert.id] || ''}
                          onChange={(e) =>
                            setReplyInput((prev) => ({ ...prev, [alert.id]: e.target.value }))
                          }
                          className="flex-1 rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!replyInput[alert.id]?.trim()) return;
                            handlePostAction(
                              {
                                action: 'reply_alert',
                                alertId: alert.id,
                                message: replyInput[alert.id]
                              },
                              'Message sent to tourist.'
                            );
                            setReplyInput((prev) => ({ ...prev, [alert.id]: '' }));
                          }}
                          className="bg-navy-900 text-white px-3 py-1.5 rounded-xl font-bold flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Reply
                        </button>
                      </div>

                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <input
                          type="text"
                          placeholder={alert.resolution_notes || 'Resolution outcome notes (to close incident)...'}
                          value={resolutionInput[alert.id] ?? alert.resolution_notes ?? ''}
                          onChange={(e) =>
                            setResolutionInput((prev) => ({ ...prev, [alert.id]: e.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
                        />

                        <div className="flex flex-wrap items-center gap-1.5">
                          {gmapsUrl && (
                            <a
                              href={gmapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-brand-600 text-white px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1"
                            >
                              <Navigation className="w-3 h-3" />
                              Directions (Google Maps)
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              handlePostAction(
                                {
                                  action: 'update_alert',
                                  alertId: alert.id,
                                  status: 'Acknowledged',
                                  assignedResponder: responderInput[alert.id] ?? alert.assigned_responder,
                                  internalNotes: internalNoteInput[alert.id] ?? alert.internal_notes
                                },
                                'Incident acknowledged.'
                              )
                            }
                            className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-xl font-bold"
                          >
                            Acknowledge
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePostAction(
                                {
                                  action: 'update_alert',
                                  alertId: alert.id,
                                  status: 'Responding',
                                  assignedResponder: responderInput[alert.id] ?? alert.assigned_responder,
                                  internalNotes: internalNoteInput[alert.id] ?? alert.internal_notes
                                },
                                'Marked as Responding.'
                              )
                            }
                            className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-xl font-bold"
                          >
                            Assign &amp; Respond
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handlePostAction(
                                {
                                  action: 'update_alert',
                                  alertId: alert.id,
                                  status: 'Resolved',
                                  resolutionNotes:
                                    resolutionInput[alert.id] || 'Assisted and reunited with group'
                                },
                                'Incident resolved.'
                              )
                            }
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-xl font-bold flex items-center gap-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Resolve &amp; Close
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: TOURIST DIRECTORY (with Direct Directions, WhatsApp, & Call Buttons) */}
        {activeSection === 'directory' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Searchable Tourist Directory — Showing: <span className="text-brand-600">{statusFilter}</span> ({filteredPassengers.length} of {passengers.length})
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {[
                    { id: 'All', label: `All Roster (${stats.rosterTotal})` },
                    { id: 'Joined', label: `Joined App (${stats.registeredCount})` },
                    { id: 'Sharing', label: `Sharing Now (${stats.sharingCount})` },
                    { id: 'Offline', label: `Stale / Offline (${stats.offlineCount})` },
                    { id: 'Separated', label: `Possible Separation (${stats.separatedCount || 0})` }
                  ].map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setStatusFilter(pill.id)}
                      className={`px-3 py-1 rounded-full font-bold transition ${
                        statusFilter === pill.id
                          ? 'bg-navy-900 text-white shadow'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Search name, LTT-ID, phone, status..."
                  value={passengerSearch}
                  onChange={(e) => setPassengerSearch(e.target.value)}
                  className="w-64 rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={handleSafeCsvExport}
                  className="bg-navy-900 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Safe CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                    <th className="py-2.5 px-3">ID</th>
                    <th className="py-2.5 px-3">Passenger Name</th>
                    <th className="py-2.5 px-3">Subgroup</th>
                    <th className="py-2.5 px-3">Contact (Admin Only)</th>
                    <th className="py-2.5 px-3">Passport (Masked)</th>
                    <th className="py-2.5 px-3">Sharing Status</th>
                    <th className="py-2.5 px-3">Last Update</th>
                    <th className="py-2.5 px-3 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPassengers.map((pax) => {
                    const cleanDigits = pax.contact_number_admin.replace(/[^0-9]/g, '');
                    return (
                      <tr key={pax.roster_id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-600">
                          {pax.tourist_code}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {pax.display_name}
                          {pax.possible_separation && (
                            <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                              Possible Separation
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{pax.subgroup_name}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-800">{pax.contact_number_admin}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{pax.passport_masked}</td>
                        <td className="py-2.5 px-3">
                          {!pax.is_claimed ? (
                            <span className="text-slate-400">Not Joined</span>
                          ) : pax.effective_status === 'sharing' ? (
                            <span className="text-teal-700 font-bold">● Sharing Now</span>
                          ) : pax.effective_status === 'disabled' ? (
                            <span className="text-amber-700 font-semibold">● Paused</span>
                          ) : (
                            <span className="text-slate-500 font-semibold">● Stale / Offline</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {pax.location_updated_at
                            ? new Date(pax.location_updated_at).toLocaleTimeString()
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                          {pax.latitude !== null && pax.longitude !== null && (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveSection('command_map');
                                setFocusedMemberId(pax.member_id);
                                setAdminNavMp(null);
                                setAdminNavTarget({
                                  ...pax,
                                  contactNumberAdmin: pax.contact_number_admin
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-bold shadow-sm"
                              title="Get Google Maps Directions"
                            >
                              <Navigation className="w-3 h-3" />
                              Directions
                            </button>
                          )}
                          {cleanDigits.length >= 8 && (
                            <a
                              href={`https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                                `Hello ${pax.display_name}, this is your LTT BD Tour Organizer checking in.`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold"
                            >
                              <MessageCircle className="w-3 h-3" />
                              WhatsApp
                            </a>
                          )}
                          <a
                            href={`tel:${pax.contact_number_admin}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 font-bold"
                          >
                            <Phone className="w-3 h-3" />
                            Call
                          </a>
                          {pax.is_claimed && (
                            <button
                              type="button"
                              onClick={() =>
                                handlePostAction(
                                  { action: 'remove_passenger', rosterId: pax.roster_id },
                                  `Removed session for ${pax.display_name}.`
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 text-red-700 font-bold"
                              title="Remove passenger session"
                            >
                              <UserMinus className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECTION 3B: IDENTICAL DUAL-CHANNEL ADMIN OPERATIONS & GROUP COMMAND CHAT */}
        {activeSection === 'group_chat' && (() => {
          const currentSosAlert =
            alerts.find((a) => a.id === selectedSosId) || openAlerts[0] || alerts[0] || null;

          return (
            <div className="bg-navy-950 text-white rounded-3xl border border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
              {/* Top Channel Switcher (Exact Match to Tourist Chat!) */}
              <div className="grid grid-cols-2 gap-2 bg-navy-900 p-1.5 rounded-2xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setAdminChatChannel('sos')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition ${
                    adminChatChannel === 'sos'
                      ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ShieldAlert className="w-4 h-4" />
                  Direct SOS &amp; Operations Desk ({openAlerts.length} Active)
                </button>

                <button
                  type="button"
                  onClick={() => setAdminChatChannel('group')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition ${
                    adminChatChannel === 'group'
                      ? 'bg-gradient-to-r from-brand-600 to-teal-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" />
                  Group &amp; Tour Leader Chat ({groupMessages.length})
                </button>
              </div>

              {/* CHANNEL 1: DIRECT SOS & OPERATIONS DESK */}
              {adminChatChannel === 'sos' && (
                <div className="grid lg:grid-cols-12 gap-4">
                  {/* Left Column: SOS Tourist Threads Selector */}
                  <div className="lg:col-span-4 bg-slate-900/90 rounded-2xl border border-white/10 p-3 space-y-2 max-h-[500px] overflow-y-auto">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
                      SOS Assistance Threads ({alerts.length})
                    </div>
                    {alerts.length === 0 ? (
                      <p className="text-xs text-slate-500 py-8 text-center">
                        No SOS threads recorded yet.
                      </p>
                    ) : (
                      alerts.map((al) => {
                        const isSelected = currentSosAlert?.id === al.id;
                        return (
                          <button
                            key={al.id}
                            type="button"
                            onClick={() => setSelectedSosId(al.id)}
                            className={`w-full text-left p-3 rounded-xl border transition space-y-1 ${
                              isSelected
                                ? 'bg-red-950/80 border-red-500 text-white'
                                : 'bg-navy-950/60 border-white/10 text-slate-300 hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-xs">{al.passenger_name}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-bold">
                                {al.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-amber-300 font-semibold truncate">
                              {al.category}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {al.contact_details} • {new Date(al.created_at).toLocaleTimeString()}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Right Column: Active SOS Chat Thread */}
                  <div className="lg:col-span-8 bg-slate-900/90 rounded-2xl border border-red-500/40 flex flex-col overflow-hidden">
                    {currentSosAlert ? (
                      <>
                        <div className="bg-gradient-to-r from-red-900/80 via-red-800/80 to-navy-900 p-4 border-b border-red-500/30 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-400 text-navy-950">
                                {currentSosAlert.priority || 'High'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-white/20 text-white">
                                {currentSosAlert.status}
                              </span>
                            </div>
                            <h3 className="text-sm font-extrabold text-white">
                              {currentSosAlert.passenger_name} ({currentSosAlert.tourist_code || 'TB'}) — {currentSosAlert.category}
                            </h3>
                            <p className="text-[11px] text-red-200">
                              Phone: {currentSosAlert.contact_details}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {currentSosAlert.latitude !== null && currentSosAlert.longitude !== null && (
                              <a
                                href={buildGoogleMapsDirectionsUrl({
                                  originLat: adminOriginLat,
                                  originLng: adminOriginLng,
                                  destLat: currentSosAlert.latitude,
                                  destLng: currentSosAlert.longitude,
                                  travelMode: 'walking'
                                })}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-gold-400 text-navy-950 font-extrabold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1"
                              >
                                <Navigation className="w-3.5 h-3.5" />
                                Directions
                              </a>
                            )}
                            <a
                              href={`tel:${currentSosAlert.contact_details}`}
                              className="bg-white/15 hover:bg-white/25 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              Call
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                handlePostAction(
                                  {
                                    action: 'update_alert',
                                    alertId: currentSosAlert.id,
                                    status: 'Acknowledged'
                                  },
                                  'SOS Acknowledged.'
                                )
                              }
                              className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl"
                            >
                              Acknowledge
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handlePostAction(
                                  {
                                    action: 'update_alert',
                                    alertId: currentSosAlert.id,
                                    status: 'Resolved',
                                    resolutionNotes: 'Assisted via Operations Live Chat'
                                  },
                                  'SOS Resolved.'
                                )
                              }
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl"
                            >
                              Resolve
                            </button>
                          </div>
                        </div>

                        {/* Quick Operations Reply Chips */}
                        <div className="px-4 py-2.5 bg-navy-950/60 border-b border-white/10 flex items-center gap-1.5 overflow-x-auto">
                          {[
                            '🚨 Operations received your SOS! Stay where you are, a guide is heading to your GPS pin.',
                            '📞 Calling your registered mobile number now.',
                            '🧭 We have locked onto your GPS coordinates and are 5 mins away.',
                            '🏨 Please wait inside the nearest safe lobby; responder assigned.'
                          ].map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() =>
                                handlePostAction(
                                  {
                                    action: 'reply_alert',
                                    alertId: currentSosAlert.id,
                                    message: chip
                                  },
                                  'Operations reply sent.'
                                )
                              }
                              className="text-[11px] font-bold bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white px-3 py-1.5 rounded-full whitespace-nowrap border border-slate-700 transition"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>

                        {/* Message Feed */}
                        <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-80">
                          {(currentSosAlert.messages || []).map((m) => {
                            const isStaff = m.sender_role === 'organizer' || m.sender_role === 'responder';
                            return (
                              <div
                                key={m.id}
                                className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                              >
                                <div
                                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs space-y-1 shadow-lg ${
                                    isStaff
                                      ? 'bg-gradient-to-r from-amber-500/25 to-red-500/25 border border-amber-400/50 text-white'
                                      : 'bg-slate-800 text-white border border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-4 text-[10px]">
                                    <span className="font-extrabold text-gold-400">
                                      {m.sender_name}
                                      {isStaff && (
                                        <span className="ml-1.5 bg-gold-400 text-navy-950 px-1.5 py-0.2 rounded font-extrabold">
                                          OPERATIONS DESK
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-slate-300">
                                      {new Date(m.created_at).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  </div>
                                  <p className="leading-relaxed text-sm">{m.message}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Composer */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!adminSosReplyText.trim()) return;
                            handlePostAction(
                              {
                                action: 'reply_alert',
                                alertId: currentSosAlert.id,
                                message: adminSosReplyText
                              },
                              'Operations reply sent.'
                            );
                            setAdminSosReplyText('');
                          }}
                          className="p-3.5 bg-navy-950 border-t border-white/10 flex items-center gap-2"
                        >
                          <input
                            type="text"
                            placeholder={`Reply directly to ${currentSosAlert.passenger_name}...`}
                            value={adminSosReplyText}
                            onChange={(e) => setAdminSosReplyText(e.target.value)}
                            className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-xs text-white placeholder-slate-400"
                          />
                          <button
                            type="submit"
                            className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 shadow-lg"
                          >
                            <Send className="w-4 h-4" />
                            Send SOS Reply
                          </button>
                        </form>
                      </>
                    ) : (
                      <div className="p-10 text-center text-xs text-slate-400 my-auto">
                        No active SOS thread selected.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* CHANNEL 2: GROUP & TOUR LEADER CHAT */}
              {adminChatChannel === 'group' && (
                <div className="bg-slate-900/90 rounded-2xl border border-white/15 overflow-hidden flex flex-col">
                  <div className="p-3.5 bg-navy-950/70 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      {[
                        'Please proceed to the scheduled meeting point in 15 minutes.',
                        'The coach is ready for boarding. Please follow your tour leader’s instructions.',
                        'Please complete the active roll call check-in.',
                        'Please check your itinerary for the next group meal time and venue.'
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() =>
                            handlePostAction(
                              {
                                action: 'send_group_chat',
                                message: preset,
                                latitude: adminOriginLat,
                                longitude: adminOriginLng
                              },
                              'Broadcast sent to group chat.'
                            )
                          }
                          className="text-[11px] font-bold bg-slate-800 hover:bg-brand-600 text-teal-200 hover:text-white px-3 py-1.5 rounded-full whitespace-nowrap border border-slate-700 transition"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
                    {groupMessages.map((msg) => {
                      const isStaff = msg.sender_role === 'organizer' || msg.sender_role === 'responder';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 text-xs space-y-1 shadow-lg ${
                              isStaff
                                ? 'bg-gradient-to-r from-amber-500/20 to-teal-500/20 border border-amber-400/50 text-white'
                                : 'bg-slate-800 text-slate-100 border border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4 text-[10px]">
                              <span className="font-extrabold text-gold-400">
                                {msg.sender_name} ({msg.sender_code || 'TB'})
                                {isStaff && (
                                  <span className="ml-1.5 bg-gold-400 text-navy-950 px-1.5 py-0.2 rounded font-extrabold">
                                    OPERATIONS
                                  </span>
                                )}
                              </span>
                              <span className="text-slate-300">
                                {new Date(msg.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            <p className="leading-relaxed text-sm">{msg.message}</p>
                            {typeof msg.latitude === 'number' && typeof msg.longitude === 'number' && (
                              <div className="pt-1">
                                <a
                                  href={buildGoogleMapsDirectionsUrl({
                                    originLat: adminOriginLat,
                                    originLng: adminOriginLng,
                                    destLat: msg.latitude,
                                    destLng: msg.longitude,
                                    travelMode: 'walking'
                                  })}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-white/15 hover:bg-white/25 text-teal-200 px-2.5 py-1 rounded-lg"
                                >
                                  <Navigation className="w-3 h-3" />
                                  Open Shared GPS Pin in Google Maps
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!adminChatText.trim()) return;
                      handlePostAction(
                        {
                          action: 'send_group_chat',
                          message: adminChatText,
                          latitude: adminOriginLat,
                          longitude: adminOriginLng
                        },
                        'Message posted to group chat.'
                      );
                      setAdminChatText('');
                    }}
                    className="p-3.5 bg-navy-950 border-t border-white/10 flex items-center gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Send an official Operations message to all tourists..."
                      value={adminChatText}
                      onChange={(e) => setAdminChatText(e.target.value)}
                      className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-xs text-white placeholder-slate-400"
                    />
                    <button
                      type="submit"
                      className="bg-brand-500 hover:bg-brand-600 text-white font-extrabold text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 shadow-lg"
                    >
                      <Send className="w-4 h-4" />
                      Send as Operations
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })()}

        {/* SECTION 4: SMART COORDINATION */}
        {activeSection === 'coordination' && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Digital Headcount Roll Call Manager */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-brand-600" />
                Digital Headcount Roll Calls
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePostAction(
                    {
                      action: 'start_headcount',
                      title: hcTitle || 'Group Assembly Roll Call',
                      subgroupName: hcSubgroup
                    },
                    'Digital Headcount started.'
                  );
                  setHcTitle('');
                }}
                className="space-y-2.5 text-xs"
              >
                <input
                  type="text"
                  required
                  placeholder="Roll Call Title (e.g. Coach Boarding Check)"
                  value={hcTitle}
                  onChange={(e) => setHcTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={hcSubgroup}
                    onChange={(e) => setHcSubgroup(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2 bg-white"
                  >
                    <option value="All">All Tourists</option>
                    <option value="Bus A">Bus A</option>
                    <option value="Bus B">Bus B</option>
                  </select>
                  <button
                    type="submit"
                    className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2 rounded-xl"
                  >
                    Start Roll Call
                  </button>
                </div>
              </form>

              <div className="space-y-3 pt-2 border-t border-slate-100">
                {headcounts.map((hc) => {
                  const presentCount = hc.responses.filter((r) => r.status === 'present').length;
                  const helpCount = hc.responses.filter((r) => r.status === 'needs_help').length;
                  const notResponded = Math.max(0, stats.registeredCount - hc.responses.length);
                  return (
                    <div
                      key={hc.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>{hc.title}</span>
                        <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-brand-100 text-brand-800">
                          {hc.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
                        <div className="bg-emerald-50 text-emerald-800 p-1.5 rounded-lg font-bold">
                          Present: {presentCount}
                        </div>
                        <div className="bg-amber-50 text-amber-800 p-1.5 rounded-lg font-bold">
                          Pending: {notResponded}
                        </div>
                        <div className="bg-red-50 text-red-800 p-1.5 rounded-lg font-bold">
                          Help: {helpCount}
                        </div>
                      </div>
                      {hc.status === 'open' && (
                        <button
                          type="button"
                          onClick={() =>
                            handlePostAction(
                              { action: 'close_headcount', sessionId: hc.id },
                              'Roll call closed.'
                            )
                          }
                          className="w-full py-1.5 rounded-lg border border-slate-300 text-slate-700 font-semibold"
                        >
                          Close Roll Call
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Meeting Points & Geofence Manager */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-500" />
                Meeting Points &amp; Geofences
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const latitude = Number(mpLat);
                  const longitude = Number(mpLng);
                  const radius = Number(mpRadius);
                  if (!mpLat.trim() || !mpLng.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
                    setFeedback({ type: 'error', text: 'Enter valid latitude (-90 to 90) and longitude (-180 to 180) for this meeting point.' });
                    return;
                  }
                  if (!Number.isFinite(radius) || radius < 10 || radius > 10000) {
                    setFeedback({ type: 'error', text: 'Meeting point radius must be between 10 and 10,000 metres.' });
                    return;
                  }
                  void handlePostAction(
                    {
                      action: 'create_meeting_point',
                      title: mpTitle,
                      latitude,
                      longitude,
                      radiusMeters: radius,
                      notes: mpNotes,
                      scheduledAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString()
                    },
                    'Meeting Point & Geofence created.'
                  ).then((result) => {
                    if (result) {
                      setMpTitle('');
                      setMpLat('');
                      setMpLng('');
                      setMpNotes('');
                    }
                  });
                }}
                className="space-y-2.5 text-xs"
              >
                <input
                  type="text"
                  required
                  placeholder="Checkpoint Title (e.g. Hotel Grand Lobby)"
                  value={mpTitle}
                  onChange={(e) => setMpTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="-90"
                    max="90"
                    step="any"
                    required
                    placeholder="Lat"
                    value={mpLat}
                    onChange={(e) => setMpLat(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    min="-180"
                    max="180"
                    step="any"
                    required
                    placeholder="Lng"
                    value={mpLng}
                    onChange={(e) => setMpLng(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5"
                  />
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    step="10"
                    required
                    placeholder="Radius (m)"
                    value={mpRadius}
                    onChange={(e) => setMpRadius(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Instructions / Notes..."
                  value={mpNotes}
                  onChange={(e) => setMpNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <button
                  type="submit"
                  className="w-full bg-amber-500 hover:bg-amber-600 text-navy-950 font-extrabold py-2 rounded-xl"
                >
                  Add Meeting Point &amp; Geofence
                </button>
              </form>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {meetingPoints.map((mp) => (
                  <div
                    key={mp.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{mp.title}</div>
                      <div className="text-[11px] text-slate-500">
                        Geofence: {mp.radius_meters}m • {mp.is_active ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          handlePostAction({
                            action: 'manage_meeting_point',
                            meetingPointId: mp.id,
                            subAction: 'toggle'
                          })
                        }
                        className="px-2 py-1 rounded bg-white border border-slate-300 text-[11px] font-semibold"
                      >
                        {mp.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handlePostAction({
                            action: 'manage_meeting_point',
                            meetingPointId: mp.id,
                            subAction: 'delete'
                          })
                        }
                        className="px-2 py-1 rounded bg-red-50 text-red-600 text-[11px] font-semibold"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Announcements Broadcast Manager */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-brand-600" />
                Trip Announcements
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePostAction(
                    {
                      action: 'create_announcement',
                      title: annTitle,
                      body: annBody,
                      subgroupName: annSubgroup,
                      priority: annPriority
                    },
                    'Announcement published to tourists.'
                  );
                  setAnnTitle('');
                  setAnnBody('');
                }}
                className="space-y-2.5 text-xs"
              >
                <input
                  type="text"
                  required
                  placeholder="Headline (e.g. Coach Departure in 15 Mins)"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <textarea
                  rows={2}
                  required
                  placeholder="Announcement message..."
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={annSubgroup}
                    onChange={(e) => setAnnSubgroup(e.target.value)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
                  >
                    <option value="All">All Tourists</option>
                    <option value="Bus A">Bus A</option>
                    <option value="Bus B">Bus B</option>
                  </select>
                  <select
                    value={annPriority}
                    onChange={(e) => setAnnPriority(e.target.value as typeof annPriority)}
                    className="rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
                  >
                    <option value="normal">Normal Priority</option>
                    <option value="important">Important</option>
                    <option value="urgent">Urgent Alert</option>
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full bg-navy-900 hover:bg-navy-800 text-white font-bold py-2 rounded-xl"
                >
                  Broadcast Announcement
                </button>
              </form>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                {announcements.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{ann.title}</span>
                      <span className="text-[10px] text-emerald-700">
                        Read by {ann.read_by_member_ids.length}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">{ann.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: INTERACTIVE DAILY ITINERARY BUILDER */}
        {activeSection === 'itinerary' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-600" />
                Add Daily Itinerary Activity
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePostAction(
                    {
                      action: 'add_itinerary',
                      dayLabel: itDay,
                      timeLabel: itTime,
                      title: itTitle,
                      locationName: itLocation,
                      instructions: itInstructions
                    },
                    'Itinerary item added and synced to all tourist devices.'
                  );
                  setItTitle('');
                  setItLocation('');
                  setItInstructions('');
                }}
                className="space-y-2.5"
              >
                <input
                  type="text"
                  required
                  placeholder="Day Label (e.g. Day 2 • 15 Nov 2026)"
                  value={itDay}
                  onChange={(e) => setItDay(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <input
                  type="text"
                  required
                  placeholder="Time (e.g. 10:30 AM)"
                  value={itTime}
                  onChange={(e) => setItTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <input
                  type="text"
                  required
                  placeholder="Activity Title (e.g. Batu Caves Guided Tour)"
                  value={itTitle}
                  onChange={(e) => setItTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <input
                  type="text"
                  required
                  placeholder="Meeting / Venue Location"
                  value={itLocation}
                  onChange={(e) => setItLocation(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <textarea
                  rows={2}
                  required
                  placeholder="Instructions for tourists..."
                  value={itInstructions}
                  onChange={(e) => setItInstructions(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                />
                <button
                  type="submit"
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-xl"
                >
                  Publish Itinerary Item
                </button>
              </form>
            </div>

            <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Published Trip Schedule ({(trip.itinerary || []).length} Activities)
              </h3>
              <div className="space-y-3">
                {(trip.itinerary || []).map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-brand-700">
                        {item.day_label} • {item.time_label}
                      </div>
                      <div className="text-sm font-extrabold text-slate-900">{item.title}</div>
                      <div className="text-slate-700 font-semibold">📍 {item.location_name}</div>
                      <p className="text-slate-500">{item.instructions}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handlePostAction(
                          { action: 'delete_itinerary', itemId: item.id },
                          'Removed itinerary item.'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 font-bold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 6: ROSTER IMPORT & INVITATION LINKS */}
        {activeSection === 'roster_invites' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-brand-600" />
                Tourist Invitation URL, Short Code &amp; QR Poster
              </h3>
              {inviteUrl ? (
                <>
                  <div className="bg-slate-100 p-3 rounded-xl text-xs font-mono break-all text-slate-800 border border-slate-200">
                    <div>URL: {inviteUrl}</div>
                    <div className="mt-1 font-bold text-brand-700">
                      Short Invitation Code: {activeInvite?.invitation_code || 'KL2026'}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyInvite}
                      className="bg-navy-900 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy URL
                    </button>
                    <button
                      type="button"
                      onClick={handleWhatsAppShare}
                      className="bg-emerald-600 text-white text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="bg-gold-400 text-navy-950 text-xs font-extrabold py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Show QR
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handlePostAction(
                        { action: 'generate_invite', revokeExisting: true },
                        'Previous link revoked and new invitation token generated.'
                      )
                    }
                    className="w-full text-xs font-semibold text-red-600 py-2 border border-slate-200 rounded-xl"
                  >
                    Revoke Current Link &amp; Rotate Token
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    handlePostAction(
                      { action: 'generate_invite', revokeExisting: false },
                      'Invitation link generated.'
                    )
                  }
                  className="w-full bg-brand-600 text-white text-xs font-bold py-2.5 rounded-xl"
                >
                  Generate Invitation Link
                </button>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand-600" />
                  CSV / Excel Passenger Roster Import
                </h3>
                <a
                  href="/samples/LTTBD_Sample_Passenger_Roster.xlsx"
                  download
                  className="text-xs font-bold text-brand-600 hover:underline"
                >
                  Download Sample .xlsx
                </a>
              </div>
              <p className="text-xs text-slate-500">
                Validates mandatory columns (<code>SL</code>, <code>Passenger Name</code>, <code>Passport Number</code>, <code>Contact Number</code>), detects duplicates, and reports row-level errors.
              </p>
              <label className="block w-full cursor-pointer">
                <div className="border-2 border-dashed border-brand-200 hover:border-brand-500 bg-brand-50/40 rounded-2xl p-5 text-center transition">
                  <Upload className="w-6 h-6 text-brand-600 mx-auto mb-1" />
                  <span className="text-xs font-bold text-brand-700 block">
                    {uploading ? 'Validating & Importing...' : 'Click to Upload .xlsx or .csv Roster'}
                  </span>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.csv,.xls"
                  onChange={handleRosterUpload}
                  disabled={uploading || trip.status === 'completed'}
                  className="hidden"
                />
              </label>

              {uploadErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-44 overflow-y-auto space-y-1">
                  <p className="text-xs font-bold text-red-800">
                    Validation Errors ({uploadErrors.length}):
                  </p>
                  {uploadErrors.map((err, i) => (
                    <p key={i} className="text-[11px] text-red-700">
                      • Row {err.row} ({err.field}): {err.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 7: STAFF ROLES, TRIP SETTINGS & AUDIT TRAIL */}
        {activeSection === 'settings_audit' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-brand-600" />
                Tracking, Stale &amp; Retention Settings
              </h3>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Stale Location Threshold (seconds)
                </label>
                <input
                  type="number"
                  value={staleSec}
                  onChange={(e) => setStaleSec(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  GPS Update Interval (seconds)
                </label>
                <input
                  type="number"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Separation Warning Distance (meters)
                </label>
                <input
                  type="number"
                  value={sepMeters}
                  onChange={(e) => setSepMeters(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Data Retention Policy (days)
                </label>
                <input
                  type="number"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Organizer Fallback Phone
                </label>
                <input
                  type="text"
                  value={orgContact}
                  onChange={(e) => setOrgContact(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5"
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  handlePostAction(
                    {
                      action: 'update_settings',
                      staleThresholdSeconds: staleSec,
                      updateIntervalSeconds: intervalSec,
                      retentionDays,
                      separationThresholdMeters: sepMeters,
                      organizerContact: orgContact
                    },
                    'Trip tracking & retention settings saved.'
                  )
                }
                className="w-full bg-brand-600 text-white font-bold py-2.5 rounded-xl"
              >
                Save Trip Configuration
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand-600" />
                Organizers, Guides &amp; Responders ({admins.length})
              </h3>
              <div className="space-y-2">
                {admins.map((adm) => (
                  <div
                    key={adm.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{adm.admin_name}</div>
                      <div className="text-slate-500">{adm.admin_email}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-bold border border-brand-200">
                      {adm.role}
                    </span>
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newAdminEmail) return;
                  handlePostAction(
                    {
                      action: 'manage_admin',
                      subAction: 'add',
                      targetEmail: newAdminEmail,
                      targetName: newAdminName || newAdminEmail,
                      role: newAdminRole
                    },
                    `Assigned ${newAdminEmail} as ${newAdminRole}.`
                  );
                  setNewAdminEmail('');
                  setNewAdminName('');
                }}
                className="space-y-2 pt-2 border-t border-slate-100"
              >
                <input
                  type="text"
                  placeholder="Staff Name"
                  value={newAdminName}
                  onChange={(e) => setNewAdminName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5"
                />
                <input
                  type="email"
                  required
                  placeholder="Staff Email"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5"
                />
                <select
                  value={newAdminRole}
                  onChange={(e) => setNewAdminRole(e.target.value as AdminRole)}
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white"
                >
                  <option value="trip_organizer">Trip Organizer</option>
                  <option value="tour_manager">Tour Manager / Guide</option>
                  <option value="responder">Field Responder</option>
                  <option value="super_admin">Super Admin</option>
                </select>
                <button
                  type="submit"
                  className="w-full bg-navy-900 text-white font-bold py-2 rounded-xl"
                >
                  Assign Staff Role
                </button>
              </form>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3 text-xs">
              <h3 className="text-sm font-bold text-slate-900">Security &amp; Activity Audit Trail</h3>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] flex items-start justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{log.action}</span>
                      <span className="text-slate-500"> by {log.actor_label}</span>
                    </div>
                    <span className="text-slate-400 shrink-0">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Admin Google Maps Directions & Route Preview Confirmation Modal */}
      {(adminNavTarget || adminNavMp) && targetDestLat !== null && targetDestLng !== null && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Navigate to {targetDestName}
                </h3>
                <p className="text-xs text-slate-500">
                  {adminNavDistance !== null
                    ? `Straight-line distance: ${formatDistance(adminNavDistance)}`
                    : 'Route previewed on Command Map'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 border border-slate-200 leading-relaxed">
              A dashed route line is previewed on your Command Map. Click below to open turn-by-turn navigation to <strong>{targetDestName}</strong> in <strong>Google Maps</strong>.
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setAdminNavTarget(null);
                  setAdminNavMp(null);
                }}
                className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
              >
                Close Preview
              </button>
              <a
                href={adminGoogleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setAdminNavTarget(null);
                  setAdminNavMp(null);
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

      {/* QR Code Invitation Poster Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600">
              LTT BD • Group Onboarding QR
            </span>
            <h3 className="text-lg font-extrabold text-slate-900">{trip.name}</h3>
            <div className="flex justify-center">
              <RealQrCode
                value={inviteUrl || ''}
                size={200}
                label={trip.name}
                sublabel={`Invite Code: ${activeInvite?.invitation_code || 'KL2026'}`}
              />
            </div>
            <p className="text-xs text-slate-500 break-all font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              {inviteUrl}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="py-2.5 rounded-xl bg-brand-600 text-white text-xs font-extrabold"
              >
                Copy Invite Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm End Trip & Purge Personal Data Modal */}
      {confirmEndTrip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-extrabold text-red-700 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              End Trip &amp; Purge Personal Data?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ending <strong>{trip.name}</strong> revokes all invitation tokens and permanently deletes imported passport hashes, contact numbers, memberships, location points, and emergency alerts.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmEndTrip(false)}
                className="text-xs font-bold text-slate-600 px-4 py-2 rounded-xl border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmEndTrip(false);
                  await handlePostAction(
                    { action: 'end_trip_and_purge' },
                    'Trip ended and all personal data purged.'
                  );
                }}
                className="text-xs font-extrabold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl"
              >
                Confirm Purge &amp; Close Trip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
