import { MAX_PASSENGERS_PER_TRIP, clampPassengerCapacity } from './capacity';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  normalizePassengerName,
  normalizePassportNumber,
  normalizePhoneNumber,
  maskPassportNumber,
  hashSensitiveIdentifier,
  evaluateRosterMatch
} from './normalization';
import { hashSessionToken } from './session';
import { ParsedRosterEntry } from './roster-parser';
import { getDistanceMeters } from './geo';
import {
  Trip,
  TripAdmin,
  PassengerRosterRecord,
  TripInvite,
  TripMember,
  TouristLocation,
  EmergencyAlert,
  AuditLog,
  SafeTouristPeer,
  AdminPassengerView,
  SharingStatus,
  AdminRole,
  MeetingPoint,
  HeadcountSession,
  AnnouncementItem,
  GroupChatMessage,
  TripEssentialHub,
  AssistanceCategory,
  AssistancePriority,
  AlertStatus
} from '@/types/lttbd';

interface LocalDatabaseSchema {
  trips: Trip[];
  trip_admins: TripAdmin[];
  passenger_roster: PassengerRosterRecord[];
  trip_invites: TripInvite[];
  trip_members: TripMember[];
  locations: TouristLocation[];
  meeting_points: MeetingPoint[];
  headcount_sessions: HeadcountSession[];
  announcements: AnnouncementItem[];
  group_messages: GroupChatMessage[];
  emergency_alerts: EmergencyAlert[];
  audit_logs: AuditLog[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'local-store.json');

const SEED_TRIP_ID = '11111111-2222-3333-4444-555555555555';
const SEED_INVITE_TOKEN = 'malaysia-tour-2026-invite';

function computeEffectiveStatus(
  sharingEnabled: boolean,
  loc: TouristLocation | undefined,
  staleThresholdSec = 180
): SharingStatus {
  if (!sharingEnabled) return 'disabled';
  if (!loc) return 'unavailable';
  if (loc.sharing_status === 'disabled') return 'disabled';
  if (loc.sharing_status === 'unavailable') return 'unavailable';

  const ageSeconds = (Date.now() - new Date(loc.updated_at).getTime()) / 1000;
  if (ageSeconds > staleThresholdSec) {
    return 'offline';
  }
  return 'sharing';
}

function createInitialSeedStore(): LocalDatabaseSchema {
  const now = new Date().toISOString();
  const defaultAdminEmail = (
    process.env.LTTBD_DEFAULT_ADMIN_EMAIL || process.env.TOURBUZZ_DEFAULT_ADMIN_EMAIL || 'admin@lttbd.local'
  ).toLowerCase();

  const seedPassengers = [
    { sl: 1, name: 'MD RAHIM UDDIN', pp: 'A12345678', phone: '01711223344', sub: 'Bus A', lat: 3.1579, lng: 101.7116, joined: true, sharing: true, minAgo: 0.3 },
    { sl: 2, name: 'MD KARIM HOSSAIN', pp: 'A98765432', phone: '01819887766', sub: 'Bus A', lat: 3.1562, lng: 101.7135, joined: true, sharing: true, minAgo: 0.7 },
    { sl: 3, name: 'MOHAMMAD HASAN', pp: 'A76543210', phone: '+8801912345678', sub: 'Bus A', lat: 3.1548, lng: 101.7098, joined: true, sharing: false, minAgo: 5 },
    { sl: 4, name: 'NUSRAT JAHAN', pp: 'B00445566', phone: '01677889900', sub: 'Bus B', lat: 3.1635, lng: 101.7185, joined: true, sharing: true, minAgo: 0.8 },
    { sl: 5, name: 'TANVIR AHMED', pp: 'B11223344', phone: '01555667788', sub: 'Bus B', lat: 3.1571, lng: 101.7122, joined: false, sharing: false, minAgo: 0 },
    { sl: 6, name: 'FARHANA YASMIN', pp: 'B55667788', phone: '01322446688', sub: 'Bus B', lat: 3.1592, lng: 101.7105, joined: false, sharing: false, minAgo: 0 },
    { sl: 7, name: 'MAHMUDUL HASAN', pp: 'C99887766', phone: '+8801799001122', sub: 'Bus A', lat: 3.1555, lng: 101.7111, joined: false, sharing: false, minAgo: 0 },
    { sl: 8, name: 'SABRINA SULTANA', pp: 'C33445566', phone: '01844556677', sub: 'Bus B', lat: 3.1568, lng: 101.7128, joined: false, sharing: false, minAgo: 0 },
    { sl: 9, name: 'RAFIQUL ISLAM', pp: 'D10293847', phone: '01933128801', sub: 'Bus A', lat: 3.1575, lng: 101.7119, joined: false, sharing: false, minAgo: 0 },
    { sl: 10, name: 'SHARMIN AKTER', pp: 'E56473829', phone: '01755443322', sub: 'Bus B', lat: 3.1581, lng: 101.7109, joined: false, sharing: false, minAgo: 0 }
  ];

  const roster: PassengerRosterRecord[] = [];
  const members: TripMember[] = [];
  const locations: TouristLocation[] = [];

  for (const pax of seedPassengers) {
    const rosterId = crypto.randomUUID();
    const normName = normalizePassengerName(pax.name);
    const normPassport = normalizePassportNumber(pax.pp);
    const normPhone = normalizePhoneNumber(pax.phone);
    const touristCode = `LTT-${String(pax.sl).padStart(3, '0')}`;

    let memberId: string | null = null;
    if (pax.joined) {
      memberId = crypto.randomUUID();
      const updatedTime = new Date(Date.now() - pax.minAgo * 60 * 1000).toISOString();
      members.push({
        id: memberId,
        trip_id: SEED_TRIP_ID,
        roster_id: rosterId,
        tourist_code: touristCode,
        display_name: pax.name,
        subgroup_name: pax.sub,
        contact_info: normPhone,
        passport_masked: maskPassportNumber(normPassport),
        sharing_enabled: pax.sharing,
        consent_granted: true,
        session_token_hash: hashSessionToken(`seed-session-${pax.sl}`),
        joined_at: now,
        last_seen_at: updatedTime
      });
      locations.push({
        member_id: memberId,
        trip_id: SEED_TRIP_ID,
        latitude: pax.lat,
        longitude: pax.lng,
        accuracy: 12,
        sharing_status: pax.sharing ? (pax.minAgo > 3 ? 'offline' : 'sharing') : 'disabled',
        updated_at: updatedTime
      });
    }

    roster.push({
      id: rosterId,
      trip_id: SEED_TRIP_ID,
      serial_no: pax.sl,
      full_name_display: pax.name,
      normalized_name: normName,
      passport_hash: hashSensitiveIdentifier(SEED_TRIP_ID, normPassport),
      passport_masked: maskPassportNumber(normPassport),
      contact_hash: hashSensitiveIdentifier(SEED_TRIP_ID, normPhone),
      contact_number_admin: normPhone,
      subgroup_name: pax.sub,
      is_claimed: pax.joined,
      claimed_member_id: memberId,
      claimed_at: pax.joined ? now : null,
      created_at: now
    });
  }

  return {
    trips: [
      {
        id: SEED_TRIP_ID,
        name: 'Malaysia Group Tour (Demo Seed)',
        destination: 'Kuala Lumpur, Malaysia',
        start_date: '2026-11-14',
        end_date: '2026-11-19',
        max_tourists: MAX_PASSENGERS_PER_TRIP,
        status: 'active',
        organizer_contact: '',
        stale_threshold_seconds: 180,
        update_interval_seconds: 20,
        retention_days: 7,
        separation_threshold_meters: 500,
        verification_mode: 'strict_roster',
        itinerary: [
          {
            id: 'it-1',
            day_label: 'Day 1 • 14 Nov 2026',
            time_label: '09:30 AM',
            title: 'KLCC Petronas Twin Towers & Skybridge Visit',
            location_name: 'KLCC Main Fountain Entrance',
            instructions: 'Please keep your digital LTT BD QR badge ready and stay within 300m of your group guide.'
          },
          {
            id: 'it-2',
            day_label: 'Day 1 • 14 Nov 2026',
            time_label: '01:30 PM',
            title: 'Group Lunch & Bukit Bintang Pavilion Walk',
            location_name: 'Pavilion KL Main Concierge',
            instructions: 'Confirm your Digital Headcount check-in before boarding the coach at 04:00 PM.'
          },
          {
            id: 'it-3',
            day_label: 'Day 2 • 15 Nov 2026',
            time_label: '08:30 AM',
            title: 'Genting Highlands Cable Car Excursion',
            location_name: 'Hotel Grand Lobby Coach Bay',
            instructions: 'Bring light jacket; coach departs promptly at 08:45 AM.'
          }
        ],
        essentials: {
          hotel_name: 'Traders Hotel Kuala Lumpur by Shangri-La',
          hotel_address: 'Kuala Lumpur City Centre (KLCC), 50088 Kuala Lumpur',
          hotel_phone: '+603-2332-9888',
          hotel_lat: 3.1545,
          hotel_lng: 101.7152,
          airport_name: 'Kuala Lumpur International Airport (KLIA Terminal 1)',
          airport_terminal: 'International Departures — Level 5, Row G',
          airport_lat: 2.7456,
          airport_lng: 101.7072,
          organizer_name: 'LTT BD Tour Leader & Operations Desk',
          organizer_phone: '',
          local_emergency_police: '999',
          local_emergency_medical: '999 / +603-2615-5555 (KL Hospital)',
          embassy_name: 'Bangladesh High Commission, Kuala Lumpur',
          embassy_phone: '+603-4251-0876'
        },
        created_at: now,
        ended_at: null
      }
    ],
    trip_admins: [
      {
        id: crypto.randomUUID(),
        trip_id: SEED_TRIP_ID,
        admin_email: defaultAdminEmail,
        admin_name: 'LTT BD Super Admin & Organizer',
        role: 'super_admin',
        added_at: now
      },
    ],
    passenger_roster: roster,
    trip_invites: [
      {
        id: crypto.randomUUID(),
        trip_id: SEED_TRIP_ID,
        token: SEED_INVITE_TOKEN,
        invitation_code: 'KL2026',
        is_revoked: false,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now
      }
    ],
    trip_members: members,
    locations,
    meeting_points: [
      {
        id: 'mp-klcc-main',
        trip_id: SEED_TRIP_ID,
        title: 'KLCC Suria Fountain Assembly Point',
        latitude: 3.1579,
        longitude: 101.7116,
        notes: 'Meet beside the mainKLCC park fountain for headcount before coach boarding.',
        scheduled_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        radius_meters: 350,
        is_active: true,
        created_at: now
      },
      {
        id: 'mp-pavilion',
        trip_id: SEED_TRIP_ID,
        title: 'Bukit Bintang Pavilion Coach Pickup',
        latitude: 3.1489,
        longitude: 101.7133,
        notes: 'Evening pickup zone at Gate B.',
        scheduled_at: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        radius_meters: 250,
        is_active: true,
        created_at: now
      }
    ],
    headcount_sessions: [
      {
        id: 'hc-seed-1',
        trip_id: SEED_TRIP_ID,
        title: 'KLCC Morning Assembly Roll Call',
        subgroup_name: 'All',
        status: 'open',
        created_by: 'Tour Manager — Kuala Lumpur',
        created_at: now,
        closed_at: null,
        responses: [
          {
            member_id: members[0]?.id || 'm1',
            display_name: 'MD RAHIM UDDIN',
            status: 'present',
            responded_at: now
          }
        ]
      }
    ],
    announcements: [
      {
        id: 'ann-seed-1',
        trip_id: SEED_TRIP_ID,
        title: 'Welcome to Kuala Lumpur Group Tour!',
        body: 'Our next assembly point is KLCC Suria Fountain. Tap "Navigate to Meeting Point" on your Home tab if you need walking directions, or tap "I Am Present" in the active Digital Headcount.',
        subgroup_name: 'All',
        priority: 'important',
        created_by: 'LTT BD Operations',
        created_at: now,
        read_by_member_ids: []
      }
    ],
    group_messages: [
      {
        id: 'gm-1',
        trip_id: SEED_TRIP_ID,
        sender_id: 'admin-1',
        sender_name: 'Tour Leader — Kuala Lumpur',
        sender_code: 'ORGANIZER',
        sender_role: 'organizer',
        message: 'Welcome everyone to Kuala Lumpur! Our hotel (Traders Hotel KLCC) and KLIA Airport pins are saved on your map and in the Essentials section below.',
        created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString()
      },
      {
        id: 'gm-2',
        trip_id: SEED_TRIP_ID,
        sender_id: 'm-1',
        sender_name: 'MD RAHIM UDDIN',
        sender_code: 'LTT-001',
        sender_role: 'tourist',
        message: 'Reached KLCC Suria Fountain entrance! Sharing my live GPS pin now.',
        latitude: 3.1579,
        longitude: 101.7116,
        created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString()
      }
    ],
    emergency_alerts: [],
    audit_logs: [
      {
        id: crypto.randomUUID(),
        trip_id: SEED_TRIP_ID,
        actor_label: 'System Bootstrap',
        action: 'DEMO_SEED_INITIALIZED',
        details: { trip_name: 'Malaysia Group Tour (Demo Seed)', roster_count: 10 },
        created_at: now
      }
    ]
  };
}

function readLocalStore(): LocalDatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const seed = createInitialSeedStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(seed, null, 2), 'utf8');
      return seed;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as LocalDatabaseSchema;
    if (!parsed.meeting_points) parsed.meeting_points = createInitialSeedStore().meeting_points;
    if (!parsed.headcount_sessions) parsed.headcount_sessions = createInitialSeedStore().headcount_sessions;
    if (!parsed.announcements) parsed.announcements = createInitialSeedStore().announcements;
    if (!parsed.group_messages) parsed.group_messages = createInitialSeedStore().group_messages;
    if (parsed.trips[0] && !parsed.trips[0].essentials) parsed.trips[0].essentials = createInitialSeedStore().trips[0].essentials;
    return parsed;
  } catch {
    return createInitialSeedStore();
  }
}

function writeLocalStore(store: LocalDatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write local store:', err);
  }
}

function isResolvedStatus(st: AlertStatus): boolean {
  return st === 'resolved' || st === 'Resolved' || st === 'Closed' || st === 'Cancelled';
}

export async function getAdminDashboardSummary(adminEmail: string) {
  const store = readLocalStore();
  const locMap = new Map(store.locations.map((l) => [l.member_id, l]));
  let currentlySharing = 0;
  let stoppedSharing = 0;
  let offlineTourists = 0;

  for (const m of store.trip_members) {
    const st = computeEffectiveStatus(m.sharing_enabled, locMap.get(m.id));
    if (st === 'sharing') currentlySharing++;
    else if (st === 'disabled') stoppedSharing++;
    else offlineTourists++;
  }

  const activeAlerts = store.emergency_alerts.filter((a) => !isResolvedStatus(a.status));

  return {
    mode: 'local' as const,
    metrics: {
      totalActiveTrips: store.trips.filter((t) => t.status === 'active').length,
      upcomingTrips: store.trips.filter((t) => t.status === 'upcoming').length,
      completedTrips: store.trips.filter((t) => t.status === 'completed').length,
      totalRegisteredTourists: store.trip_members.length,
      currentlySharing,
      stoppedSharing,
      offlineTourists,
      activeEmergencyRequests: activeAlerts.length
    },
    trips: store.trips,
    activeAlerts
  };
}

export async function createNewTrip(params: {
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  max_tourists: number;
  adminEmail: string;
  adminName: string;
}): Promise<{ trip: Trip; invite: TripInvite }> {
  const cappedMax = clampPassengerCapacity(params.max_tourists);
  const now = new Date().toISOString();
  const token = `${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${crypto.randomBytes(4).toString('hex')}`;
  const invitationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const store = readLocalStore();
  const newTrip: Trip = {
    id: crypto.randomUUID(),
    name: params.name.trim(),
    destination: params.destination.trim(),
    start_date: params.start_date,
    end_date: params.end_date,
    max_tourists: cappedMax,
    status: 'active',
    organizer_contact: '',
    stale_threshold_seconds: 180,
    update_interval_seconds: 20,
    retention_days: 7,
    separation_threshold_meters: 500,
    verification_mode: 'strict_roster',
    itinerary: [],
    created_at: now,
    ended_at: null
  };

  const newAdmin: TripAdmin = {
    id: crypto.randomUUID(),
    trip_id: newTrip.id,
    admin_email: params.adminEmail.toLowerCase(),
    admin_name: params.adminName,
    role: 'trip_organizer',
    added_at: now
  };

  const newInvite: TripInvite = {
    id: crypto.randomUUID(),
    trip_id: newTrip.id,
    token,
    invitation_code: invitationCode,
    is_revoked: false,
    expires_at: expiresAt,
    created_at: now
  };

  store.trips.unshift(newTrip);
  store.trip_admins.push(newAdmin);
  store.trip_invites.unshift(newInvite);
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: newTrip.id,
    actor_label: params.adminEmail,
    action: 'TRIP_CREATED',
    details: { name: newTrip.name, destination: newTrip.destination, max_tourists: cappedMax },
    created_at: now
  });

  writeLocalStore(store);
  return { trip: newTrip, invite: newInvite };
}

export async function getAdminTripDetail(tripId: string, _adminEmail: string) {
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const admins = store.trip_admins.filter((a) => a.trip_id === tripId);
  const roster = store.passenger_roster
    .filter((r) => r.trip_id === tripId)
    .sort((a, b) => a.serial_no - b.serial_no);
  const invites = store.trip_invites.filter((i) => i.trip_id === tripId);
  const members = store.trip_members.filter((m) => m.trip_id === tripId);
  const locations = store.locations.filter((l) => l.trip_id === tripId);
  const meetingPoints = store.meeting_points.filter((mp) => mp.trip_id === tripId);
  const headcounts = store.headcount_sessions.filter((hc) => hc.trip_id === tripId);
  const announcements = store.announcements.filter((an) => an.trip_id === tripId);
  const groupMessages = (store.group_messages || []).filter((gm) => gm.trip_id === tripId);
  const alerts = store.emergency_alerts
    .filter((e) => e.trip_id === tripId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const logs = store.audit_logs
    .filter((l) => l.trip_id === tripId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40);

  const memberByRosterId = new Map(members.filter((m) => m.roster_id).map((m) => [m.roster_id!, m]));
  const locationByMemberId = new Map(locations.map((l) => [l.member_id, l]));
  const primaryMp = meetingPoints.find((mp) => mp.is_active);
  const sepThreshold = trip.separation_threshold_meters || 500;

  const passengers: AdminPassengerView[] = roster.map((r) => {
    const member = memberByRosterId.get(r.id);
    const loc = member ? locationByMemberId.get(member.id) : undefined;
    const effectiveStatus: SharingStatus = member
      ? computeEffectiveStatus(member.sharing_enabled, loc, trip.stale_threshold_seconds || 180)
      : 'unavailable';

    const distToMp =
      primaryMp && loc && effectiveStatus === 'sharing'
        ? getDistanceMeters(primaryMp.latitude, primaryMp.longitude, loc.latitude, loc.longitude)
        : 0;

    return {
      roster_id: r.id,
      serial_no: r.serial_no,
      is_claimed: r.is_claimed || Boolean(member),
      member_id: member ? member.id : '',
      tourist_code: member?.tourist_code || `LTT-${String(r.serial_no).padStart(3, '0')}`,
      display_name: r.full_name_display,
      subgroup_name: member?.subgroup_name || r.subgroup_name || 'Main Group',
      sharing_enabled: member ? member.sharing_enabled : false,
      effective_status: effectiveStatus,
      last_seen_at: member ? member.last_seen_at : null,
      latitude: loc ? loc.latitude : null,
      longitude: loc ? loc.longitude : null,
      accuracy: loc ? loc.accuracy : null,
      location_updated_at: loc ? loc.updated_at : null,
      possible_separation: distToMp > sepThreshold,
      passport_masked: r.passport_masked,
      contact_number_admin: r.contact_number_admin,
      emergency_contact: member?.emergency_contact || null
    };
  });

  const rosterIdsClaimed = new Set(roster.map((r) => r.id));
  let extraSerial = roster.length + 1;
  for (const m of members) {
    if (!m.roster_id || !rosterIdsClaimed.has(m.roster_id)) {
      const loc = locationByMemberId.get(m.id);
      const effectiveStatus = computeEffectiveStatus(
        m.sharing_enabled,
        loc,
        trip.stale_threshold_seconds || 180
      );
      const distToMp =
        primaryMp && loc && effectiveStatus === 'sharing'
          ? getDistanceMeters(primaryMp.latitude, primaryMp.longitude, loc.latitude, loc.longitude)
          : 0;

      passengers.push({
        roster_id: m.id,
        serial_no: extraSerial++,
        is_claimed: true,
        member_id: m.id,
        tourist_code: m.tourist_code || `LTT-${extraSerial}`,
        display_name: m.display_name,
        subgroup_name: m.subgroup_name || 'Main Group',
        sharing_enabled: m.sharing_enabled,
        effective_status: effectiveStatus,
        last_seen_at: m.last_seen_at,
        latitude: loc ? loc.latitude : null,
        longitude: loc ? loc.longitude : null,
        accuracy: loc ? loc.accuracy : null,
        location_updated_at: loc ? loc.updated_at : null,
        possible_separation: distToMp > sepThreshold,
        passport_masked: m.passport_masked || '—',
        contact_number_admin: m.contact_info || 'Self-registered',
        emergency_contact: m.emergency_contact || null
      });
    }
  }

  return {
    trip,
    admins,
    invites,
    passengers,
    meetingPoints,
    headcounts,
    announcements,
    groupMessages,
    alerts,
    logs,
    stats: {
      rosterTotal: passengers.length,
      registeredCount: members.length,
      sharingCount: passengers.filter((p) => p.is_claimed && p.effective_status === 'sharing').length,
      disabledCount: passengers.filter((p) => p.is_claimed && p.effective_status === 'disabled').length,
      offlineCount: passengers.filter(
        (p) => p.is_claimed && (p.effective_status === 'offline' || p.effective_status === 'unavailable')
      ).length,
      separatedCount: passengers.filter((p) => p.possible_separation).length,
      activeAlertsCount: alerts.filter((a) => !isResolvedStatus(a.status)).length
    }
  };
}

export async function createMeetingPoint(params: {
  tripId: string;
  title: string;
  latitude: number;
  longitude: number;
  notes: string;
  scheduledAt: string;
  radiusMeters: number;
  actorEmail: string;
}): Promise<MeetingPoint> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const mp: MeetingPoint = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    title: params.title.trim(),
    latitude: Number(params.latitude),
    longitude: Number(params.longitude),
    notes: params.notes.trim(),
    scheduled_at: params.scheduledAt || now,
    radius_meters: Number(params.radiusMeters) || 250,
    is_active: true,
    created_at: now
  };
  store.meeting_points.unshift(mp);
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: 'MEETING_POINT_CREATED',
    details: { title: mp.title, radius_meters: mp.radius_meters },
    created_at: now
  });
  writeLocalStore(store);
  return mp;
}

export async function toggleOrDeleteMeetingPoint(params: {
  tripId: string;
  meetingPointId: string;
  subAction: 'toggle' | 'delete';
  actorEmail: string;
}) {
  const store = readLocalStore();
  if (params.subAction === 'delete') {
    store.meeting_points = store.meeting_points.filter((m) => m.id !== params.meetingPointId);
  } else {
    const target = store.meeting_points.find((m) => m.id === params.meetingPointId);
    if (target) target.is_active = !target.is_active;
  }
  writeLocalStore(store);
}

export async function startHeadcountSession(params: {
  tripId: string;
  title: string;
  subgroupName: string;
  actorEmail: string;
}): Promise<HeadcountSession> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const hc: HeadcountSession = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    title: params.title.trim() || 'Group Digital Headcount',
    subgroup_name: params.subgroupName || 'All',
    status: 'open',
    created_by: params.actorEmail,
    created_at: now,
    closed_at: null,
    responses: []
  };
  store.headcount_sessions.unshift(hc);
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: 'HEADCOUNT_STARTED',
    details: { title: hc.title, subgroup: hc.subgroup_name },
    created_at: now
  });
  writeLocalStore(store);
  return hc;
}

export async function closeHeadcountSession(tripId: string, sessionId: string, actorEmail: string) {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const hc = store.headcount_sessions.find((s) => s.id === sessionId && s.trip_id === tripId);
  if (hc) {
    hc.status = 'closed';
    hc.closed_at = now;
  }
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'HEADCOUNT_CLOSED',
    details: { sessionId },
    created_at: now
  });
  writeLocalStore(store);
}

export async function recordHeadcountResponse(params: {
  tripId: string;
  sessionId: string;
  memberId: string;
  displayName: string;
  status: 'present' | 'needs_help';
}) {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const hc = store.headcount_sessions.find(
    (s) => s.id === params.sessionId && s.trip_id === params.tripId
  );
  if (!hc || hc.status !== 'open') return null;

  const existingIdx = hc.responses.findIndex((r) => r.member_id === params.memberId);
  const entry = {
    member_id: params.memberId,
    display_name: params.displayName,
    status: params.status,
    responded_at: now
  };
  if (existingIdx >= 0) {
    hc.responses[existingIdx] = entry;
  } else {
    hc.responses.push(entry);
  }
  writeLocalStore(store);
  return hc;
}

export async function createAnnouncement(params: {
  tripId: string;
  title: string;
  body: string;
  subgroupName: string;
  priority: 'normal' | 'important' | 'urgent';
  actorEmail: string;
}): Promise<AnnouncementItem> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const ann: AnnouncementItem = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    title: params.title.trim(),
    body: params.body.trim(),
    subgroup_name: params.subgroupName || 'All',
    priority: params.priority || 'normal',
    created_by: params.actorEmail,
    created_at: now,
    read_by_member_ids: []
  };
  store.announcements.unshift(ann);
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: 'ANNOUNCEMENT_PUBLISHED',
    details: { title: ann.title, priority: ann.priority },
    created_at: now
  });
  writeLocalStore(store);
  return ann;
}

export async function markAnnouncementRead(tripId: string, announcementId: string, memberId: string) {
  const store = readLocalStore();
  const ann = store.announcements.find((a) => a.id === announcementId && a.trip_id === tripId);
  if (ann && !ann.read_by_member_ids.includes(memberId)) {
    ann.read_by_member_ids.push(memberId);
    writeLocalStore(store);
  }
}

export async function updateTripSettings(params: {
  tripId: string;
  staleThresholdSeconds?: number;
  updateIntervalSeconds?: number;
  retentionDays?: number;
  separationThresholdMeters?: number;
  organizerContact?: string;
  actorEmail: string;
}) {
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === params.tripId);
  if (!trip) throw new Error('Trip not found');

  if (params.staleThresholdSeconds) trip.stale_threshold_seconds = Number(params.staleThresholdSeconds);
  if (params.updateIntervalSeconds) trip.update_interval_seconds = Number(params.updateIntervalSeconds);
  if (params.retentionDays) trip.retention_days = Number(params.retentionDays);
  if (params.separationThresholdMeters) {
    trip.separation_threshold_meters = Number(params.separationThresholdMeters);
  }
  if (params.organizerContact) trip.organizer_contact = params.organizerContact.trim();

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: 'TRIP_SETTINGS_UPDATED',
    details: {
      stale_threshold_seconds: trip.stale_threshold_seconds,
      update_interval_seconds: trip.update_interval_seconds,
      retention_days: trip.retention_days
    },
    created_at: new Date().toISOString()
  });

  writeLocalStore(store);
  return trip;
}

export async function saveImportedRoster(
  tripId: string,
  entries: ParsedRosterEntry[],
  actorEmail: string
): Promise<{ importedCount: number }> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error('Trip not found');

  const maxCap = Math.min(trip.max_tourists || MAX_PASSENGERS_PER_TRIP, MAX_PASSENGERS_PER_TRIP);
  if (entries.length > maxCap) {
    throw new Error(`Roster size (${entries.length}) exceeds maximum capacity of ${maxCap} tourists.`);
  }

  store.passenger_roster = store.passenger_roster.filter((r) => r.trip_id !== tripId);
  store.trip_members = store.trip_members.filter((m) => m.trip_id !== tripId);
  store.locations = store.locations.filter((l) => l.trip_id !== tripId);

  for (const e of entries) {
    store.passenger_roster.push({
      id: crypto.randomUUID(),
      trip_id: tripId,
      serial_no: e.serial_no,
      full_name_display: e.full_name_display,
      normalized_name: e.normalized_name,
      passport_hash: e.passport_hash,
      passport_masked: e.passport_masked,
      contact_hash: e.contact_hash,
      contact_number_admin: e.contact_number_admin,
      subgroup_name: 'Main Group',
      is_claimed: false,
      claimed_member_id: null,
      claimed_at: null,
      created_at: now
    });
  }

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'PASSENGER_ROSTER_IMPORTED',
    details: { count: entries.length },
    created_at: now
  });

  writeLocalStore(store);
  return { importedCount: entries.length };
}

export async function generateOrRotateInviteLink(
  tripId: string,
  revokeExisting: boolean,
  actorEmail: string
): Promise<TripInvite> {
  const now = new Date().toISOString();
  const token = `ltt-${crypto.randomBytes(8).toString('hex')}`;
  const invitationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const store = readLocalStore();
  if (revokeExisting) {
    store.trip_invites.forEach((inv) => {
      if (inv.trip_id === tripId) inv.is_revoked = true;
    });
  }
  const newInv: TripInvite = {
    id: crypto.randomUUID(),
    trip_id: tripId,
    token,
    invitation_code: invitationCode,
    is_revoked: false,
    expires_at: expiresAt,
    created_at: now
  };
  store.trip_invites.unshift(newInv);
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: revokeExisting ? 'INVITE_LINK_ROTATED' : 'INVITE_LINK_CREATED',
    details: { token, invitationCode },
    created_at: now
  });
  writeLocalStore(store);
  return newInv;
}

export async function manageTripAdministrators(params: {
  tripId: string;
  actorEmail: string;
  action: 'add' | 'promote' | 'remove';
  targetEmail: string;
  targetName?: string;
  role?: AdminRole;
}): Promise<TripAdmin[]> {
  const now = new Date().toISOString();
  const cleanTargetEmail = params.targetEmail.trim().toLowerCase();
  const store = readLocalStore();

  if (params.action === 'add') {
    const existing = store.trip_admins.find(
      (a) => a.trip_id === params.tripId && a.admin_email.toLowerCase() === cleanTargetEmail
    );
    if (existing) {
      existing.role = params.role || 'tour_manager';
      existing.admin_name = params.targetName || existing.admin_name;
    } else {
      store.trip_admins.push({
        id: crypto.randomUUID(),
        trip_id: params.tripId,
        admin_email: cleanTargetEmail,
        admin_name: params.targetName || cleanTargetEmail,
        role: params.role || 'tour_manager',
        added_at: now
      });
    }
  } else if (params.action === 'promote') {
    const target = store.trip_admins.find(
      (a) => a.trip_id === params.tripId && a.admin_email.toLowerCase() === cleanTargetEmail
    );
    if (target) target.role = params.role || 'trip_organizer';
  } else if (params.action === 'remove') {
    store.trip_admins = store.trip_admins.filter(
      (a) => !(a.trip_id === params.tripId && a.admin_email.toLowerCase() === cleanTargetEmail)
    );
  }

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: `STAFF_${params.action.toUpperCase()}`,
    details: { targetEmail: cleanTargetEmail, role: params.role },
    created_at: now
  });

  writeLocalStore(store);
  return store.trip_admins.filter((a) => a.trip_id === params.tripId);
}

export async function removePassengerFromTrip(
  tripId: string,
  rosterOrMemberId: string,
  actorEmail: string
): Promise<void> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const member = store.trip_members.find(
    (m) => m.trip_id === tripId && (m.roster_id === rosterOrMemberId || m.id === rosterOrMemberId)
  );
  if (member) {
    store.locations = store.locations.filter((l) => l.member_id !== member.id);
    store.emergency_alerts = store.emergency_alerts.filter((a) => a.member_id !== member.id);
    store.trip_members = store.trip_members.filter((m) => m.id !== member.id);
  }
  const rosterEntry = store.passenger_roster.find(
    (r) => r.id === rosterOrMemberId && r.trip_id === tripId
  );
  if (rosterEntry) {
    rosterEntry.is_claimed = false;
    rosterEntry.claimed_member_id = null;
    rosterEntry.claimed_at = null;
  }
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'PASSENGER_SESSION_REMOVED',
    details: { rosterOrMemberId },
    created_at: now
  });
  writeLocalStore(store);
}

export async function endTripAndPurgePersonalData(tripId: string, actorEmail: string) {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error('Trip not found');

  const prevRosterCount = store.passenger_roster.filter((r) => r.trip_id === tripId).length;
  const prevMemberCount = store.trip_members.filter((m) => m.trip_id === tripId).length;
  const prevLocCount = store.locations.filter((l) => l.trip_id === tripId).length;
  const prevAlertCount = store.emergency_alerts.filter((a) => a.trip_id === tripId).length;

  store.trip_invites.forEach((inv) => {
    if (inv.trip_id === tripId) inv.is_revoked = true;
  });

  store.locations = store.locations.filter((l) => l.trip_id !== tripId);
  store.emergency_alerts = store.emergency_alerts.filter((a) => a.trip_id !== tripId);
  store.trip_members = store.trip_members.filter((m) => m.trip_id !== tripId);
  store.passenger_roster = store.passenger_roster.filter((r) => r.trip_id !== tripId);

  trip.status = 'completed';
  trip.ended_at = now;

  const summary = {
    status: 'completed',
    purged_roster_rows: prevRosterCount,
    purged_members: prevMemberCount,
    purged_locations: prevLocCount,
    purged_alerts: prevAlertCount
  };

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'TRIP_ENDED_AND_PII_PURGED',
    details: summary,
    created_at: now
  });

  writeLocalStore(store);
  return summary;
}

export async function getInvitePublicInfo(tokenOrCode: string) {
  const store = readLocalStore();
  const clean = tokenOrCode.trim();
  const invite = store.trip_invites.find(
    (i) => i.token === clean || (i.invitation_code && i.invitation_code.toLowerCase() === clean.toLowerCase())
  );
  if (!invite) return { valid: false, reason: 'Invitation link or code not found.' };
  if (invite.is_revoked) return { valid: false, reason: 'This invitation link has been revoked.' };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'This invitation link has expired.' };
  }

  const trip = store.trips.find((t) => t.id === invite.trip_id);
  if (!trip || trip.status === 'completed') {
    return { valid: false, reason: 'This trip has already ended.' };
  }

  return {
    valid: true,
    trip: {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      organizer_contact: trip.organizer_contact || '',
      retention_days: trip.retention_days || 7,
      status: trip.status
    }
  };
}

export async function verifyAndRegisterTourist(params: {
  inviteToken: string;
  fullName: string;
  preferredDisplayName?: string;
  passportNumber?: string;
  contactNumber?: string;
  emergencyContact?: string;
  consentGranted?: boolean;
  initialLat?: number | null;
  initialLng?: number | null;
  initialAcc?: number | null;
}): Promise<{
  ok: boolean;
  status: number;
  error?: string;
  sessionData?: {
    memberId: string;
    tripId: string;
    rosterId: string;
    displayName: string;
    sessionToken: string;
  };
}> {
  const inviteInfo = await getInvitePublicInfo(params.inviteToken);
  if (!inviteInfo.valid || !inviteInfo.trip) {
    return { ok: false, status: 403, error: inviteInfo.reason || 'Invalid invitation link.' };
  }

  const tripId = inviteInfo.trip.id;
  const cleanFullName = params.fullName.trim().replace(/\s+/g, ' ');
  const cleanDisplayName = (params.preferredDisplayName || cleanFullName).trim().replace(/\s+/g, ' ');
  const normName = normalizePassengerName(cleanFullName);
  const normPassport = params.passportNumber ? normalizePassportNumber(params.passportNumber) : '';
  const normContact = params.contactNumber ? normalizePhoneNumber(params.contactNumber) : '';

  if (!normName || normName.length < 2) {
    return { ok: false, status: 400, error: 'Please enter your Full Name or Short Name.' };
  }
  if (!normPassport && !normContact) {
    return {
      ok: false,
      status: 400,
      error: 'Please provide at least one contact identifier: Mobile Number OR Passport Number.'
    };
  }

  const store = readLocalStore();
  const tripObj = store.trips.find((t) => t.id === tripId);
  const maxTourists = Math.min(tripObj?.max_tourists || MAX_PASSENGERS_PER_TRIP, MAX_PASSENGERS_PER_TRIP);
  const currentMembers = store.trip_members.filter((m) => m.trip_id === tripId);

  const sessionToken = crypto.randomBytes(24).toString('hex');
  const sessionTokenHash = hashSessionToken(sessionToken);
  const now = new Date().toISOString();
  const sharingEnabled = params.consentGranted === true;

  const candidates = store.passenger_roster.filter(
    (r) => r.trip_id === tripId && r.normalized_name === normName
  );
  let matchedRoster: PassengerRosterRecord | null = null;
  for (const row of candidates) {
    const res = evaluateRosterMatch({
      tripId,
      inputName: params.fullName,
      inputPassport: params.passportNumber,
      inputContact: params.contactNumber,
      rosterNormalizedName: row.normalized_name,
      rosterPassportHash: row.passport_hash,
      rosterContactHash: row.contact_hash
    });
    if (res.matched) {
      matchedRoster = row;
      break;
    }
  }

  if (!matchedRoster) {
    return {
      ok: false,
      status: 401,
      error: 'We could not match those details to the trip passenger list. Check the name and your registered mobile number or passport number, or contact your tour organizer.'
    };
  }

  if (matchedRoster.is_claimed) {
    const existingMember = store.trip_members.find((m) => m.roster_id === matchedRoster!.id);
    if (!existingMember) {
      return {
        ok: false,
        status: 409,
        error: 'This passenger record is already claimed. Please contact your tour organizer to restore access.'
      };
    }
    existingMember.session_token_hash = sessionTokenHash;
    existingMember.last_seen_at = now;
    existingMember.sharing_enabled = sharingEnabled;
    existingMember.consent_granted = sharingEnabled;
    writeLocalStore(store);
    return {
      ok: true,
      status: 200,
      sessionData: {
        memberId: existingMember.id,
        tripId,
        rosterId: matchedRoster.id,
        displayName: existingMember.display_name,
        sessionToken
      }
    };
  }

  if (currentMembers.length >= maxTourists) {
    return {
      ok: false,
      status: 403,
      error: `This trip has reached its maximum capacity of ${maxTourists} tourists.`
    };
  }

  const memberId = crypto.randomUUID();
  const touristCode = `LTT-${String(matchedRoster.serial_no).padStart(3, '0')}`;

  const displayName = cleanDisplayName.toUpperCase();

  const newMember: TripMember = {
    id: memberId,
    trip_id: tripId,
    roster_id: matchedRoster.id,
    tourist_code: touristCode,
    display_name: displayName,
    subgroup_name: matchedRoster.subgroup_name || 'Main Group',
    contact_info: normContact || matchedRoster.contact_number_admin || null,
    passport_masked: normPassport ? maskPassportNumber(normPassport) : matchedRoster.passport_masked || null,
    emergency_contact: params.emergencyContact || null,
    sharing_enabled: sharingEnabled,
    consent_granted: sharingEnabled,
    session_token_hash: sessionTokenHash,
    joined_at: now,
    last_seen_at: now
  };

  store.trip_members.push(newMember);

  const rosterTarget = store.passenger_roster.find((r) => r.id === matchedRoster.id);
  if (rosterTarget) {
    rosterTarget.is_claimed = true;
    rosterTarget.claimed_member_id = memberId;
    rosterTarget.claimed_at = now;
  }

  if (sharingEnabled && typeof params.initialLat === 'number' && typeof params.initialLng === 'number') {
    store.locations.push({
      member_id: memberId,
      trip_id: tripId,
      latitude: params.initialLat,
      longitude: params.initialLng,
      accuracy: params.initialAcc ?? 15,
      sharing_status: 'sharing',
      updated_at: now
    });
  }

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: displayName,
    action: 'TOURIST_JOINED_TRIP',
    details: { tourist_code: touristCode, consent_granted: sharingEnabled },
    created_at: now
  });

  writeLocalStore(store);

  return {
    ok: true,
    status: 200,
    sessionData: {
      memberId,
      tripId,
      rosterId: matchedRoster.id,
      displayName: newMember.display_name,
      sessionToken
    }
  };
}

export async function validateActiveTouristMember(
  memberId: string,
  tripId: string,
  rawSessionToken: string
): Promise<TripMember | null> {
  const expectedHash = hashSessionToken(rawSessionToken);
  const store = readLocalStore();
  const member = store.trip_members.find((m) => m.id === memberId && m.trip_id === tripId);
  if (!member || member.session_token_hash !== expectedHash) return null;
  return member;
}

export async function getTouristGroupMapState(tripId: string, requestingMemberId: string) {
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip || trip.status === 'completed') {
    return null;
  }

  const members = store.trip_members.filter((m) => m.trip_id === tripId);
  const locations = store.locations.filter((l) => l.trip_id === tripId);
  const meetingPoints = store.meeting_points.filter((mp) => mp.trip_id === tripId && mp.is_active);
  const headcounts = store.headcount_sessions.filter((hc) => hc.trip_id === tripId && hc.status === 'open');
  const announcements = store.announcements.filter((an) => an.trip_id === tripId);
  const groupMessages = (store.group_messages || []).filter((gm) => gm.trip_id === tripId);
  const myAlerts = store.emergency_alerts
    .filter((a) => a.trip_id === tripId && a.member_id === requestingMemberId)
    .slice(0, 10);

  const locByMember = new Map(locations.map((l) => [l.member_id, l]));
  const primaryMp = meetingPoints[0];
  const sepThreshold = trip.separation_threshold_meters || 500;

  const peers: SafeTouristPeer[] = members.map((m) => {
    const loc = locByMember.get(m.id);
    const effectiveStatus = computeEffectiveStatus(
      m.sharing_enabled,
      loc,
      trip.stale_threshold_seconds || 180
    );
    const distToMp =
      primaryMp && loc && effectiveStatus === 'sharing'
        ? getDistanceMeters(primaryMp.latitude, primaryMp.longitude, loc.latitude, loc.longitude)
        : 0;

    return {
      member_id: m.id,
      tourist_code: m.tourist_code || 'LTT-000',
      display_name: m.display_name,
      subgroup_name: m.subgroup_name || 'Main Group',
      sharing_enabled: m.sharing_enabled,
      effective_status: effectiveStatus,
      last_seen_at: loc ? loc.updated_at : m.last_seen_at,
      latitude: loc ? loc.latitude : null,
      longitude: loc ? loc.longitude : null,
      accuracy: loc ? loc.accuracy : null,
      location_updated_at: loc ? loc.updated_at : null,
      possible_separation: distToMp > sepThreshold
    };
  });

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      organizer_contact: trip.organizer_contact || '',
      stale_threshold_seconds: trip.stale_threshold_seconds || 180,
      update_interval_seconds: trip.update_interval_seconds || 20,
      retention_days: trip.retention_days || 7,
      itinerary: trip.itinerary || [],
      essentials: trip.essentials,
      status: trip.status
    },
    me: peers.find((p) => p.member_id === requestingMemberId) || null,
    peers,
    meetingPoints,
    headcounts,
    announcements,
    groupMessages,
    myAlerts
  };
}

export async function updateTouristLocationOrSharing(params: {
  memberId: string;
  tripId: string;
  sharingEnabled: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  statusOverride?: SharingStatus;
}): Promise<void> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const member = store.trip_members.find(
    (m) => m.id === params.memberId && m.trip_id === params.tripId
  );
  if (!member) return;

  member.sharing_enabled = params.sharingEnabled;
  member.last_seen_at = now;

  const existingLoc = store.locations.find((l) => l.member_id === params.memberId);
  if (!params.sharingEnabled) {
    if (existingLoc) {
      existingLoc.sharing_status = 'disabled';
      existingLoc.updated_at = now;
    }
    writeLocalStore(store);
    return;
  }

  // Preserve an honest unavailable state when the browser cannot provide GPS.
  if (params.statusOverride === 'unavailable' && existingLoc) {
    existingLoc.sharing_status = 'unavailable';
    existingLoc.updated_at = now;
    writeLocalStore(store);
    return;
  }

  // Reject invalid GPS coordinates outside [-90..90] / [-180..180]
  if (
    typeof params.latitude === 'number' &&
    typeof params.longitude === 'number' &&
    !isNaN(params.latitude) &&
    !isNaN(params.longitude) &&
    params.latitude >= -90 &&
    params.latitude <= 90 &&
    params.longitude >= -180 &&
    params.longitude <= 180
  ) {
    if (existingLoc) {
      existingLoc.latitude = params.latitude;
      existingLoc.longitude = params.longitude;
      existingLoc.accuracy = params.accuracy ?? 15;
      existingLoc.sharing_status = params.statusOverride || 'sharing';
      existingLoc.updated_at = now;
    } else {
      store.locations.push({
        member_id: params.memberId,
        trip_id: params.tripId,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy ?? 15,
        sharing_status: params.statusOverride || 'sharing',
        updated_at: now
      });
    }
  }
  writeLocalStore(store);
}

export async function createEmergencyAlert(params: {
  memberId: string;
  tripId: string;
  passengerName: string;
  category?: AssistanceCategory;
  priority?: AssistancePriority;
  note?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
}): Promise<EmergencyAlert> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const member = store.trip_members.find((m) => m.id === params.memberId);
  const roster = member?.roster_id
    ? store.passenger_roster.find((r) => r.id === member.roster_id)
    : undefined;

  const contactDetails =
    member?.contact_info ||
    roster?.contact_number_admin ||
    (member?.passport_masked ? `Passport: ${member.passport_masked}` : 'On file');

  let lat = params.latitude ?? null;
  let lng = params.longitude ?? null;
  let acc = params.accuracy ?? null;

  if (lat === null || lng === null) {
    const lastLoc = store.locations.find((l) => l.member_id === params.memberId);
    if (lastLoc) {
      lat = lastLoc.latitude;
      lng = lastLoc.longitude;
      acc = lastLoc.accuracy;
    }
  }

  const category = params.category || 'Lost / separated from group';
  const priority: AssistancePriority =
    params.priority ||
    (category === 'Medical assistance' || category === 'Accident / injury' ? 'Critical' : 'High');

  const newAlert: EmergencyAlert = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    member_id: params.memberId,
    tourist_code: member?.tourist_code || 'LTT-000',
    passenger_name: params.passengerName,
    subgroup_name: member?.subgroup_name || 'Main Group',
    contact_details: contactDetails,
    category,
    priority,
    note: params.note || category,
    latitude: lat,
    longitude: lng,
    accuracy: acc,
    status: 'New',
    assigned_responder: null,
    internal_notes: null,
    resolution_notes: null,
    messages: [
      {
        id: crypto.randomUUID(),
        request_id: 'init',
        sender_name: params.passengerName,
        sender_role: 'tourist',
        message: `${category}${params.note ? ': ' + params.note : ''}`,
        created_at: now
      }
    ],
    created_at: now,
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by: null
  };

  store.emergency_alerts.unshift(newAlert);
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.passengerName,
    action: 'ASSISTANCE_REQUEST_SUBMITTED',
    details: { alertId: newAlert.id, category, priority, latitude: lat, longitude: lng },
    created_at: now
  });

  writeLocalStore(store);
  return newAlert;
}

export async function updateEmergencyAlertStatus(params: {
  alertId: string;
  tripId: string;
  newStatus: AlertStatus;
  assignedResponder?: string;
  internalNotes?: string;
  resolutionNotes?: string;
  actorEmail: string;
}): Promise<EmergencyAlert | null> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const alert = store.emergency_alerts.find(
    (a) => a.id === params.alertId && a.trip_id === params.tripId
  );
  if (!alert) return null;

  alert.status = params.newStatus;
  if (params.assignedResponder !== undefined) {
    alert.assigned_responder = params.assignedResponder;
  }
  if (params.internalNotes !== undefined) {
    alert.internal_notes = params.internalNotes;
  }
  if (params.resolutionNotes !== undefined) {
    alert.resolution_notes = params.resolutionNotes;
  }

  if (params.newStatus === 'acknowledged' || params.newStatus === 'Acknowledged') {
    alert.acknowledged_at = now;
    alert.acknowledged_by = params.actorEmail;
  } else if (isResolvedStatus(params.newStatus)) {
    alert.resolved_at = now;
    alert.resolved_by = params.actorEmail;
  }

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: `INCIDENT_${String(params.newStatus).toUpperCase()}`,
    details: {
      alertId: params.alertId,
      passengerName: alert.passenger_name,
      assignedResponder: alert.assigned_responder
    },
    created_at: now
  });

  writeLocalStore(store);
  return alert;
}

export async function addAssistanceMessage(params: {
  tripId: string;
  alertId: string;
  senderName: string;
  senderRole: 'tourist' | 'organizer' | 'responder';
  message: string;
}) {
  const now = new Date().toISOString();
  const store = readLocalStore();
  const alert = store.emergency_alerts.find(
    (a) => a.id === params.alertId && a.trip_id === params.tripId
  );
  if (!alert) return null;
  if (!alert.messages) alert.messages = [];
  alert.messages.push({
    id: crypto.randomUUID(),
    request_id: alert.id,
    sender_name: params.senderName,
    sender_role: params.senderRole,
    message: params.message.trim(),
    created_at: now
  });
  writeLocalStore(store);
  return alert;
}

export async function simulateTouristsForTrip(tripId: string, count: number, actorEmail: string) {
  const capped = Math.min(Math.max(1, Math.floor(count)), MAX_PASSENGERS_PER_TRIP);
  const now = new Date().toISOString();
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error('Trip not found');
  if (trip.id !== SEED_TRIP_ID || !trip.name.includes('(Demo Seed)')) {
    throw new Error('The load simulator is restricted to the local sample trip and cannot run on a real trip.');
  }

  store.passenger_roster = store.passenger_roster.filter((r) => r.trip_id !== tripId);
  store.trip_members = store.trip_members.filter((m) => m.trip_id !== tripId);
  store.locations = store.locations.filter((l) => l.trip_id !== tripId);

  const baseLat = 3.1579;
  const baseLng = 101.7116;

  for (let i = 1; i <= capped; i++) {
    const rosterId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const name = `TOURIST PASSENGER ${String(i).padStart(3, '0')}`;
    const passport = `BD${String(1000000 + i)}`;
    const phone = `+88017${String(10000000 + i).slice(0, 8)}`;
    const subgroup = i % 2 === 0 ? 'Bus B' : 'Bus A';

    const angle = (i / capped) * Math.PI * 2;
    const radius = 0.0018 + (i % 7) * 0.001;
    const lat = Number((baseLat + Math.cos(angle) * radius).toFixed(6));
    const lng = Number((baseLng + Math.sin(angle) * radius).toFixed(6));

    const isSharing = i % 10 !== 0;
    const isOffline = isSharing && i % 9 === 0;

    const updatedTime = isOffline
      ? new Date(Date.now() - 10 * 60 * 1000).toISOString()
      : new Date(Date.now() - (i % 25) * 1000).toISOString();

    store.passenger_roster.push({
      id: rosterId,
      trip_id: tripId,
      serial_no: i,
      full_name_display: name,
      normalized_name: normalizePassengerName(name),
      passport_hash: hashSensitiveIdentifier(tripId, passport),
      passport_masked: maskPassportNumber(passport),
      contact_hash: hashSensitiveIdentifier(tripId, phone),
      contact_number_admin: phone,
      subgroup_name: subgroup,
      is_claimed: true,
      claimed_member_id: memberId,
      claimed_at: now,
      created_at: now
    });

    store.trip_members.push({
      id: memberId,
      trip_id: tripId,
      roster_id: rosterId,
      tourist_code: `LTT-${String(i).padStart(3, '0')}`,
      display_name: name,
      subgroup_name: subgroup,
      contact_info: phone,
      passport_masked: maskPassportNumber(passport),
      sharing_enabled: isSharing,
      consent_granted: true,
      session_token_hash: hashSessionToken(`sim-token-${i}`),
      joined_at: now,
      last_seen_at: updatedTime
    });

    store.locations.push({
      member_id: memberId,
      trip_id: tripId,
      latitude: lat,
      longitude: lng,
      accuracy: 8 + (i % 15),
      sharing_status: !isSharing ? 'disabled' : isOffline ? 'offline' : 'sharing',
      updated_at: updatedTime
    });
  }

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'SIMULATED_TOURISTS_LOADED',
    details: { simulatedCount: capped },
    created_at: now
  });

  writeLocalStore(store);
  return { simulatedCount: capped };
}


export async function addTripItineraryItem(params: {
  tripId: string;
  dayLabel: string;
  timeLabel: string;
  title: string;
  locationName: string;
  instructions: string;
  actorEmail: string;
}) {
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === params.tripId);
  if (!trip) throw new Error('Trip not found');
  if (!trip.itinerary) trip.itinerary = [];
  trip.itinerary.push({
    id: crypto.randomUUID(),
    day_label: params.dayLabel.trim(),
    time_label: params.timeLabel.trim(),
    title: params.title.trim(),
    location_name: params.locationName.trim(),
    instructions: params.instructions.trim()
  });
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: 'ITINERARY_ITEM_ADDED',
    details: { title: params.title },
    created_at: new Date().toISOString()
  });
  writeLocalStore(store);
  return trip.itinerary;
}

export async function deleteTripItineraryItem(tripId: string, itemId: string, actorEmail: string) {
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip || !trip.itinerary) return [];
  trip.itinerary = trip.itinerary.filter((i) => i.id !== itemId);
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'ITINERARY_ITEM_REMOVED',
    details: { itemId },
    created_at: new Date().toISOString()
  });
  writeLocalStore(store);
  return trip.itinerary;
}


export async function sendGroupChatMessage(params: {
  tripId: string;
  senderId: string;
  senderName: string;
  senderCode?: string;
  senderRole: 'tourist' | 'organizer' | 'responder';
  message: string;
  latitude?: number | null;
  longitude?: number | null;
  isUrgent?: boolean;
}): Promise<GroupChatMessage> {
  const now = new Date().toISOString();
  const store = readLocalStore();
  if (!store.group_messages) store.group_messages = [];
  const msg: GroupChatMessage = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    sender_id: params.senderId,
    sender_name: params.senderName,
    sender_code: params.senderCode,
    sender_role: params.senderRole,
    message: params.message.trim(),
    latitude: typeof params.latitude === 'number' ? params.latitude : null,
    longitude: typeof params.longitude === 'number' ? params.longitude : null,
    is_urgent: Boolean(params.isUrgent),
    created_at: now
  };
  store.group_messages.push(msg);
  writeLocalStore(store);
  return msg;
}

export async function updateTripEssentials(params: {
  tripId: string;
  essentials: TripEssentialHub;
  actorEmail: string;
}) {
  const store = readLocalStore();
  const trip = store.trips.find((t) => t.id === params.tripId);
  if (!trip) throw new Error('Trip not found');
  trip.essentials = params.essentials;
  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    actor_label: params.actorEmail,
    action: 'TRIP_ESSENTIALS_UPDATED',
    details: { hotel: params.essentials.hotel_name, airport: params.essentials.airport_name },
    created_at: new Date().toISOString()
  });
  writeLocalStore(store);
  return trip.essentials;
}
