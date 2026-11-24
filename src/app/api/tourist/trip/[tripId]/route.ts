import { NextRequest, NextResponse } from 'next/server';
import { getTouristSessionFromCookies, TOURIST_COOKIE_NAME } from '@/lib/session';
import {
  validateActiveTouristMember,
  getTouristGroupMapState,
  updateTouristLocationOrSharing,
  createEmergencyAlert,
  addAssistanceMessage,
  recordHeadcountResponse,
  markAnnouncementRead,
  sendGroupChatMessage,
  operateLocalGroupChat,
  updateEmergencyAlertStatus
} from '@/lib/repository';
import { isSupabaseConfigured, getSupabaseAdminClient } from '@/lib/supabase';
import {
  pgGetTouristState,
  pgUpsertTouristLocation,
  pgChatOperation,
  pgAppendAuditLog
} from '@/lib/db-normalized';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await context.params;
  const session = await getTouristSessionFromCookies();
  if (!session || session.tripId !== tripId) {
    return NextResponse.json({ error: 'Unauthorized or expired trip session.' }, { status: 401 });
  }

  if (isSupabaseConfigured()) {
    const state = await pgGetTouristState(tripId, session.memberId);
    if (!state) {
      const res = NextResponse.json({ error: 'Session revoked or trip unavailable.' }, { status: 401 });
      res.cookies.delete(TOURIST_COOKIE_NAME);
      return res;
    }
    return NextResponse.json(state);
  }

  const valid = await validateActiveTouristMember(session.memberId, tripId, session.sessionId);
  if (!valid) {
    const res = NextResponse.json({ error: 'Session revoked or trip purged.' }, { status: 401 });
    res.cookies.delete(TOURIST_COOKIE_NAME);
    return res;
  }

  const state = await getTouristGroupMapState(tripId, session.memberId);
  if (!state) {
    return NextResponse.json({ error: 'Trip unavailable.' }, { status: 404 });
  }
  return NextResponse.json(state);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ tripId: string }> }
) {
  const { tripId } = await context.params;
  const session = await getTouristSessionFromCookies();
  if (!session || session.tripId !== tripId) {
    return NextResponse.json({ error: 'Unauthorized trip session.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body.action || '');
    const sb = isSupabaseConfigured() ? getSupabaseAdminClient() : null;

    if (sb) {
      const now = new Date().toISOString();

      if (action === 'logout_tourist') {
        await sb
          .from('trip_members')
          .update({ session_revoked: true, sharing_enabled: false })
          .eq('id', session.memberId);
        await sb
          .from('latest_locations')
          .update({ sharing_status: 'disabled', received_at: now })
          .eq('member_id', session.memberId);
        await pgAppendAuditLog({
          tripId,
          actorLabel: `${session.displayName} (${session.touristCode})`,
          action: 'PASSENGER_LOGOUT'
        });
        const res = NextResponse.json({ loggedOut: true });
        res.cookies.delete(TOURIST_COOKIE_NAME);
        return res;
      }

      if (action === 'update_location' || action === 'location_update' || action === 'toggle_sharing') {
        const result = await pgUpsertTouristLocation({
          tripId,
          memberId: session.memberId,
          sharingEnabled: typeof body.sharingEnabled === 'boolean' ? body.sharingEnabled : undefined,
          latitude: typeof body.latitude === 'number' ? body.latitude : undefined,
          longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
          accuracy: typeof body.accuracy === 'number' ? body.accuracy : undefined,
          source: body.source,
          permissionStatus: body.permissionStatus,
          statusOverride:
            body.statusOverride === 'unavailable' || body.statusOverride === 'disabled' || body.statusOverride === 'sharing'
              ? body.statusOverride
              : undefined
        });
        return NextResponse.json({ ok: true, ...result });
      }

      if (action === 'create_sos' || action === 'emergency_help') {
        const rate = checkRateLimit(`sos:${session.memberId}`, 5, 60_000);
        if (!rate.allowed) {
          return NextResponse.json({ error: 'SOS cooldown active. Your previous alert was received.' }, { status: 429 });
        }
        const { data: me } = await sb.from('trip_members').select('*').eq('id', session.memberId).maybeSingle();
        const { data: alert } = await sb
          .from('assistance_requests')
          .insert({
            trip_id: tripId,
            member_id: session.memberId,
            tourist_code: session.touristCode,
            passenger_name: session.displayName,
            subgroup_name: me?.subgroup_name || 'Main Group',
            contact_details: me?.contact_info || '',
            category: body.category || 'Lost / separated from group',
            priority: body.priority || 'High',
            description: String(body.note || body.message || 'I need assistance.'),
            latitude: typeof body.latitude === 'number' ? body.latitude : null,
            longitude: typeof body.longitude === 'number' ? body.longitude : null,
            accuracy: typeof body.accuracy === 'number' ? body.accuracy : null,
            status: 'New'
          })
          .select('*')
          .single();

        await pgAppendAuditLog({
          tripId,
          actorLabel: `${session.displayName} (${session.touristCode})`,
          action: 'SOS_REQUEST_CREATED',
          details: { category: body.category, priority: body.priority }
        });
        return NextResponse.json({ alert, acknowledged: true });
      }

      if (action === 'close_sos') {
        await sb
          .from('assistance_requests')
          .update({ status: 'Closed', resolved_at: now, resolved_by: session.displayName })
          .eq('id', body.alertId)
          .eq('member_id', session.memberId);
        await pgAppendAuditLog({
          tripId,
          actorLabel: `${session.displayName} (${session.touristCode})`,
          action: 'SOS_CLOSED_BY_TOURIST',
          details: { alertId: body.alertId }
        });
        return NextResponse.json({ ok: true });
      }

      if (action === 'reply_sos') {
        await sb.from('assistance_messages').insert({
          request_id: body.alertId,
          sender_name: session.displayName,
          sender_role: 'tourist',
          message: String(body.message || '')
        });
        return NextResponse.json({ ok: true });
      }

      if (action === 'headcount_checkin') {
        await sb.from('headcount_responses').upsert(
          {
            session_id: body.sessionId,
            member_id: session.memberId,
            status: body.status === 'needs_help' ? 'needs_help' : 'present',
            latitude: typeof body.latitude === 'number' ? body.latitude : null,
            longitude: typeof body.longitude === 'number' ? body.longitude : null,
            responded_at: now
          },
          { onConflict: 'session_id,member_id' }
        );
        await pgAppendAuditLog({
          tripId,
          actorLabel: `${session.displayName} (${session.touristCode})`,
          action: 'ATTENDANCE_CHECKIN',
          details: { sessionId: body.sessionId, status: body.status }
        });
        return NextResponse.json({ ok: true });
      }

      if (action === 'mark_announcement_read') {
        await sb.from('announcement_receipts').upsert(
          { announcement_id: body.announcementId, member_id: session.memberId, read_at: now },
          { onConflict: 'announcement_id,member_id' }
        );
        return NextResponse.json({ ok: true });
      }

      if (
        action === 'send_group_chat' ||
        action === 'chat_react' ||
        action === 'chat_edit' ||
        action === 'chat_delete'
      ) {
        const opMap: Record<string, 'send' | 'react' | 'edit' | 'delete'> = {
          send_group_chat: 'send',
          chat_react: 'react',
          chat_edit: 'edit',
          chat_delete: 'delete'
        };
        const res = await pgChatOperation({
          tripId,
          senderId: session.memberId,
          senderName: session.displayName,
          senderCode: session.touristCode,
          senderRole: 'tourist',
          op: opMap[action],
          message: body.message,
          messageId: body.messageId,
          emoji: body.emoji,
          replyToId: body.replyToId,
          replyToPreview: body.replyToPreview,
          attachmentName: body.attachmentName,
          attachmentUrl: body.attachmentUrl,
          latitude: typeof body.latitude === 'number' ? body.latitude : null,
          longitude: typeof body.longitude === 'number' ? body.longitude : null
        });
        return NextResponse.json({ ok: true, message: res });
      }

      return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }

    // Local JSON fallback
    const valid = await validateActiveTouristMember(session.memberId, tripId, session.sessionId);
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized trip session.' }, { status: 401 });
    }

    if (action === 'logout_tourist') {
      await updateTouristLocationOrSharing({ tripId, memberId: session.memberId, sharingEnabled: false });
      const res = NextResponse.json({ loggedOut: true });
      res.cookies.delete(TOURIST_COOKIE_NAME);
      return res;
    }

    switch (action) {
      case 'update_location':
      case 'location_update':
      case 'toggle_sharing': {
        const updated = await updateTouristLocationOrSharing({
          tripId,
          memberId: session.memberId,
          sharingEnabled: typeof body.sharingEnabled === 'boolean' ? body.sharingEnabled : undefined,
          latitude: typeof body.latitude === 'number' ? body.latitude : undefined,
          longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
          accuracy: typeof body.accuracy === 'number' ? body.accuracy : undefined,
          statusOverride:
            body.statusOverride === 'unavailable' || body.statusOverride === 'disabled' || body.statusOverride === 'sharing'
              ? body.statusOverride
              : undefined
        });
        return NextResponse.json({ ok: true, ...updated });
      }
      case 'emergency_help':
      case 'create_sos': {
        const rate = checkRateLimit(`sos:${session.memberId}`, 4, 60_000);
        if (!rate.allowed) {
          return NextResponse.json({ error: 'SOS cooldown active. Your previous alert was received.' }, { status: 429 });
        }
        const alert = await createEmergencyAlert({
          tripId,
          memberId: session.memberId,
          passengerName: session.displayName,
          category: body.category,
          priority: body.priority,
          note: String(body.note || body.message || ''),
          latitude: typeof body.latitude === 'number' ? body.latitude : null,
          longitude: typeof body.longitude === 'number' ? body.longitude : null,
          accuracy: typeof body.accuracy === 'number' ? body.accuracy : null
        });
        return NextResponse.json({ alert, acknowledged: true });
      }
      case 'close_sos': {
        const alert = await updateEmergencyAlertStatus({
          tripId,
          alertId: String(body.alertId),
          newStatus: 'Closed',
          resolutionNotes: 'Closed by passenger (marked safe).',
          actorEmail: session.displayName
        });
        return NextResponse.json({ alert });
      }
      case 'chat_react':
      case 'chat_edit':
      case 'chat_delete': {
        const opMap: Record<string, 'react' | 'edit' | 'delete'> = {
          chat_react: 'react',
          chat_edit: 'edit',
          chat_delete: 'delete'
        };
        const result = await operateLocalGroupChat({
          tripId,
          senderId: session.memberId,
          isAdmin: false,
          op: opMap[action],
          messageId: String(body.messageId),
          emoji: body.emoji,
          message: body.message
        });
        return NextResponse.json({ ok: true, message: result });
      }
      case 'reply_sos': {
        const alert = await addAssistanceMessage({
          tripId,
          alertId: String(body.alertId),
          senderRole: 'tourist',
          senderName: session.displayName,
          message: String(body.message || '')
        });
        return NextResponse.json({ alert });
      }
      case 'headcount_checkin': {
        await recordHeadcountResponse({
          tripId,
          sessionId: String(body.sessionId),
          memberId: session.memberId,
          status: body.status === 'needs_help' ? 'needs_help' : 'present',
          latitude: typeof body.latitude === 'number' ? body.latitude : null,
          longitude: typeof body.longitude === 'number' ? body.longitude : null
        });
        return NextResponse.json({ ok: true });
      }      case 'mark_announcement_read': {
        await markAnnouncementRead(tripId, String(body.announcementId), session.memberId);
        return NextResponse.json({ ok: true });
      }
      case 'send_group_chat': {
        const msg = await sendGroupChatMessage({
          tripId,
          senderId: session.memberId,
          senderName: session.displayName,
          senderCode: session.touristCode,
          senderRole: 'tourist',
          message: String(body.message || ''),
          replyToId: body.replyToId || null,
          replyToPreview: body.replyToPreview || null,
          latitude: typeof body.latitude === 'number' ? body.latitude : null,
          longitude: typeof body.longitude === 'number' ? body.longitude : null
        });
        return NextResponse.json({ message: msg });
      }
      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed.' },
      { status: 500 }
    );
  }
}
