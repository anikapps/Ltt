import crypto from 'crypto';
import { getSupabaseAdminClient } from './supabase';
import { MAX_PASSENGERS_PER_TRIP, clampPassengerCapacity } from './capacity';
import {
  normalizePassengerName,
  normalizePassportNumber,
  normalizePhoneNumber,
  maskPassportNumber,
  hashSensitiveIdentifier
} from './normalization';
import { hashSessionToken } from './session';
import { getDistanceMeters } from './geo';
import { ParsedRosterEntry } from './roster-parser';
import type {
  Trip,
  TripStatus,
  TripEssentialHub,
  SharingStatus,
  AlertStatus,
  AssistanceCategory,
  AssistancePriority,
  ChatReaction
} from '@/types/lttbd';

function computeEffectiveStatus(
  sharingEnabled: boolean,
  loc: { sharing_status?: string; updated_at?: string; captured_at?: string } | undefined,
  staleThresholdSec = 240
): SharingStatus {
  if (!sharingEnabled) return 'disabled';
  if (!loc) return 'unavailable';
  if (loc.sharing_status === 'disabled') return 'disabled';
  if (loc.sharing_status === 'unavailable') return 'unavailable';
  const ts = loc.updated_at || loc.captured_at;
  if (!ts) return 'unavailable';
  const ageSeconds = (Date.now() - new Date(ts).getTime()) / 1000;
  return ageSeconds > staleThresholdSec ? 'offline' : 'sharing';
}

function isResolvedStatus(st: string): boolean {
  return ['resolved', 'Resolved', 'Closed', 'Cancelled'].includes(st);
}

export async function pgAppendAuditLog(params: {
  tripId: string | null;
  actorLabel: string;
  action: string;
  details?: Record<string, unknown>;
}) {
  const sb = getSupabaseAdminClient();
  if (!sb) return;
  await sb.from('audit_logs').insert({
    trip_id: params.tripId,
    actor_label: params.actorLabel,
    action: params.action,
    details: params.details || {}
  });
}

export async function pgGetAdminDashboardSummary(adminEmail: string, adminRole: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const isSuperAdmin = adminRole === 'super_admin' || adminRole === 'main_admin';

  const [{ data: trips }, { data: roster }, { data: members }, { data: locs }, { data: alerts }, { data: assignments }] =
    await Promise.all([
      sb.from('trips').select('*').order('created_at', { ascending: false }),
      sb.from('passenger_roster').select('id, trip_id'),
      sb.from('trip_members').select('id, trip_id, sharing_enabled'),
      sb.from('latest_locations').select('member_id, trip_id, sharing_status, captured_at'),
      sb.from('assistance_requests').select('*').order('created_at', { ascending: false }),
      sb.from('organizer_assignments').select('trip_id, admin_email, role')
    ]);

  let visibleTrips = trips || [];
  if (!isSuperAdmin && adminEmail) {
    const assignedIds = new Set(
      (assignments || [])
        .filter((a) => a.admin_email?.toLowerCase() === adminEmail.toLowerCase())
        .map((a) => a.trip_id)
    );
    if (assignedIds.size > 0) {
      visibleTrips = visibleTrips.filter((t) => assignedIds.has(t.id));
    }
  }

  const tripMap = new Map(visibleTrips.map((t) => [t.id, t]));
  const locMap = new Map((locs || []).map((l) => [l.member_id, l]));
  let currentlySharing = 0;
  let stoppedSharing = 0;
  let offlineTourists = 0;

  for (const m of members || []) {
    const trip = tripMap.get(m.trip_id);
    if (!trip) continue;
    const loc = locMap.get(m.id);
    const eff = computeEffectiveStatus(
      Boolean(m.sharing_enabled),
      loc ? { sharing_status: loc.sharing_status, updated_at: loc.captured_at } : undefined,
      trip.stale_threshold_seconds || 240
    );
    if (eff === 'sharing') currentlySharing++;
    else if (eff === 'disabled') stoppedSharing++;
    else offlineTourists++;
  }

  const activeAlerts = (alerts || []).filter((a) => !isResolvedStatus(a.status) && tripMap.has(a.trip_id));

  // Canonical dashboard metrics — identical keys to the local repository summary
  // so the admin dashboard renders the same 8 KPI cards in both modes.
  const upcomingTrips = visibleTrips.filter((t) => t.status === 'upcoming').length;
  const completedTrips = visibleTrips.filter((t) => t.status === 'completed').length;

  return {
    mode: 'supabase' as const,
    role: adminRole,
    metrics: {
      totalActiveTrips: visibleTrips.filter((t) => t.status === 'active').length,
      upcomingTrips,
      completedTrips,
      totalRegisteredTourists: (members || []).filter((m) => tripMap.has(m.trip_id)).length,
      currentlySharing,
      stoppedSharing,
      offlineTourists,
      activeEmergencyRequests: activeAlerts.length
    },
    trips: visibleTrips.map((t) => ({
      ...t,
      rosterCount: (roster || []).filter((r) => r.trip_id === t.id).length,
      joinedCount: (members || []).filter((m) => m.trip_id === t.id).length,
      activeAlertCount: activeAlerts.filter((a) => a.trip_id === t.id).length
    })),
    activeAlerts: activeAlerts.map((a) => ({
      ...a,
      display_name: a.passenger_name,
      message: a.description || '',
      note: a.description || ''
    }))
  };
}

export async function pgCreateNewTrip(params: {
  name: string;
  destination: string;
  start_date: string;
  end_date: string;
  max_tourists: number;
  organizer_contact: string;
  require_passport?: boolean;
  adminEmail: string;
  adminName: string;
}) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const cap = clampPassengerCapacity(params.max_tourists, MAX_PASSENGERS_PER_TRIP);
  const essentials: TripEssentialHub = {
    hotel_name: '',
    hotel_address: '',
    hotel_phone: '',
    airport_name: '',
    airport_terminal: '',
    organizer_hotline: params.organizer_contact || '',
    local_emergency_police: '',
    local_emergency_medical: '',
    embassy_name: '',
    embassy_phone: '',
    destination_tips: '',
    flights: [],
    checklist: [
      { id: crypto.randomUUID(), label: 'Passport & printed visa copy', category: 'Documents', required: true },
      { id: crypto.randomUUID(), label: 'Return flight ticket & hotel voucher', category: 'Documents', required: true },
      { id: crypto.randomUUID(), label: 'International roaming / eSIM active', category: 'Connectivity', required: false }
    ],
    itinerary: []
  };

  const { data: trip, error } = await sb
    .from('trips')
    .insert({
      name: params.name.trim(),
      destination: params.destination.trim(),
      start_date: params.start_date,
      end_date: params.end_date,
      max_tourists: cap,
      status: 'active',
      organizer_contact: params.organizer_contact || '',
      stale_threshold_seconds: 240,
      update_interval_seconds: 45,
      retention_days: 7,
      separation_threshold_meters: 500,
      require_passport: Boolean(params.require_passport),
      essentials
    })
    .select('*')
    .single();

  if (error || !trip) throw new Error(error?.message || 'Failed to create trip in Supabase.');

  const slug = params.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'ltt-trip';
  const token = `${slug}-${crypto.randomUUID().slice(0, 8)}`;

  const [{ data: invite }] = await Promise.all([
    sb
      .from('trip_invitations')
      .insert({
        trip_id: trip.id,
        token,
        invitation_code: token.slice(-8).toUpperCase(),
        is_revoked: false,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
      })
      .select('*')
      .single(),
    sb.from('organizer_assignments').insert({
      trip_id: trip.id,
      admin_email: params.adminEmail.toLowerCase(),
      admin_name: params.adminName || params.adminEmail,
      role: 'super_admin'
    }),
    pgAppendAuditLog({
      tripId: trip.id,
      actorLabel: params.adminEmail,
      action: 'TRIP_CREATED',
      details: { name: trip.name, max_tourists: cap }
    })
  ]);

  return { trip, invite };
}

export async function pgGetAdminTripDetail(tripId: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const { data: trip } = await sb.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) return null;

  const [
    { data: admins },
    { data: invites },
    { data: roster },
    { data: members },
    { data: locs },
    { data: alerts },
    { data: meetingPoints },
    { data: headcounts },
    { data: hcResponses },
    { data: announcements },
    { data: annReceipts },
    { data: groupMessages },
    { data: auditLogs }
  ] = await Promise.all([
    sb.from('organizer_assignments').select('*').eq('trip_id', tripId).order('added_at', { ascending: true }),
    sb.from('trip_invitations').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    sb.from('passenger_roster').select('*').eq('trip_id', tripId).order('serial_no', { ascending: true }),
    sb.from('trip_members').select('*').eq('trip_id', tripId),
    sb.from('latest_locations').select('*').eq('trip_id', tripId),
    sb.from('assistance_requests').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    sb.from('meeting_points').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    sb.from('headcount_sessions').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    sb.from('headcount_responses').select('*'),
    sb.from('announcements').select('*').or(`trip_id.eq.${tripId},trip_id.is.null`).order('created_at', { ascending: false }),
    sb.from('announcement_receipts').select('*'),
    sb.from('group_messages').select('*').eq('trip_id', tripId).order('created_at', { ascending: true }).limit(200),
    sb.from('audit_logs').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(80)
  ]);

  const alertIds = (alerts || []).map((a) => a.id);
  const { data: sosMessages } = alertIds.length
    ? await sb.from('assistance_messages').select('*').in('request_id', alertIds).order('created_at', { ascending: true })
    : { data: [] };

  const memberMap = new Map((members || []).map((m) => [m.id, m]));
  const locMap = new Map((locs || []).map((l) => [l.member_id, l]));
  const activeAlerts = (alerts || []).filter((a) => !isResolvedStatus(a.status));
  const activeMp = (meetingPoints || []).find((mp) => mp.is_active) || (meetingPoints || [])[0];
  const sepThreshold = trip.separation_threshold_meters || 500;

  const passengers = (roster || []).map((r) => {
    const member = (members || []).find((m) => m.id === r.claimed_member_id || m.roster_id === r.id);
    const loc = member ? locMap.get(member.id) : undefined;
    const effectiveStatus = member
      ? computeEffectiveStatus(
          Boolean(member.sharing_enabled),
          loc ? { sharing_status: loc.sharing_status, updated_at: loc.captured_at } : undefined,
          trip.stale_threshold_seconds || 240
        )
      : ('not_joined' as const);
    const openAlert = member ? activeAlerts.find((a) => a.member_id === member.id) : undefined;
    const dist =
      activeMp && loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
        ? getDistanceMeters(loc.latitude, loc.longitude, activeMp.latitude, activeMp.longitude)
        : null;

    return {
      roster_id: r.id,
      member_id: member?.id || '',
      serial_no: r.serial_no,
      tourist_code: member?.tourist_code || `LTT-${String(r.serial_no).padStart(3, '0')}`,
      full_name_display: r.full_name_display,
      display_name: member?.display_name || r.full_name_display,
      subgroup_name: member?.subgroup_name || r.subgroup_name || 'Main Group',
      passport_masked: r.passport_masked,
      contact_number_admin: r.contact_number_admin,
      is_claimed: Boolean(r.is_claimed),
      joined_at: member?.joined_at || null,
      sharing_enabled: Boolean(member?.sharing_enabled),
      effective_status: effectiveStatus,
      latitude: loc?.latitude ?? null,
      longitude: loc?.longitude ?? null,
      accuracy: loc?.accuracy ?? null,
      last_seen_at: loc?.captured_at || member?.last_seen_at || null,
      location_updated_at: loc?.captured_at || null,
      has_active_alert: Boolean(openAlert),
      active_alert_id: openAlert?.id || null,
      outside_safe_zone: dist !== null && dist > (activeMp?.radius_meters || sepThreshold),
      possible_separation: dist !== null && dist > sepThreshold,
      distance_from_meeting_meters: dist,
      emergency_contact: member?.emergency_contact || null
    };
  });

  const hydratedHeadcounts = (headcounts || []).map((hc) => ({
    ...hc,
    responses: (hcResponses || [])
      .filter((resp) => resp.session_id === hc.id)
      .map((resp) => {
        const m = memberMap.get(resp.member_id);
        return {
          member_id: resp.member_id,
          tourist_code: m?.tourist_code || 'LTT',
          display_name: m?.display_name || 'Passenger',
          subgroup_name: m?.subgroup_name || 'Main Group',
          status: resp.status,
          latitude: resp.latitude,
          longitude: resp.longitude,
          responded_at: resp.responded_at
        };
      })
  }));

  const hydratedAnnouncements = (announcements || []).map((a) => ({
    ...a,
    read_by_member_ids: (annReceipts || [])
      .filter((r) => r.announcement_id === a.id)
      .map((r) => r.member_id)
  }));

  const hydratedAlerts = (alerts || []).map((a) => ({
    ...a,
    display_name: a.passenger_name,
    message: a.description || '',
    note: a.description || '',
    messages: (sosMessages || [])
      .filter((m) => m.request_id === a.id)
      .map((m) => ({
        id: m.id,
        sender_role: m.sender_role === 'tourist' ? 'tourist' : 'admin',
        sender_name: m.sender_name,
        message: m.message,
        created_at: m.created_at
      }))
  }));

  const hydratedMps = (meetingPoints || []).map((mp) => ({
    ...mp,
    description: mp.notes || '',
    scheduled_time: mp.scheduled_at || null
  }));

  // Canonical stats — same keys as the local repository detail payload so the
  // admin console KPI cards and directory filters work in both modes.
  const stats = {
    rosterTotal: (roster || []).length,
    registeredCount: (members || []).length,
    sharingCount: passengers.filter((p) => p.effective_status === 'sharing').length,
    disabledCount: passengers.filter((p) => p.effective_status === 'disabled').length,
    offlineCount: passengers.filter(
      (p) => p.effective_status === 'offline' || p.effective_status === 'unavailable'
    ).length,
    separatedCount: passengers.filter((p) => p.possible_separation).length,
    activeAlertsCount: activeAlerts.length
  };

  return {
    trip: {
      ...trip,
      // Expose the essentials itinerary at the top level so the itinerary
      // builder tab reads the same field in both storage modes.
      itinerary: Array.isArray(trip.essentials?.itinerary) ? trip.essentials.itinerary : []
    },
    admins: admins || [],
    invites: invites || [],
    passengers,
    alerts: hydratedAlerts,
    meetingPoints: hydratedMps,
    headcounts: hydratedHeadcounts,
    announcements: hydratedAnnouncements,
    groupMessages: groupMessages || [],
    logs: auditLogs || [],
    stats
  };
}

export async function pgSaveImportedRoster(params: {
  tripId: string;
  entries: ParsedRosterEntry[];
  actorEmail: string;
}) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const { data: trip } = await sb.from('trips').select('id, max_tourists').eq('id', params.tripId).maybeSingle();
  if (!trip) throw new Error('Trip not found.');

  const cap = clampPassengerCapacity(trip.max_tourists, MAX_PASSENGERS_PER_TRIP);
  if (params.entries.length > cap) {
    throw new Error(`Roster exceeds this trip's ${cap}-passenger capacity limit.`);
  }

  await sb.from('passenger_roster').delete().eq('trip_id', params.tripId);

  const rows = params.entries.map((entry) => {
    const normName = normalizePassengerName(entry.fullName);
    const normPassport = normalizePassportNumber(entry.passportNumber);
    const normPhone = normalizePhoneNumber(entry.contactNumber);
    return {
      trip_id: params.tripId,
      serial_no: entry.serialNo,
      full_name_display: entry.fullName,
      normalized_name: normName,
      passport_hash: normPassport ? hashSensitiveIdentifier(params.tripId, normPassport) : '',
      passport_masked: maskPassportNumber(normPassport),
      contact_hash: normPhone ? hashSensitiveIdentifier(params.tripId, normPhone) : '',
      contact_number_admin: normPhone || entry.contactNumber || '',
      subgroup_name: entry.subgroupName || 'Main Group',
      is_claimed: false
    };
  });

  if (rows.length > 0) {
    const { error } = await sb.from('passenger_roster').insert(rows);
    if (error) throw new Error(error.message);
  }

  await pgAppendAuditLog({
    tripId: params.tripId,
    actorLabel: params.actorEmail,
    action: 'ROSTER_IMPORTED',
    details: { count: rows.length }
  });

  return { importedCount: rows.length };
}

export async function pgSmartVerifyTourist(params: {
  inviteToken?: string;
  fullName: string;
  identifier: string;
  passportNumber?: string;
  contactNumber?: string;
  emergencyContact?: string;
  consentGranted?: boolean;
  rememberMe?: boolean;
}) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const normName = normalizePassengerName(params.fullName);
  const rawId = (params.identifier || '').trim();
  const rawPassport = (params.passportNumber || rawId).trim();
  const rawPhone = (params.contactNumber || rawId).trim();
  const normPassport = normalizePassportNumber(rawPassport);
  const normPhone = normalizePhoneNumber(rawPhone);

  if (!normName || (!normPassport && !normPhone)) {
    return { ok: false as const, status: 400, error: 'Please enter your name and either your passport or mobile number.' };
  }

  let targetTripId: string | null = null;
  if (params.inviteToken) {
    const { data: inv } = await sb
      .from('trip_invitations')
      .select('*')
      .or(`token.eq.${params.inviteToken},invitation_code.eq.${params.inviteToken.toUpperCase()}`)
      .maybeSingle();

    if (!inv || inv.is_revoked || new Date(inv.expires_at).getTime() < Date.now()) {
      return { ok: false as const, status: 403, error: 'This invitation link is invalid, revoked, or expired.' };
    }
    targetTripId = inv.trip_id;
  }

  // Search across all active/upcoming trips so we can detect wrong-trip joins & support 2-field login
  const { data: activeTrips } = await sb
    .from('trips')
    .select('id, name, destination, start_date, end_date, status')
    .in('status', ['active', 'upcoming']);

  const tripIds = (activeTrips || []).map((t) => t.id);
  if (tripIds.length === 0) {
    return { ok: false as const, status: 404, error: 'No active trips are currently open for joining.' };
  }

  const { data: allRosters } = await sb.from('passenger_roster').select('*').in('trip_id', tripIds);

  const matches = (allRosters || []).filter((r) => {
    // Allow partial name search (or exact)
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
      error: 'No matching passenger record found. Please check your spelling, passport number, or registered mobile number.'
    };
  }

  // If user is not in the currently selected/running trip, automatically switch to their matched active trip
  const inTarget = targetTripId ? matches.filter((m) => m.trip_id === targetTripId) : matches;
  const autoSwitched = Boolean(targetTripId && inTarget.length === 0 && matches.length > 0);
  const scopedMatches = inTarget.length > 0 ? inTarget : matches;

  // Safe disambiguation if multiple records match (never leak PII)
  if (scopedMatches.length > 1) {
    return {
      ok: false as const,
      status: 300,
      ambiguous: true,
      candidates: scopedMatches.map((m) => {
        const t = (activeTrips || []).find((tr) => tr.id === m.trip_id);
        return {
          tripId: m.trip_id,
          tripName: t?.name || 'Tour',
          subgroup: m.subgroup_name,
          maskedName: m.full_name_display
        };
      }),
      error: 'Multiple passenger records matched. Please enter your full name and exact phone or passport number.'
    };
  }

  const matchedRoster = scopedMatches[0];
  const matchedTrip = (activeTrips || []).find((t) => t.id === matchedRoster.trip_id)!;
  const now = new Date().toISOString();
  const rawSessionId = crypto.randomUUID();
  const sessionHash = hashSessionToken(rawSessionId);

  let memberRecord;
  if (matchedRoster.is_claimed && matchedRoster.claimed_member_id) {
    const { data: existing } = await sb
      .from('trip_members')
      .select('*')
      .eq('id', matchedRoster.claimed_member_id)
      .maybeSingle();

    if (existing) {
      await sb
        .from('trip_members')
        .update({
          session_token_hash: sessionHash,
          session_revoked: false,
          last_seen_at: now
        })
        .eq('id', existing.id);
      memberRecord = existing;
    }
  }

  if (!memberRecord) {
    const touristCode = `LTT-${String(matchedRoster.serial_no).padStart(3, '0')}`;
    const { data: created, error: createErr } = await sb
      .from('trip_members')
      .insert({
        trip_id: matchedRoster.trip_id,
        roster_id: matchedRoster.id,
        tourist_code: touristCode,
        full_name: matchedRoster.full_name_display,
        display_name: matchedRoster.full_name_display,
        subgroup_name: matchedRoster.subgroup_name || 'Main Group',
        contact_info: matchedRoster.contact_number_admin,
        passport_masked: matchedRoster.passport_masked,
        emergency_contact: params.emergencyContact || null,
        sharing_enabled: params.consentGranted === true,
        session_token_hash: sessionHash,
        session_revoked: false,
        joined_at: now,
        last_seen_at: now
      })
      .select('*')
      .single();

    if (createErr || !created) {
      throw new Error(createErr?.message || 'Failed to register passenger session.');
    }

    await sb
      .from('passenger_roster')
      .update({
        is_claimed: true,
        claimed_member_id: created.id,
        claimed_at: now
      })
      .eq('id', matchedRoster.id);

    memberRecord = created;
  }

  await pgAppendAuditLog({
    tripId: matchedRoster.trip_id,
    actorLabel: `${memberRecord.display_name} (${memberRecord.tourist_code})`,
    action: 'PASSENGER_LOGIN',
    details: { subgroup: memberRecord.subgroup_name, consent_granted: Boolean(memberRecord.sharing_enabled) }
  });

  let rememberInfo: { maskedIdentifier: string; deviceTokenHash: string } | null = null;
  if (params.rememberMe) {
    const rawDevToken = crypto.randomUUID();
    const deviceTokenHash = hashSessionToken(rawDevToken);
    const maskedIdentifier = normPhone
      ? `${normPhone.slice(0, 6)}****${normPhone.slice(-2)}`
      : matchedRoster.passport_masked;

    await sb.from('remembered_devices').insert({
      trip_id: matchedRoster.trip_id,
      member_id: memberRecord.id,
      device_token_hash: deviceTokenHash,
      masked_identifier: maskedIdentifier
    });
    rememberInfo = { maskedIdentifier, deviceTokenHash };
  }

  return {
    ok: true as const,
    sessionId: rawSessionId,
    tripId: matchedTrip.id,
    tripName: matchedTrip.name,
    autoSwitched,
    member: memberRecord,
    rememberInfo
  };
}

export async function pgGetTouristState(tripId: string, memberId: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const [{ data: trip }, { data: me }] = await Promise.all([
    sb.from('trips').select('*').eq('id', tripId).maybeSingle(),
    sb.from('trip_members').select('*').eq('id', memberId).eq('trip_id', tripId).maybeSingle()
  ]);

  if (!trip || !me || me.session_revoked) return null;

  const [
    { data: members },
    { data: locs },
    { data: mps },
    { data: anns },
    { data: receipts },
    { data: hcs },
    { data: hcResps },
    { data: chatMsgs },
    { data: myAlerts },
    { data: notifs }
  ] = await Promise.all([
    sb.from('trip_members').select('id, tourist_code, display_name, subgroup_name, sharing_enabled, last_seen_at, session_revoked').eq('trip_id', tripId),
    sb.from('latest_locations').select('member_id, latitude, longitude, accuracy, sharing_status, captured_at').eq('trip_id', tripId),
    sb.from('meeting_points').select('*').eq('trip_id', tripId).eq('is_active', true),
    sb.from('announcements').select('*').or(`trip_id.eq.${tripId},trip_id.is.null`).eq('is_archived', false).order('created_at', { ascending: false }),
    sb.from('announcement_receipts').select('announcement_id, member_id').eq('member_id', memberId),
    sb.from('headcount_sessions').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }),
    sb.from('headcount_responses').select('*').eq('member_id', memberId),
    sb.from('group_messages').select('*').eq('trip_id', tripId).is('deleted_at', null).order('created_at', { ascending: true }).limit(120),
    sb.from('assistance_requests').select('*').eq('trip_id', tripId).eq('member_id', memberId).order('created_at', { ascending: false }),
    sb.from('notification_events').select('*').eq('trip_id', tripId).order('created_at', { ascending: false }).limit(25)
  ]);

  const locMap = new Map((locs || []).map((l) => [l.member_id, l]));
  const staleSec = trip.stale_threshold_seconds || 240;

  // Never expose passport or phone PII to fellow tourists; keep last known coords with timestamp
  const peers = (members || [])
    .filter((m) => !m.session_revoked)
    .map((m) => {
      const loc = locMap.get(m.id);
      const eff = computeEffectiveStatus(
        Boolean(m.sharing_enabled),
        loc ? { sharing_status: loc.sharing_status, updated_at: loc.captured_at } : undefined,
        staleSec
      );
      return {
        member_id: m.id,
        tourist_code: m.tourist_code,
        display_name: m.display_name,
        subgroup_name: m.subgroup_name,
        sharing_enabled: Boolean(m.sharing_enabled),
        effective_status: eff,
        latitude: loc?.latitude ?? null,
        longitude: loc?.longitude ?? null,
        accuracy: loc?.accuracy ?? null,
        last_seen_at: loc?.captured_at || m.last_seen_at || null,
        location_updated_at: loc?.captured_at || null,
        is_me: m.id === me.id
      };
    });

  const myPeer = peers.find((p) => p.member_id === me.id) || null;
  const readAnnIds = new Set((receipts || []).map((r) => r.announcement_id));

  return {
    trip: {
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      start_date: trip.start_date,
      end_date: trip.end_date,
      organizer_contact: trip.organizer_contact || '',
      update_interval_seconds: trip.update_interval_seconds || 45,
      stale_threshold_seconds: staleSec,
      retention_days: trip.retention_days || 7,
      status: trip.status,
      itinerary: Array.isArray(trip.essentials?.itinerary) ? trip.essentials.itinerary : [],
      essentials: trip.essentials || {}
    },
    // `id` and `member_id` are the same value; different pages read either name.
    me: myPeer ? { ...myPeer, id: me.id } : {
      id: me.id,
      member_id: me.id,
      tourist_code: me.tourist_code,
      display_name: me.display_name,
      subgroup_name: me.subgroup_name,
      sharing_enabled: Boolean(me.sharing_enabled),
      effective_status: computeEffectiveStatus(Boolean(me.sharing_enabled), undefined, staleSec),
      latitude: null,
      longitude: null,
      accuracy: null,
      last_seen_at: me.last_seen_at || null,
      location_updated_at: null,
      is_me: true
    },
    peers,
    meetingPoints: (mps || []).map((mp) => ({
      ...mp,
      description: mp.notes || '',
      scheduled_time: mp.scheduled_at || null
    })),
    announcements: (anns || []).map((a) => ({
      ...a,
      read_by_member_ids: readAnnIds.has(a.id) ? [me.id] : []
    })),
    headcounts: (hcs || []).map((hc) => ({
      ...hc,
      responses: (hcResps || [])
        .filter((r) => r.session_id === hc.id)
        .map((r) => {
          const m = (members || []).find((mm) => mm.id === r.member_id);
          return {
            member_id: r.member_id,
            tourist_code: m?.tourist_code || 'LTT',
            display_name: m?.display_name || 'Passenger',
            subgroup_name: m?.subgroup_name || 'Main Group',
            status: r.status,
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
            responded_at: r.responded_at
          };
        })
    })),
    groupMessages: chatMsgs || [],
    notifications: notifs || [],
    myAlerts: (myAlerts || []).map((a) => ({
      ...a,
      display_name: a.passenger_name,
      message: a.description || '',
      note: a.description || ''
    }))
  };
}

export async function pgUpsertTouristLocation(params: {
  tripId: string;
  memberId: string;
  sharingEnabled?: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  source?: string;
  permissionStatus?: string;
  statusOverride?: 'sharing' | 'disabled' | 'unavailable';
}) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const now = new Date().toISOString();
  const { data: member } = await sb
    .from('trip_members')
    .select('id, display_name, tourist_code, sharing_enabled')
    .eq('id', params.memberId)
    .eq('trip_id', params.tripId)
    .maybeSingle();

  if (!member) throw new Error('Member not found.');

  const nextSharing = typeof params.sharingEnabled === 'boolean' ? params.sharingEnabled : Boolean(member.sharing_enabled);

  await sb
    .from('trip_members')
    .update({
      sharing_enabled: nextSharing,
      last_seen_at: now,
      ...(typeof params.sharingEnabled === 'boolean' ? { consent_updated_at: now } : {})
    })
    .eq('id', params.memberId);

  if (typeof params.sharingEnabled === 'boolean') {
    await sb.from('location_consents').insert({
      trip_id: params.tripId,
      member_id: params.memberId,
      consent_granted: params.sharingEnabled
    });
    await pgAppendAuditLog({
      tripId: params.tripId,
      actorLabel: `${member.display_name} (${member.tourist_code})`,
      action: 'LOCATION_CONSENT_CHANGED',
      details: { sharing_enabled: params.sharingEnabled, permission_status: params.permissionStatus || 'unknown' }
    });
  }

  if (typeof params.latitude === 'number' && typeof params.longitude === 'number') {
    await sb.from('latest_locations').upsert({
      member_id: params.memberId,
      trip_id: params.tripId,
      latitude: params.latitude,
      longitude: params.longitude,
      accuracy: typeof params.accuracy === 'number' ? params.accuracy : 0,
      sharing_status: nextSharing ? params.statusOverride || 'sharing' : 'disabled',
      location_source: params.source || 'gps',
      permission_status: params.permissionStatus || 'granted',
      captured_at: now,
      received_at: now
    });

    if (nextSharing) {
      await sb.from('location_history').insert({
        trip_id: params.tripId,
        member_id: params.memberId,
        latitude: params.latitude,
        longitude: params.longitude,
        accuracy: typeof params.accuracy === 'number' ? params.accuracy : 0,
        captured_at: now
      });
    }
  } else if (params.statusOverride === 'unavailable' && nextSharing) {
    // Browser could not provide a GPS fix: record an honest unavailable state
    // instead of silently keeping a stale sharing status.
    await sb
      .from('latest_locations')
      .update({ sharing_status: 'unavailable', received_at: now })
      .eq('member_id', params.memberId);
  } else if (params.sharingEnabled === false) {
    await sb
      .from('latest_locations')
      .update({ sharing_status: 'disabled', received_at: now })
      .eq('member_id', params.memberId);
  }

  return { sharing_enabled: nextSharing };
}

export async function pgChatOperation(params: {
  tripId: string;
  senderId: string;
  senderName: string;
  senderCode: string;
  senderRole: 'tourist' | 'admin';
  op: 'send' | 'react' | 'pin' | 'edit' | 'delete';
  message?: string;
  messageId?: string;
  emoji?: string;
  replyToId?: string | null;
  replyToPreview?: string | null;
  attachmentName?: string | null;
  attachmentUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;
  const now = new Date().toISOString();

  if (params.op === 'send') {
    const { data, error } = await sb
      .from('group_messages')
      .insert({
        trip_id: params.tripId,
        sender_id: params.senderId,
        sender_name: params.senderName,
        sender_code: params.senderCode,
        sender_role: params.senderRole,
        message: String(params.message || '').trim().slice(0, 1000),
        message_type: 'chat',
        reply_to_id: params.replyToId || null,
        reply_to_preview: params.replyToPreview || null,
        attachment_name: params.attachmentName || null,
        attachment_url: params.attachmentUrl || null,
        latitude: params.latitude ?? null,
        longitude: params.longitude ?? null
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    await pgAppendAuditLog({
      tripId: params.tripId,
      actorLabel: `${params.senderName} (${params.senderCode})`,
      action: 'CHAT_MESSAGE_SENT',
      details: { message_id: data.id }
    });
    return data;
  }

  if (!params.messageId) throw new Error('Missing messageId.');

  if (params.op === 'react' && params.emoji) {
    const { data: msg } = await sb.from('group_messages').select('reactions').eq('id', params.messageId).maybeSingle();
    const reactions: ChatReaction[] = Array.isArray(msg?.reactions) ? msg.reactions : [];
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
    const cleaned = reactions.filter((r) => r.member_ids.length > 0);
    await sb.from('group_messages').update({ reactions: cleaned }).eq('id', params.messageId);
    return { reactions: cleaned };
  }

  if (params.op === 'pin' && params.senderRole === 'admin') {
    const { data: msg } = await sb.from('group_messages').select('is_pinned').eq('id', params.messageId).maybeSingle();
    await sb.from('group_messages').update({ is_pinned: !msg?.is_pinned }).eq('id', params.messageId);
    return { is_pinned: !msg?.is_pinned };
  }

  if (params.op === 'edit' && params.message) {
    await sb
      .from('group_messages')
      .update({ message: params.message.trim().slice(0, 1000), edited_at: now })
      .eq('id', params.messageId)
      .eq('sender_id', params.senderId);
    return { edited: true };
  }

  if (params.op === 'delete') {
    const q = sb.from('group_messages').update({ deleted_at: now }).eq('id', params.messageId);
    if (params.senderRole !== 'admin') {
      await q.eq('sender_id', params.senderId);
    } else {
      await q;
    }
    return { deleted: true };
  }

  return null;
}

export async function pgReviveTrip(tripId: string, actorEmail: string) {
  const sb = getSupabaseAdminClient();
  if (!sb) return null;

  const now = new Date().toISOString();
  const { data: trip } = await sb.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) throw new Error('Trip not found.');

  await sb
    .from('trips')
    .update({ status: 'active' as TripStatus, ended_at: null, archived_at: null })
    .eq('id', tripId);

  // Security rule: Reviving an old tour MUST NOT reactivate old sessions, sharing consents, or old invites.
  await Promise.all([
    sb.from('trip_members').update({ sharing_enabled: false, session_revoked: true }).eq('trip_id', tripId),
    sb.from('trip_invitations').update({ is_revoked: true }).eq('trip_id', tripId)
  ]);

  const slug = trip.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'ltt-trip';
  const freshToken = `${slug}-revived-${crypto.randomUUID().slice(0, 6)}`;
  const { data: newInvite } = await sb
    .from('trip_invitations')
    .insert({
      trip_id: tripId,
      token: freshToken,
      invitation_code: freshToken.slice(-8).toUpperCase(),
      is_revoked: false,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()
    })
    .select('*')
    .single();

  await pgAppendAuditLog({
    tripId,
    actorLabel: actorEmail,
    action: 'TRIP_REVIVED',
    details: { fresh_invite_token: freshToken, old_sessions_revoked: true }
  });

  return { tripId, newInvite };
}
