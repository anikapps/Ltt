#!/usr/bin/env node
/**
 * LTT BD — end-to-end smoke test against a running dev server (local JSON store mode).
 * Exercises every admin + tourist API action that was repaired, asserting canonical shapes.
 *
 * Usage: node /home/z/my-project/scripts/smoke-test-ltt.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://localhost:3111';
const SEED_TRIP_ID = '11111111-2222-3333-4444-555555555555';
const INVITE_TOKEN = 'malaysia-tour-2026-invite';

let passed = 0;
let failed = 0;
function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${name}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${name} ${extra}`);
  }
}

const adminCookies = new Map();
const touristCookies = new Map();

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function captureCookies(jar, res) {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const raw of setCookies) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === '') jar.delete(name);
      else jar.set(name, value);
    }
  }
}

async function api(path, { method = 'GET', body, jar = adminCookies, form } = {}) {
  const headers = {};
  if (jar.size > 0) headers.cookie = cookieHeader(jar);
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined)
  });
  captureCookies(jar, res);
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function main() {
  console.log('----------------------------------------------------------------------------');
  console.log(`LTT BD smoke test against ${BASE} (local JSON store mode)`);
  console.log('----------------------------------------------------------------------------');

  // ---------- Admin auth ----------
  let r = await api('/api/admin/auth', {
    method: 'POST',
    body: { email: 'ops@lttbd.local', password: 'LocalDevOnly#2026' }
  });
  check('admin login returns session', r.status === 200 && r.json?.admin?.email === 'ops@lttbd.local', JSON.stringify(r.json));

  // ---------- Dashboard ----------
  r = await api('/api/admin/trips');
  check('dashboard 200 with mode', r.status === 200 && r.json?.mode === 'local');
  const m = r.json?.metrics || {};
  check(
    'dashboard metrics canonical keys',
    ['totalActiveTrips', 'upcomingTrips', 'completedTrips', 'totalRegisteredTourists', 'currentlySharing', 'stoppedSharing', 'offlineTourists', 'activeEmergencyRequests'].every((k) => typeof m[k] === 'number'),
    JSON.stringify(m)
  );

  // ---------- Trip detail ----------
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`);
  check('trip detail 200', r.status === 200, JSON.stringify(r.json)?.slice(0, 200));
  const detail = r.json || {};
  check('detail has stats.rosterTotal + separatedCount', typeof detail.stats?.rosterTotal === 'number' && 'separatedCount' in detail.stats, JSON.stringify(detail.stats));
  check('detail passengers carry display_name / possible_separation / location_updated_at / has_active_alert', (() => {
    const p0 = detail.passengers?.[0] || {};
    return 'display_name' in p0 && 'possible_separation' in p0 && 'location_updated_at' in p0 && 'has_active_alert' in p0 && 'full_name_display' in p0;
  })());
  check('detail alerts/logs/groupMessages keys present', Array.isArray(detail.alerts) && Array.isArray(detail.logs) && Array.isArray(detail.groupMessages));

  // ---------- Admin actions ----------
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'update_settings', staleThresholdSeconds: 200, updateIntervalSeconds: 25, retentionDays: 9, separationThresholdMeters: 450, organizerContact: '+8801700000000' }
  });
  check('update_settings (camelCase) works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'create_meeting_point', title: 'Smoke Test Checkpoint', latitude: 3.1585, longitude: 101.712, radiusMeters: 280, notes: 'Created by smoke test', scheduledAt: new Date(Date.now() + 3600e3).toISOString() }
  });
  check('create_meeting_point works', r.status === 200, JSON.stringify(r.json));
  const mpCreated = r.json?.meetingPoint;

  r = await api(`/api/admin/trips/${SEEP_ID_FALLBACK()}`, { method: 'POST', body: {} }).catch(() => ({ status: 0 }));
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'manage_meeting_point', meetingPointId: mpCreated?.id, subAction: 'toggle' }
  });
  check('manage_meeting_point toggle works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'start_headcount', title: 'Smoke Roll Call', subgroupName: 'All' }
  });
  check('start_headcount works', r.status === 200, JSON.stringify(r.json));
  const hcId = r.json?.headcount?.id;

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'create_announcement', title: 'Smoke Announcement', body: 'Body from smoke test', subgroupName: 'Bus A', priority: 'important', destinations: ['essentials', 'notifications', 'chat'] }
  });
  check('create_announcement works with important priority', r.status === 200 && r.json?.announcement?.priority === 'important', JSON.stringify(r.json));
  const annId = r.json?.announcement?.id;

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, { method: 'POST', body: { action: 'generate_invite', revokeExisting: true } });
  check('generate_invite with revokeExisting works', r.status === 200 && r.json?.invite?.token, JSON.stringify(r.json));
  const newToken = r.json?.invite?.token;
  const newCode = r.json?.invite?.invitation_code;

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'manage_admin', subAction: 'add', targetEmail: 'guide@lttbd.local', targetName: 'Smoke Guide', role: 'tour_manager' }
  });
  check('manage_admin add works', r.status === 200, JSON.stringify(r.json));
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'manage_admin', subAction: 'remove', targetEmail: 'guide@lttbd.local' }
  });
  check('manage_admin remove works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'add_itinerary', dayLabel: 'Day 3 • 16 Nov 2026', timeLabel: '09:00 AM', title: 'Smoke Itinerary Item', locationName: 'Smoke Location', instructions: 'Smoke instructions' }
  });
  check('add_itinerary (camelCase) works', r.status === 200, JSON.stringify(r.json));
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`);
  const itItems = r.json?.trip?.itinerary || [];
  const smokeItem = itItems.find((i) => i.title === 'Smoke Itinerary Item');
  check('itinerary item visible on trip with instructions', Boolean(smokeItem) && smokeItem.instructions === 'Smoke instructions');
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, { method: 'POST', body: { action: 'delete_itinerary', itemId: smokeItem?.id } });
  check('delete_itinerary works', r.status === 200, JSON.stringify(r.json));

  // ---------- Tourist verify (2-field login) ----------
  r = await api('/api/tourist/verify', {
    method: 'POST',
    jar: touristCookies,
    body: { fullName: 'MD KARIM HOSSAIN', identifier: '01819887766', consentGranted: true }
  });
  check('tourist 2-field verify works', r.status === 200 && r.json?.verified === true, JSON.stringify(r.json));
  const touristTripId = r.json?.tripId;

  // ---------- Tourist state ----------
  r = await api(`/api/tourist/trip/${touristTripId}`, { jar: touristCookies });
  const state = r.json || {};
  check('tourist state 200', r.status === 200);
  check('me has id AND member_id', typeof state.me?.id === 'string' && state.me?.member_id === state.me?.id, JSON.stringify(state.me));
  check('peers carry is_me flags', Array.isArray(state.peers) && state.peers.some((p) => p.is_me === true));
  check('trip carries status + itinerary array', typeof state.trip?.status === 'string' && Array.isArray(state.trip?.itinerary));

  // ---------- Tourist actions ----------
  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'location_update', sharingEnabled: true, latitude: 3.158, longitude: 101.7125, accuracy: 10 }
  });
  check('location_update action accepted (GPS fix)', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'location_update', sharingEnabled: true, statusOverride: 'unavailable' }
  });
  check('location_update accepts statusOverride unavailable', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'toggle_sharing', sharingEnabled: true, latitude: 3.158, longitude: 101.7125, accuracy: 10 }
  });
  check('toggle_sharing re-enables sharing with GPS', r.status === 200 && r.json?.ok === true, JSON.stringify(r.json));

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'emergency_help', category: 'Medical assistance', note: 'Smoke SOS note', latitude: 3.158, longitude: 101.7125, accuracy: 10 }
  });
  check('emergency_help creates alert', r.status === 200 && r.json?.alert?.id, JSON.stringify(r.json));
  const alertId = r.json?.alert?.id;
  check('alert carries passenger_name + note + message', r.json?.alert?.passenger_name === 'MD KARIM HOSSAIN' && r.json?.alert?.note === 'Smoke SOS note' && typeof r.json?.alert?.message === 'string');

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'reply_sos', alertId, message: 'Tourist reply from smoke test' }
  });
  check('reply_sos works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'headcount_checkin', sessionId: hcId, status: 'present', latitude: 3.158, longitude: 101.7125 }
  });
  check('headcount_checkin works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'mark_announcement_read', announcementId: annId }
  });
  check('mark_announcement_read works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'send_group_chat', message: 'Smoke chat message' }
  });
  check('tourist send_group_chat works', r.status === 200 && r.json?.message?.id, JSON.stringify(r.json));
  const chatMsgId = r.json?.message?.id;

  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'chat_react', messageId: chatMsgId, emoji: '👍' }
  });
  check('chat_react works', r.status === 200, JSON.stringify(r.json));

  // ---------- Admin incident handling ----------
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'update_alert', alertId, status: 'Acknowledged', assignedResponder: 'Smoke Responder', internalNotes: 'internal' }
  });
  check('update_alert acknowledge works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'reply_alert', alertId, message: 'Operations reply from smoke test' }
  });
  check('admin reply_alert works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`);
  const ackAlert = (r.json?.alerts || []).find((a) => a.id === alertId);
  check('alert shows Acknowledged with messages thread', ackAlert?.status === 'Acknowledged' && Array.isArray(ackAlert?.messages) && ackAlert.messages.length >= 3, JSON.stringify(ackAlert)?.slice(0, 300));

  // ---------- Admin chat ----------
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, {
    method: 'POST',
    body: { action: 'send_group_chat', message: 'Admin ops message from smoke test' }
  });
  check('admin send_group_chat works', r.status === 200 && r.json?.message?.id, JSON.stringify(r.json));
  const adminMsgId = r.json?.message?.id;

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, { method: 'POST', body: { action: 'chat_pin', messageId: adminMsgId } });
  check('admin chat_pin works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/admin/trips/${SEED_TRIP_ID}`, { method: 'POST', body: { action: 'chat_edit', messageId: adminMsgId, message: 'Edited by smoke test' } });
  check('admin chat_edit works', r.status === 200, JSON.stringify(r.json));

  // ---------- Roster import (CSV) ----------
  const csv = [
    'SL,Passenger Name,Passport Number,Contact Number,Subgroup',
    '21,SMOKE TEST PASSENER A,XY1122334,01711000001,Bus A',
    '22,SMOKE TEST PASSENER B,XY2233445,01711000002,Bus B'
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'smoke-roster.csv');
  r = await api(`/api/admin/trips/${SEED_TRIP_ID}/roster`, { method: 'POST', form });
  check('roster CSV import returns importedCount', r.status === 200 && r.json?.importedCount === 2, JSON.stringify(r.json));

  // ---------- Tourist close SOS + logout ----------
  r = await api(`/api/tourist/trip/${touristTripId}`, {
    method: 'POST',
    jar: touristCookies,
    body: { action: 'close_sos', alertId }
  });
  check('tourist close_sos works', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/tourist/trip/${touristTripId}`, { method: 'POST', jar: touristCookies, body: { action: 'logout_tourist' } });
  check('tourist logout works', r.status === 200, JSON.stringify(r.json));

  // ---------- Archive / revive round-trip on a THROWAWAY trip ----------
  r = await api('/api/admin/trips', {
    method: 'POST',
    body: { name: 'Smoke Throwaway Trip', destination: 'Test City', start_date: '2026-12-01', end_date: '2026-12-05', max_tourists: 20 }
  });
  check('create trip works', r.status === 201 && r.json?.trip?.id, JSON.stringify(r.json));
  const throwId = r.json?.trip?.id;
  const throwToken = r.json?.invite?.token;

  r = await api(`/api/admin/trips/${throwId}`, { method: 'POST', body: { action: 'archive_trip' } });
  check('archive_trip works (local)', r.status === 200, JSON.stringify(r.json));

  r = await api(`/api/admin/trips/${throwId}`, { method: 'POST', body: { action: 'revive_trip' } });
  check('revive_trip works (local)', r.status === 200, JSON.stringify(r.json));

  // Revival must revoke old invites and issue a fresh one — resolve the new token.
  r = await api(`/api/admin/trips/${throwId}`);
  const revivedInvite = (r.json?.invites || []).find((i) => !i.is_revoked);
  check('revive issued a fresh unrevoked invite', Boolean(revivedInvite?.token), JSON.stringify(r.json?.invites));
  r = await api(`/api/tourist/verify?token=${encodeURIComponent(revivedInvite?.token || '')}`);
  check('verify GET by revived token resolves trip', r.status === 200 && r.json?.trip?.id === throwId, JSON.stringify(r.json));

  // ---------- Pages render ----------
  for (const path of ['/', '/join', '/admin', `/trip/${SEED_TRIP_ID}`, `/admin/trips/${SEED_TRIP_ID}`, '/manifest.json']) {
    const res = await fetch(`${BASE}${path}`);
    check(`GET ${path} renders (${res.status})`, res.status === 200);
  }

  console.log('----------------------------------------------------------------------------');
  console.log(`Smoke test complete: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------------------------------------------');
  process.exit(failed > 0 ? 1 : 0);
}

function SEEP_ID_FALLBACK() {
  return SEED_TRIP_ID;
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
