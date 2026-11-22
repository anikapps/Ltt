import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromCookies } from '@/lib/session';
import {
  getAdminTripDetail,
  generateOrRotateInviteLink,
  manageTripAdministrators,
  removePassengerFromTrip,
  endTripAndPurgePersonalData,
  updateEmergencyAlertStatus,
  addAssistanceMessage,
  createMeetingPoint,
  toggleOrDeleteMeetingPoint,
  startHeadcountSession,
  closeHeadcountSession,
  createAnnouncement,
  updateTripSettings,
  simulateTouristsForTrip,
  addTripItineraryItem,
  deleteTripItineraryItem,
  sendGroupChatMessage,
  updateTripEssentials
} from '@/lib/repository';

export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const admin = getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized administrator access.' }, { status: 401 });
  }

  const detail = await getAdminTripDetail(params.tripId, admin.email);
  if (!detail) {
    return NextResponse.json({ error: 'Trip not found.' }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const admin = getAdminSessionFromCookies();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized administrator access.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body.action || '');

    if (action === 'generate_invite') {
      const invite = await generateOrRotateInviteLink(
        params.tripId,
        Boolean(body.revokeExisting),
        admin.email
      );
      return NextResponse.json({ invite });
    }

    if (action === 'manage_admin') {
      const admins = await manageTripAdministrators({
        tripId: params.tripId,
        actorEmail: admin.email,
        action: body.subAction,
        targetEmail: String(body.targetEmail || ''),
        targetName: String(body.targetName || ''),
        role: body.role
      });
      return NextResponse.json({ admins });
    }

    if (action === 'remove_passenger') {
      await removePassengerFromTrip(params.tripId, String(body.rosterId || ''), admin.email);
      return NextResponse.json({ ok: true });
    }

    if (action === 'update_alert') {
      const updated = await updateEmergencyAlertStatus({
        alertId: String(body.alertId || ''),
        tripId: params.tripId,
        newStatus: body.status,
        assignedResponder: body.assignedResponder,
        internalNotes: body.internalNotes,
        resolutionNotes: body.resolutionNotes,
        actorEmail: admin.email
      });
      return NextResponse.json({ alert: updated });
    }

    if (action === 'reply_alert') {
      const updated = await addAssistanceMessage({
        tripId: params.tripId,
        alertId: String(body.alertId || ''),
        senderName: admin.name,
        senderRole: 'organizer',
        message: String(body.message || '')
      });
      return NextResponse.json({ alert: updated });
    }

    if (action === 'create_meeting_point') {
      const mp = await createMeetingPoint({
        tripId: params.tripId,
        title: String(body.title || ''),
        latitude: Number(body.latitude),
        longitude: Number(body.longitude),
        notes: String(body.notes || ''),
        scheduledAt: String(body.scheduledAt || ''),
        radiusMeters: Number(body.radiusMeters || 250),
        actorEmail: admin.email
      });
      return NextResponse.json({ meetingPoint: mp });
    }

    if (action === 'manage_meeting_point') {
      await toggleOrDeleteMeetingPoint({
        tripId: params.tripId,
        meetingPointId: String(body.meetingPointId || ''),
        subAction: body.subAction === 'delete' ? 'delete' : 'toggle',
        actorEmail: admin.email
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'start_headcount') {
      const hc = await startHeadcountSession({
        tripId: params.tripId,
        title: String(body.title || 'Group Roll Call'),
        subgroupName: String(body.subgroupName || 'All'),
        actorEmail: admin.name
      });
      return NextResponse.json({ headcount: hc });
    }

    if (action === 'close_headcount') {
      await closeHeadcountSession(params.tripId, String(body.sessionId || ''), admin.email);
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_announcement') {
      const ann = await createAnnouncement({
        tripId: params.tripId,
        title: String(body.title || ''),
        body: String(body.body || ''),
        subgroupName: String(body.subgroupName || 'All'),
        priority: body.priority || 'normal',
        actorEmail: admin.name
      });
      return NextResponse.json({ announcement: ann });
    }

    if (action === 'update_settings') {
      const trip = await updateTripSettings({
        tripId: params.tripId,
        staleThresholdSeconds: body.staleThresholdSeconds,
        updateIntervalSeconds: body.updateIntervalSeconds,
        retentionDays: body.retentionDays,
        separationThresholdMeters: body.separationThresholdMeters,
        organizerContact: body.organizerContact,
        actorEmail: admin.email
      });
      return NextResponse.json({ trip });
    }

    if (action === 'end_trip_and_purge') {
      const purgeSummary = await endTripAndPurgePersonalData(params.tripId, admin.email);
      return NextResponse.json({ purgeSummary });
    }

    if (action === 'add_itinerary') {
      const itinerary = await addTripItineraryItem({
        tripId: params.tripId,
        dayLabel: String(body.dayLabel || ''),
        timeLabel: String(body.timeLabel || ''),
        title: String(body.title || ''),
        locationName: String(body.locationName || ''),
        instructions: String(body.instructions || ''),
        actorEmail: admin.email
      });
      return NextResponse.json({ itinerary });
    }

    if (action === 'delete_itinerary') {
      const itinerary = await deleteTripItineraryItem(
        params.tripId,
        String(body.itemId || ''),
        admin.email
      );
      return NextResponse.json({ itinerary });
    }

    if (action === 'send_group_chat') {
      const msg = await sendGroupChatMessage({
        tripId: params.tripId,
        senderId: admin.email,
        senderName: admin.name,
        senderCode: 'ORGANIZER',
        senderRole: 'organizer',
        message: String(body.message || ''),
        latitude: typeof body.latitude === 'number' ? body.latitude : null,
        longitude: typeof body.longitude === 'number' ? body.longitude : null,
        isUrgent: Boolean(body.isUrgent)
      });
      return NextResponse.json({ ok: true, message: msg });
    }

    if (action === 'update_essentials') {
      const essentials = await updateTripEssentials({
        tripId: params.tripId,
        essentials: body.essentials,
        actorEmail: admin.email
      });
      return NextResponse.json({ ok: true, essentials });
    }

    if (action === 'simulate_tourists') {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'The load simulator is disabled in production.' }, { status: 403 });
      }
      const count = Number(body.count || 25);
      const simResult = await simulateTouristsForTrip(params.tripId, count, admin.email);
      return NextResponse.json(simResult);
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Operation failed.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
