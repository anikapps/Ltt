import { MAX_PASSENGERS_PER_TRIP, clampPassengerCapacity } from './capacity';
import { getSupabaseAdminClient, isSupabaseConfigured } from './supabase';
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
        captured_at: updatedTime,
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
          organizer_hotline: '',
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
            tourist_code: 'LTT-001',
            display_name: 'MD RAHIM UDDIN',
            subgroup_name: 'Bus A',
            status: 'present',
            latitude: 3.1579,
            longitude: 101.7116,
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
        sender_role: 'admin',
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

const SUPABASE_STATE_ROW_ID = 'primary';

function hydrateStoreDefaults(parsed: LocalDatabaseSchema): LocalDatabaseSchema {
  if (!parsed.meeting_points) parsed.meeting_points = createInitialSeedStore().meeting_points;
  if (!parsed.headcount_sessions) parsed.headcount_sessions = createInitialSeedStore().headcount_sessions;
  if (!parsed.announcements) parsed.announcements = createInitialSeedStore().announcements;
  if (!parsed.group_messages) parsed.group_messages = createInitialSeedStore().group_messages;
  if (parsed.trips[0] && !parsed.trips[0].essentials) parsed.trips[0].essentials = createInitialSeedStore().trips[0].essentials;
  // Backfill captured_at for locations written by older versions of the local store.
  for (const loc of parsed.locations || []) {
    if (!loc.captured_at) loc.captured_at = loc.updated_at;
  }
  return parsed;
}

async function readStore(): Promise<LocalDatabaseSchema> {
  const sb = getSupabaseAdminClient();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('lttbd_app_state')
        .select('payload')
        .eq('id', SUPABASE_STATE_ROW_ID)
        .maybeSingle();

      if (!error && data?.payload) {
        return hydrateStoreDefaults(data.payload as LocalDatabaseSchema);
      }

      const seed = createInitialSeedStore();
      await sb.from('lttbd_app_state').upsert({
        id: SUPABASE_STATE_ROW_ID,
        payload: seed,
        updated_at: new Date().toISOString()
      });
      return seed;
    } catch (err) {
      console.error('Supabase readStore error, falling back to seed:', err);
      return createInitialSeedStore();
    }
  }

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
    return hydrateStoreDefaults(JSON.parse(raw) as LocalDatabaseSchema);
  } catch {
    return createInitialSeedStore();
  }
}

async function writeStore(store: LocalDatabaseSchema): Promise<void> {
  const sb = getSupabaseAdminClient();
  if (sb) {
    const { error } = await sb.from('lttbd_app_state').upsert({
      id: SUPABASE_STATE_ROW_ID,
      payload: store,
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.error('Failed to write Supabase state:', error.message);
      throw new Error('Failed to save changes to Supabase database.');
    }
    return;
  }

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
  const store = await readStore();
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
    mode: (isSupabaseConfigured() ? 'supabase' : 'local') as 'supabase' | 'local',
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
  organizer_contact?: string;
  require_passport?: boolean;
  adminEmail: string;
  adminName: string;
}): Promise<{ trip: Trip; invite: TripInvite }> {
  const cappedMax = clampPassengerCapacity(params.max_tourists);
  const now = new Date().toISOString();
  const token = `${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${crypto.randomBytes(4).toString('hex')}`;
  const invitationCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const store = await readStore();
  const newTrip: Trip = {
    id: crypto.randomUUID(),
    name: params.name.trim(),
    destination: params.destination.trim(),
    start_date: params.start_date,
    end_date: params.end_date,
    max_tourists: cappedMax,
    status: 'active',
    organizer_contact: (params.organizer_contact || '').trim(),
    stale_threshold_seconds: 180,
    update_interval_seconds: 20,
    retention_days: 7,
    separation_threshold_meters: 500,
    require_passport: Boolean(params.require_passport),
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

  await writeStore(store);
  return { trip: newTrip, invite: newInvite };
}

export async function getAdminTripDetail(tripId: string, _adminEmail: string) {
  const store = await readStore();
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

  const openAlertByMemberId = new Map(
    alerts
      .filter((a) => !isResolvedStatus(a.status))
      .map((a) => [a.member_id, a])
  );

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

    const openAlert = member ? openAlertByMemberId.get(member.id) : undefined;

    return {
      roster_id: r.id,
      serial_no: r.serial_no,
      is_claimed: r.is_claimed || Boolean(member),
      member_id: member ? member.id : '',
      tourist_code: member?.tourist_code || `LTT-${String(r.serial_no).padStart(3, '0')}`,
      full_name_display: r.full_name_display,
      display_name: member?.display_name || r.full_name_display,
      subgroup_name: member?.subgroup_name || r.subgroup_name || 'Main Group',
      sharing_enabled: member ? member.sharing_enabled : false,
      effective_status: effectiveStatus,
      last_seen_at: member ? member.last_seen_at : null,
      location_updated_at: loc ? loc.updated_at : null,
      latitude: loc ? loc.latitude : null,
      longitude: loc ? loc.longitude : null,
      accuracy: loc ? loc.accuracy : null,
      joined_at: member?.joined_at || null,
      has_active_alert: Boolean(openAlert),
      active_alert_id: openAlert?.id || null,
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
        full_name_display: m.display_name,
        display_name: m.display_name,
        subgroup_name: m.subgroup_name || 'Main Group',
        sharing_enabled: m.sharing_enabled,
        effective_status: effectiveStatus,
        last_seen_at: m.last_seen_at,
        location_updated_at: loc ? loc.updated_at : null,
        latitude: loc ? loc.latitude : null,
        longitude: loc ? loc.longitude : null,
        accuracy: loc ? loc.accuracy : null,
        joined_at: m.joined_at || null,
        has_active_alert: openAlertByMemberId.has(m.id),
        active_alert_id: openAlertByMemberId.get(m.id)?.id || null,
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
  const store = await readStore();
  const mp: MeetingPoint = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    title: params.title.trim(),
    latitude: Number(params.latitude),
    longitude: Number(params.longitude),
    notes: params.notes.trim(),
    description: params.notes.trim(),
    scheduled_at: params.scheduledAt || now,
    scheduled_time: params.scheduledAt || now,
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
  await writeStore(store);
  return mp;
}

export async function toggleOrDeleteMeetingPoint(params: {
  tripId: string;
  meetingPointId: string;
  subAction: 'toggle' | 'delete';
  actorEmail: string;
}) {
  const store = await readStore();
  if (params.subAction === 'delete') {
    store.meeting_points = store.meeting_points.filter((m) => m.id !== params.meetingPointId);
  } else {
    const target = store.meeting_points.find((m) => m.id === params.meetingPointId);
    if (target) target.is_active = !target.is_active;
  }
  await writeStore(store);
}

export async function startHeadcountSession(params: {
  tripId: string;
  title: string;
  subgroupName: string;
  actorEmail: string;
}): Promise<HeadcountSession> {
  const now = new Date().toISOString();
  const store = await readStore();
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
  await writeStore(store);
  return hc;
}

export async function closeHeadcountSession(tripId: string, sessionId: string, actorEmail: string) {
  const now = new Date().toISOString();
  const store = await readStore();
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
  await writeStore(store);
}

export async function recordHeadcountResponse(params: {
  tripId: string;
  sessionId: string;
  memberId: string;
  displayName?: string;
  status: 'present' | 'needs_help';
  latitude?: number | null;
  longitude?: number | null;
}) {
  const now = new Date().toISOString();
  const store = await readStore();
  const hc = store.headcount_sessions.find(
    (s) => s.id === params.sessionId && s.trip_id === params.tripId
  );
  if (!hc || hc.status !== 'open') return null;

  const member = store.trip_members.find(
    (m) => m.id === params.memberId && m.trip_id === params.tripId
  );
  const loc = store.locations.find((l) => l.member_id === params.memberId);

  const existingIdx = hc.responses.findIndex((r) => r.member_id === params.memberId);
  const entry = {
    member_id: params.memberId,
    tourist_code: member?.tourist_code || 'LTT-000',
    display_name: params.displayName || member?.display_name || 'Passenger',
    subgroup_name: member?.subgroup_name || 'Main Group',
    status: params.status,
    latitude:
      typeof params.latitude === 'number'
        ? params.latitude
        : loc
        ? loc.latitude
        : null,
    longitude:
      typeof params.longitude === 'number'
        ? params.longitude
        : loc
        ? loc.longitude
        : null,
    responded_at: now
  };
  if (existingIdx >= 0) {
    hc.responses[existingIdx] = entry;
  } else {
    hc.responses.push(entry);
  }
  await writeStore(store);
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
  const store = await readStore();
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
  await writeStore(store);
  return ann;
}

export async function markAnnouncementRead(tripId: string, announcementId: string, memberId: string) {
  const store = await readStore();
  const ann = store.announcements.find((a) => a.id === announcementId && a.trip_id === tripId);
  if (ann && !ann.read_by_member_ids.includes(memberId)) {
    ann.read_by_member_ids.push(memberId);
    await writeStore(store);
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
  const store = await readStore();
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

  await writeStore(store);
  return trip;
}

export async function saveImportedRoster(
  tripId: string,
  entries: ParsedRosterEntry[],
  actorEmail: string
): Promise<{ importedCount: number }> {
  const now = new Date().toISOString();
  const store = await readStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error('Trip not found');

  const maxCap = Math.min(trip.max_tourists || MAX_PASSENGERS_PER_TRIP, MAX_PASSENGERS_PER_TRIP);
  if (entries.length > maxCap) {
    throw new Error(`Roster size (${entries.length}) exceeds maximum capacity of ${maxCap} tourists.`);
  }

  const previousRoster = store.passenger_roster.filter((r) => r.trip_id === tripId);
  store.passenger_roster = store.passenger_roster.filter((r) => r.trip_id !== tripId);

  const newRosterIds: string[] = [];
  for (const e of entries) {
    const normName = normalizePassengerName(e.fullName);
    const normPassport = normalizePassportNumber(e.passportNumber);
    const normPhone = normalizePhoneNumber(e.contactNumber);
    const rosterId = crypto.randomUUID();
    newRosterIds.push(rosterId);
    store.passenger_roster.push({
      id: rosterId,
      trip_id: tripId,
      serial_no: e.serialNo,
      full_name_display: e.fullName,
      normalized_name: normName,
      passport_hash: normPassport ? hashSensitiveIdentifier(tripId, normPassport) : '',
      passport_masked: maskPassportNumber(normPassport),
      contact_hash: normPhone ? hashSensitiveIdentifier(tripId, normPhone) : '',
      contact_number_admin: normPhone || e.contactNumber,
      subgroup_name: e.subgroupName || 'Main Group',
      is_claimed: false,
      claimed_member_id: null,
      claimed_at: null,
      created_at: now
    });
  }

  // Re-importing a roster must never kick joined tourists out of their live
  // sessions (Supabase mode keeps trip_members too). Re-link existing members
  // to the fresh roster rows by their passport/contact HMAC; members that no
  // longer match stay joined as unlinked extras instead of being deleted.
  const oldByMember = new Map(previousRoster.filter((r) => r.claimed_member_id).map((r) => [r.claimed_member_id!, r]));
  for (const member of store.trip_members) {
    if (member.trip_id !== tripId) continue;
    const oldRow = oldByMember.get(member.id);
    if (!oldRow) continue;
    const relinked = store.passenger_roster.find(
      (r) =>
        r.trip_id === tripId &&
        ((oldRow.passport_hash && r.passport_hash && r.passport_hash === oldRow.passport_hash) ||
          (oldRow.contact_hash && r.contact_hash && r.contact_hash === oldRow.contact_hash))
    );
    if (relinked) {
      member.roster_id = relinked.id;
      relinked.is_claimed = true;
      relinked.claimed_member_id = member.id;
      relinked.claimed_at = now;
    } else {
      member.roster_id = null;
    }
  }

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'PASSENGER_ROSTER_IMPORTED',
    details: { count: entries.length },
    created_at: now
  });

  await writeStore(store);
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

  const store = await readStore();
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
  await writeStore(store);
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
  const store = await readStore();

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

  await writeStore(store);
  return store.trip_admins.filter((a) => a.trip_id === params.tripId);
}

export async function removePassengerFromTrip(
  tripId: string,
  rosterOrMemberId: string,
  actorEmail: string
): Promise<void> {
  const now = new Date().toISOString();
  const store = await readStore();
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
  await writeStore(store);
}

export async function endTripAndPurgePersonalData(tripId: string, actorEmail: string) {
  const now = new Date().toISOString();
  const store = await readStore();
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

  await writeStore(store);
  return summary;
}

export async function archiveTrip(tripId: string, actorEmail: string) {
  const now = new Date().toISOString();
  const store = await readStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error('Trip not found');

  trip.status = 'archived';
  trip.archived_at = now;

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'TRIP_ARCHIVED',
    details: { trip_name: trip.name },
    created_at: now
  });

  await writeStore(store);
  return { archived: true };
}

export async function reviveArchivedTrip(tripId: string, actorEmail: string) {
  const now = new Date().toISOString();
  const store = await readStore();
  const trip = store.trips.find((t) => t.id === tripId);
  if (!trip) throw new Error('Trip not found');

  // Security rule: reviving an old tour must not reactivate old sessions,
  // sharing consents, or old invitation links.
  for (const member of store.trip_members) {
    if (member.trip_id === tripId) {
      member.sharing_enabled = false;
      member.session_revoked = true;
    }
  }
  for (const inv of store.trip_invites) {
    if (inv.trip_id === tripId) inv.is_revoked = true;
  }
  for (const loc of store.locations) {
    if (loc.trip_id === tripId) loc.sharing_status = 'disabled';
  }

  trip.status = 'active';
  trip.ended_at = null;
  trip.archived_at = null;

  const token = `ltt-${crypto.randomBytes(8).toString('hex')}`;
  const newInvite: TripInvite = {
    id: crypto.randomUUID(),
    trip_id: tripId,
    token,
    invitation_code: crypto.randomBytes(3).toString('hex').toUpperCase(),
    is_revoked: false,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: now
  };
  store.trip_invites.unshift(newInvite);

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: tripId,
    actor_label: actorEmail,
    action: 'TRIP_REVIVED',
    details: { fresh_invite_token: token, old_sessions_revoked: true },
    created_at: now
  });

  await writeStore(store);
  return { tripId, newInvite };
}

export async function getInvitePublicInfo(tokenOrCode: string) {
  const store = await readStore();
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

  const store = await readStore();
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
    await writeStore(store);
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
      captured_at: now,
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

  await writeStore(store);

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
  const store = await readStore();
  const member = store.trip_members.find((m) => m.id === memberId && m.trip_id === tripId);
  if (!member || member.session_token_hash !== expectedHash) return null;
  return member;
}

export async function getTouristGroupMapState(tripId: string, requestingMemberId: string) {
  const store = await readStore();
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
      possible_separation: distToMp > sepThreshold,
      is_me: m.id === requestingMemberId
    };
  });

  const mePeer = peers.find((p) => p.member_id === requestingMemberId) || null;

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
      itinerary: trip.itinerary || trip.essentials?.itinerary || [],
      essentials: trip.essentials,
      status: trip.status
    },
    // `id` and `member_id` are the same value; different pages read either name.
    me: mePeer ? { ...mePeer, id: mePeer.member_id } : null,
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
  sharingEnabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  statusOverride?: SharingStatus;
}): Promise<{ sharingEnabled: boolean }> {
  const now = new Date().toISOString();
  const store = await readStore();
  const member = store.trip_members.find(
    (m) => m.id === params.memberId && m.trip_id === params.tripId
  );
  if (!member) return { sharingEnabled: false };

  const nextSharing = typeof params.sharingEnabled === 'boolean' ? params.sharingEnabled : member.sharing_enabled;
  member.sharing_enabled = nextSharing;
  member.last_seen_at = now;

  const existingLoc = store.locations.find((l) => l.member_id === params.memberId);
  if (!nextSharing) {
    if (existingLoc) {
      existingLoc.sharing_status = 'disabled';
      existingLoc.captured_at = now;
      existingLoc.updated_at = now;
    }
    await writeStore(store);
    return { sharingEnabled: false };
  }

  // Preserve an honest unavailable state when the browser cannot provide GPS.
  if (params.statusOverride === 'unavailable' && existingLoc) {
    existingLoc.sharing_status = 'unavailable';
    existingLoc.captured_at = now;
    existingLoc.updated_at = now;
    await writeStore(store);
    return { sharingEnabled: true };
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
      existingLoc.captured_at = now;
      existingLoc.updated_at = now;
    } else {
      store.locations.push({
        member_id: params.memberId,
        trip_id: params.tripId,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: params.accuracy ?? 15,
        sharing_status: params.statusOverride || 'sharing',
        captured_at: now,
        updated_at: now
      });
    }
  }
  await writeStore(store);
  return { sharingEnabled: nextSharing };
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
  const store = await readStore();
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

  const touristNote = params.note || '';
  const hydratedMessage = `${category}${touristNote ? ': ' + touristNote : ''}`;

  const newAlert: EmergencyAlert = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    member_id: params.memberId,
    tourist_code: member?.tourist_code || 'LTT-000',
    passenger_name: params.passengerName,
    display_name: params.passengerName,
    subgroup_name: member?.subgroup_name || 'Main Group',
    contact_details: contactDetails,
    category,
    priority,
    message: hydratedMessage,
    note: touristNote,
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
        sender_name: params.passengerName,
        sender_role: 'tourist',
        message: hydratedMessage,
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

  await writeStore(store);
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
  const store = await readStore();
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

  if (params.newStatus === 'Acknowledged') {
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

  await writeStore(store);
  return alert;
}

export async function addAssistanceMessage(params: {
  tripId: string;
  alertId: string;
  senderName: string;
  senderRole: 'tourist' | 'admin' | 'organizer' | 'responder';
  message: string;
}) {
  const now = new Date().toISOString();
  const store = await readStore();
  const alert = store.emergency_alerts.find(
    (a) => a.id === params.alertId && a.trip_id === params.tripId
  );
  if (!alert) return null;
  if (!alert.messages) alert.messages = [];
  alert.messages.push({
    id: crypto.randomUUID(),
    sender_name: params.senderName,
    sender_role: params.senderRole,
    message: params.message.trim(),
    created_at: now
  });
  await writeStore(store);
  return alert;
}

export async function simulateTouristsForTrip(tripId: string, count: number, actorEmail: string) {
  const capped = Math.min(Math.max(1, Math.floor(count)), MAX_PASSENGERS_PER_TRIP);
  const now = new Date().toISOString();
  const store = await readStore();
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
      captured_at: updatedTime,
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

  await writeStore(store);
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
  const store = await readStore();
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
  await writeStore(store);
  return trip.itinerary;
}

export async function deleteTripItineraryItem(tripId: string, itemId: string, actorEmail: string) {
  const store = await readStore();
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
  await writeStore(store);
  return trip.itinerary;
}


export async function sendGroupChatMessage(params: {
  tripId: string;
  senderId: string;
  senderName: string;
  senderCode?: string;
  senderRole: 'tourist' | 'organizer' | 'responder' | 'admin';
  message: string;
  replyToId?: string | null;
  replyToPreview?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isUrgent?: boolean;
}): Promise<GroupChatMessage> {
  const now = new Date().toISOString();
  const store = await readStore();
  if (!store.group_messages) store.group_messages = [];
  const msg: GroupChatMessage = {
    id: crypto.randomUUID(),
    trip_id: params.tripId,
    sender_id: params.senderId,
    sender_name: params.senderName,
    sender_code: params.senderCode || 'TB',
    sender_role: params.senderRole === 'organizer' || params.senderRole === 'responder' ? 'admin' : params.senderRole,
    message: params.message.trim(),
    reply_to_id: params.replyToId || null,
    reply_to_preview: params.replyToPreview || null,
    reactions: [],
    is_pinned: false,
    latitude: typeof params.latitude === 'number' ? params.latitude : null,
    longitude: typeof params.longitude === 'number' ? params.longitude : null,
    created_at: now
  };
  store.group_messages.push(msg);
  await writeStore(store);
  return msg;
}

export async function operateLocalGroupChat(params: {
  tripId: string;
  senderId: string;
  isAdmin: boolean;
  op: 'react' | 'pin' | 'edit' | 'delete';
  messageId: string;
  emoji?: string;
  message?: string;
}) {
  const store = await readStore();
  if (!store.group_messages) store.group_messages = [];
  const target = store.group_messages.find((m) => m.id === params.messageId && m.trip_id === params.tripId);
  if (!target) return null;

  if (params.op === 'react' && params.emoji) {
    const reactions = Array.isArray(target.reactions) ? [...target.reactions] : [];
    const existing = reactions.find((r) => r.emoji === params.emoji);
    if (existing) {
      if (existing.member_ids.includes(params.senderId)) {
        existing.member_ids = existing.member_ids.filter((id) => id !== params.senderId);
      } else {
        existing.member_ids.push(params.senderId);
      }
    } else {
      reactions.push({ emoji: params.emoji, member_ids: [params.senderId] });
    }
    target.reactions = reactions.filter((r) => r.member_ids.length > 0);
    await writeStore(store);
    return { reactions: target.reactions };
  }

  if (params.op === 'pin' && params.isAdmin) {
    target.is_pinned = !target.is_pinned;
    await writeStore(store);
    return { is_pinned: target.is_pinned };
  }

  if (params.op === 'edit' && params.message) {
    if (target.sender_id === params.senderId || params.isAdmin) {
      target.message = params.message.trim();
      target.edited_at = new Date().toISOString();
      await writeStore(store);
    }
    return { edited: true };
  }

  if (params.op === 'delete') {
    if (target.sender_id === params.senderId || params.isAdmin) {
      store.group_messages = store.group_messages.filter((m) => m.id !== params.messageId);
      await writeStore(store);
    }
    return { deleted: true };
  }

  return null;
}

export async function updateTripEssentials(params: {
  tripId: string;
  essentials: TripEssentialHub;
  actorEmail: string;
}) {
  const store = await readStore();
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
  await writeStore(store);
  return trip.essentials;
}

export async function getRunningActiveTrip() {
  const store = await readStore();
  const trip = store.trips.find((t) => t.status === 'active') || store.trips.find((t) => t.status === 'upcoming') || null;
  if (!trip) return null;
  const invite = store.trip_invites.find((i) => i.trip_id === trip.id && !i.is_revoked);
  return {
    id: trip.id,
    name: trip.name,
    destination: trip.destination,
    start_date: trip.start_date,
    end_date: trip.end_date,
    inviteToken: invite?.token || ''
  };
}

export async function smartVerifyLocalTourist(params: {
  inviteToken?: string;
  selectedTripId?: string;
  fullName: string;
  identifier: string;
  consentGranted?: boolean;
}) {
  const store = await readStore();
  const normName = normalizePassengerName(params.fullName);
  const rawId = (params.identifier || '').trim();
  const normPassport = normalizePassportNumber(rawId);
  const normPhone = normalizePhoneNumber(rawId);

  if (!normName || (!normPassport && !normPhone)) {
    return { ok: false as const, status: 400, error: 'Please enter your name and either your passport or mobile number.' };
  }

  let targetTripId = params.selectedTripId || '';
  if (!targetTripId && params.inviteToken) {
    const inv = store.trip_invites.find(
      (i) => i.token === params.inviteToken || i.invitation_code?.toLowerCase() === params.inviteToken?.toLowerCase()
    );
    if (!inv || inv.is_revoked || new Date(inv.expires_at).getTime() < Date.now()) {
      return { ok: false as const, status: 403, error: 'This invitation link is invalid, revoked, or expired.' };
    }
    targetTripId = inv.trip_id;
  }

  const activeTrips = store.trips.filter((t) => t.status === 'active' || t.status === 'upcoming');
  const activeIds = new Set(activeTrips.map((t) => t.id));

  const matches = store.passenger_roster.filter((r) => {
    if (!activeIds.has(r.trip_id)) return false;
    const nameMatch = r.normalized_name.includes(normName) || normName.includes(r.normalized_name);
    if (!nameMatch) return false;
    const pHash = normPassport ? hashSensitiveIdentifier(r.trip_id, normPassport) : '';
    const cHash = normPhone ? hashSensitiveIdentifier(r.trip_id, normPhone) : '';
    return (pHash && r.passport_hash === pHash) || (cHash && r.contact_hash === cHash);
  });

  if (matches.length === 0) {
    return {
      ok: false as const,
      status: 403,
      error: 'No matching passenger record found. Please check your name, mobile number, or passport number.'
    };
  }

  const inTarget = targetTripId ? matches.filter((m) => m.trip_id === targetTripId) : matches;
  const autoSwitched = Boolean(targetTripId && inTarget.length === 0 && matches.length > 0);
  const scopedMatches = inTarget.length > 0 ? inTarget : matches;

  if (scopedMatches.length > 1) {
    return {
      ok: false as const,
      status: 300,
      ambiguous: true,
      candidates: scopedMatches.map((m) => ({
        tripId: m.trip_id,
        tripName: activeTrips.find((t) => t.id === m.trip_id)?.name || 'Tour',
        subgroup: m.subgroup_name,
        maskedName: m.full_name_display
      })),
      error: 'Multiple passenger records matched. Please enter your full name and exact phone or passport.'
    };
  }

  const matchedRoster = scopedMatches[0];
  const matchedTrip = activeTrips.find((t) => t.id === matchedRoster.trip_id)!;
  const now = new Date().toISOString();
  const rawSessionId = crypto.randomUUID();
  const sessionHash = hashSessionToken(rawSessionId);

  let member = matchedRoster.claimed_member_id
    ? store.trip_members.find((m) => m.id === matchedRoster.claimed_member_id)
    : undefined;

  if (member) {
    member.session_token_hash = sessionHash;
    member.session_revoked = false;
    member.last_seen_at = now;
  } else {
    const memberId = crypto.randomUUID();
    const touristCode = `LTT-${String(matchedRoster.serial_no).padStart(3, '0')}`;
    member = {
      id: memberId,
      trip_id: matchedTrip.id,
      roster_id: matchedRoster.id,
      tourist_code: touristCode,
      display_name: matchedRoster.full_name_display,
      subgroup_name: matchedRoster.subgroup_name || 'Main Group',
      contact_info: matchedRoster.contact_number_admin,
      passport_masked: matchedRoster.passport_masked,
      sharing_enabled: params.consentGranted === true,
      session_token_hash: sessionHash,
      session_revoked: false,
      joined_at: now,
      last_seen_at: now
    };
    store.trip_members.push(member);
    matchedRoster.is_claimed = true;
    matchedRoster.claimed_member_id = memberId;
    matchedRoster.claimed_at = now;
  }

  store.audit_logs.unshift({
    id: crypto.randomUUID(),
    trip_id: matchedTrip.id,
    actor_label: `${member.display_name} (${member.tourist_code})`,
    action: 'PASSENGER_LOGIN',
    details: { auto_switched: autoSwitched },
    created_at: now
  });

  await writeStore(store);
  return {
    ok: true as const,
    status: 200,
    sessionId: rawSessionId,
    tripId: matchedTrip.id,
    tripName: matchedTrip.name,
    autoSwitched,
    member
  };
}
