import { NextRequest, NextResponse } from 'next/server';
import { getTouristSessionFromCookies } from '@/lib/session';
import {
  validateActiveTouristMember,
  getTouristGroupMapState,
  updateTouristLocationOrSharing,
  createEmergencyAlert,
  addAssistanceMessage,
  recordHeadcountResponse,
  markAnnouncementRead,
  updateEmergencyAlertStatus,
  sendGroupChatMessage
} from '@/lib/repository';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  _req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const session = getTouristSessionFromCookies();
  if (!session || session.tripId !== params.tripId) {
    return NextResponse.json(
      { error: 'Unauthorized. Please open your trip shared link to join.' },
      { status: 401 }
    );
  }

  const activeMember = await validateActiveTouristMember(
    session.memberId,
    params.tripId,
    session.sessionToken
  );

  if (!activeMember) {
    return NextResponse.json(
      { error: 'Your trip session is no longer active. Please re-open your shared invitation link.' },
      { status: 401 }
    );
  }

  const state = await getTouristGroupMapState(params.tripId, session.memberId);
  if (!state) {
    return NextResponse.json(
      { error: 'This trip has ended and personal data has been removed.' },
      { status: 410 }
    );
  }

  return NextResponse.json(state);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const session = getTouristSessionFromCookies();
  if (!session || session.tripId !== params.tripId) {
    return NextResponse.json({ error: 'Unauthorized tourist session.' }, { status: 401 });
  }

  const activeMember = await validateActiveTouristMember(
    session.memberId,
    params.tripId,
    session.sessionToken
  );

  if (!activeMember) {
    return NextResponse.json({ error: 'Session expired or revoked.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body.action || 'location_update');

    if (action === 'location_update') {
      await updateTouristLocationOrSharing({
        memberId: activeMember.id,
        tripId: params.tripId,
        sharingEnabled: Boolean(body.sharingEnabled),
        latitude: typeof body.latitude === 'number' ? body.latitude : null,
        longitude: typeof body.longitude === 'number' ? body.longitude : null,
        accuracy: typeof body.accuracy === 'number' ? body.accuracy : null,
        statusOverride: body.statusOverride
      });
      return NextResponse.json({ ok: true, receivedAt: new Date().toISOString() });
    }

    if (action === 'emergency_help') {
      const rate = checkRateLimit(`emergency:${activeMember.id}`, 5, 2 * 60 * 1000);
      if (!rate.allowed) {
        return NextResponse.json(
          { error: 'Help request already sent recently. Your organizers have been notified.' },
          { status: 429 }
        );
      }

      const alert = await createEmergencyAlert({
        memberId: activeMember.id,
        tripId: params.tripId,
        passengerName: activeMember.display_name,
        category: body.category,
        priority: body.priority,
        note: body.note ? String(body.note).slice(0, 250) : undefined,
        latitude: typeof body.latitude === 'number' ? body.latitude : null,
        longitude: typeof body.longitude === 'number' ? body.longitude : null,
        accuracy: typeof body.accuracy === 'number' ? body.accuracy : null
      });

      return NextResponse.json({
        ok: true,
        serverAcknowledged: true,
        receivedAt: alert.created_at,
        alert
      }, { status: 201 });
    }

    if (action === 'cancel_emergency') {
      const updated = await updateEmergencyAlertStatus({
        alertId: String(body.alertId || ''),
        tripId: params.tripId,
        newStatus: 'Cancelled',
        resolutionNotes: 'Cancelled by tourist',
        actorEmail: activeMember.display_name
      });
      return NextResponse.json({ ok: true, alert: updated });
    }

    if (action === 'send_alert_message') {
      const updated = await addAssistanceMessage({
        tripId: params.tripId,
        alertId: String(body.alertId || ''),
        senderName: activeMember.display_name,
        senderRole: 'tourist',
        message: String(body.message || '')
      });
      return NextResponse.json({ ok: true, alert: updated });
    }

    if (action === 'headcount_checkin') {
      const hc = await recordHeadcountResponse({
        tripId: params.tripId,
        sessionId: String(body.sessionId || ''),
        memberId: activeMember.id,
        displayName: activeMember.display_name,
        status: body.status === 'needs_help' ? 'needs_help' : 'present'
      });
      return NextResponse.json({ ok: true, headcount: hc });
    }

    if (action === 'send_group_chat') {
      const msg = await sendGroupChatMessage({
        tripId: params.tripId,
        senderId: activeMember.id,
        senderName: activeMember.display_name,
        senderCode: activeMember.tourist_code,
        senderRole: 'tourist',
        message: String(body.message || ''),
        latitude: typeof body.latitude === 'number' ? body.latitude : null,
        longitude: typeof body.longitude === 'number' ? body.longitude : null,
        isUrgent: Boolean(body.isUrgent)
      });
      return NextResponse.json({ ok: true, message: msg });
    }

    if (action === 'mark_announcement_read') {
      await markAnnouncementRead(params.tripId, String(body.announcementId || ''), activeMember.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Request failed.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
