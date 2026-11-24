import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminSessionFromCookies,
  getTouristSessionFromCookies,
  TOURIST_COOKIE_NAME
} from '@/lib/session';
import {
  getAdminTripDetail,
  updateTripSettings,
  createMeetingPoint,
  toggleOrDeleteMeetingPoint,
  startHeadcountSession,
  closeHeadcountSession,
  createAnnouncement,
  generateOrRotateInviteLink,
  manageTripAdministrators,
  removePassengerFromTrip,
  endTripAndPurgePersonalData,
  archiveTrip,
  reviveArchivedTrip,
  updateEmergencyAlertStatus,
  addAssistanceMessage,
  simulateTouristsForTrip,
  addTripItineraryItem,
  deleteTripItineraryItem,
  sendGroupChatMessage,
  operateLocalGroupChat,
  updateTripEssentials
} from '@/lib/repository';
import { isSupabaseConfigured, getSupabaseAdminClient } from '@/lib/supabase';
import {
  pgGetAdminTripDetail,
  pgReviveTrip,
  pgAppendAuditLog,
  pgChatOperation
} from '@/lib/db-normalized';
import { MAX_PASSENGERS_PER_TRIP } from '@/lib/capacity';

const RESOLVED_ALERT_STATUSES = ['Resolved', 'Closed', 'Cancelled'];
const ANNOUNCEMENT_PRIORITIES = ['normal', 'important', 'urgent'];

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ tripId: string }> }
) {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized administrator session.' }, { status: 401 });
  }
  const { tripId } = await context.params;
  const detail = isSupabaseConfigured()
    ? await pgGetAdminTripDetail(tripId)
    : await getAdminTripDetail(tripId, session.email);

  if (!detail) {
    return NextResponse.json({ error: 'Trip not found.' }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ tripId: string }> }
) {
  const session = await getAdminSessionFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized administrator session.' }, { status: 401 });
  }

  try {
    const { tripId } = await context.params;
    const body = await req.json();
    const action = String(body.action || '');
    const sb = isSupabaseConfigured() ? getSupabaseAdminClient() : null;

    if (sb) {
      const now = new Date().toISOString();

      switch (action) {
        case 'revive_trip': {
          if (session.role !== 'super_admin' && session.role !== 'main_admin') {
            return NextResponse.json({ error: 'Only Super Admins can revive archived or completed tours.' }, { status: 403 });
          }
          const revived = await pgReviveTrip(tripId, session.email);
          return NextResponse.json({ ok: true, ...revived });
        }

        case 'archive_trip': {
          await sb.from('trips').update({ status: 'archived', archived_at: now }).eq('id', tripId);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'TRIP_ARCHIVED' });
          return NextResponse.json({ ok: true });
        }

        case 'update_settings': {
          await sb
            .from('trips')
            .update({
              ...(body.name !== undefined ? { name: String(body.name) } : {}),
              ...(body.destination !== undefined ? { destination: String(body.destination) } : {}),
              ...(body.max_tourists !== undefined
                ? {
                    max_tourists: Math.min(
                      MAX_PASSENGERS_PER_TRIP,
                      Math.max(1, Number(body.max_tourists || MAX_PASSENGERS_PER_TRIP))
                    )
                  }
                : {}),
              ...(body.organizerContact !== undefined || body.organizer_contact !== undefined
                ? { organizer_contact: String(body.organizerContact ?? body.organizer_contact ?? '') }
                : {}),
              ...(body.staleThresholdSeconds !== undefined || body.stale_threshold_seconds !== undefined
                ? { stale_threshold_seconds: Number(body.staleThresholdSeconds ?? body.stale_threshold_seconds ?? 240) }
                : {}),
              ...(body.updateIntervalSeconds !== undefined || body.update_interval_seconds !== undefined
                ? { update_interval_seconds: Number(body.updateIntervalSeconds ?? body.update_interval_seconds ?? 45) }
                : {}),
              ...(body.retentionDays !== undefined || body.retention_days !== undefined
                ? { retention_days: Number(body.retentionDays ?? body.retention_days ?? 7) }
                : {}),
              ...(body.separationThresholdMeters !== undefined || body.separation_threshold_meters !== undefined
                ? { separation_threshold_meters: Number(body.separationThresholdMeters ?? body.separation_threshold_meters ?? 500) }
                : {})
            })
            .eq('id', tripId);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'TRIP_SETTINGS_UPDATED' });
          return NextResponse.json({ ok: true });
        }

        case 'create_meeting_point': {
          await sb.from('meeting_points').insert({
            trip_id: tripId,
            title: String(body.title || 'Meeting Point'),
            notes: String(body.notes ?? body.description ?? ''),
            latitude: Number(body.latitude),
            longitude: Number(body.longitude),
            radius_meters: Number(body.radiusMeters ?? body.radius_meters ?? 250),
            scheduled_at: body.scheduledAt ?? body.scheduled_time ?? now,
            is_active: true
          });
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'MEETING_POINT_CREATED', details: { title: body.title } });
          return NextResponse.json({ ok: true });
        }

        case 'manage_meeting_point': {
          const subAction = body.subAction === 'delete' ? 'delete' : 'toggle';
          if (subAction === 'delete') {
            await sb.from('meeting_points').delete().eq('id', body.meetingPointId);
          } else {
            const { data: mp } = await sb.from('meeting_points').select('is_active').eq('id', body.meetingPointId).maybeSingle();
            await sb.from('meeting_points').update({ is_active: !mp?.is_active }).eq('id', body.meetingPointId);
          }
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'MEETING_POINT_UPDATED', details: { subAction, meetingPointId: body.meetingPointId } });
          return NextResponse.json({ ok: true });
        }

        case 'toggle_meeting_point': {
          const { data: mp } = await sb.from('meeting_points').select('is_active').eq('id', body.meetingPointId).maybeSingle();
          await sb.from('meeting_points').update({ is_active: !mp?.is_active }).eq('id', body.meetingPointId);
          return NextResponse.json({ ok: true });
        }

        case 'delete_meeting_point': {
          await sb.from('meeting_points').delete().eq('id', body.meetingPointId);
          return NextResponse.json({ ok: true });
        }

        case 'start_headcount': {
          await sb.from('headcount_sessions').insert({
            trip_id: tripId,
            title: String(body.title || 'Group Headcount'),
            subgroup_name: body.subgroupName ?? body.subgroup_name ?? 'All',
            status: 'open',
            created_by: session.name
          });
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'HEADCOUNT_STARTED', details: { title: body.title } });
          return NextResponse.json({ ok: true });
        }

        case 'close_headcount': {
          await sb.from('headcount_sessions').update({ status: 'closed', closed_at: now }).eq('id', body.sessionId);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'HEADCOUNT_CLOSED', details: { sessionId: body.sessionId } });
          return NextResponse.json({ ok: true });
        }

        case 'create_announcement': {
          const destinations: string[] = Array.isArray(body.destinations) && body.destinations.length > 0
            ? body.destinations
            : ['essentials', 'notifications', 'chat'];
          const rawPriority = String(body.priority || 'normal');
          const priority = ANNOUNCEMENT_PRIORITIES.includes(rawPriority) ? rawPriority : 'normal';
          const targetTripId = body.global === true && session.role === 'super_admin' ? null : tripId;

          const { data: ann } = await sb
            .from('announcements')
            .insert({
              trip_id: targetTripId,
              title: String(body.title || 'Update'),
              body: String(body.body || ''),
              priority,
              subgroup_name: body.subgroupName ?? body.subgroup_name ?? 'All',
              target_member_id: body.target_member_id || null,
              destinations,
              expires_at: body.expires_at || null,
              created_by: session.name
            })
            .select('*')
            .single();

          if (destinations.includes('notifications')) {
            await sb.from('notification_events').insert({
              trip_id: tripId,
              channel: destinations.includes('push') ? 'push_and_in_app' : 'in_app',
              recipient: body.subgroupName ?? body.subgroup_name ?? 'All',
              status: 'delivered',
              payload: { title: body.title, body: body.body, priority, announcement_id: ann?.id }
            });
          }

          if (destinations.includes('chat')) {
            await sb.from('group_messages').insert({
              trip_id: tripId,
              sender_id: session.email,
              sender_name: session.name,
              sender_code: 'STAFF',
              sender_role: 'admin',
              message: `📢 ${body.title}: ${body.body}`,
              message_type: 'announcement',
              is_pinned: priority === 'urgent'
            });
          }

          await pgAppendAuditLog({
            tripId,
            actorLabel: session.email,
            action: 'ANNOUNCEMENT_PUBLISHED',
            details: { title: body.title, priority, destinations }
          });
          return NextResponse.json({ ok: true, announcement: ann });
        }

        case 'archive_announcement': {
          await sb.from('announcements').update({ is_archived: true, updated_at: now }).eq('id', body.announcementId);
          return NextResponse.json({ ok: true });
        }

        case 'rotate_invite':
        case 'generate_invite': {
          const revokeExisting = body.revokeExisting === true;
          if (revokeExisting) {
            await sb.from('trip_invitations').update({ is_revoked: true }).eq('trip_id', tripId);
          }
          const token = `ltt-${crypto.randomUUID().slice(0, 10)}`;
          await sb.from('trip_invitations').insert({
            trip_id: tripId,
            token,
            invitation_code: token.slice(-8).toUpperCase(),
            is_revoked: false,
            expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()
          });
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: revokeExisting ? 'INVITE_LINK_ROTATED' : 'INVITE_LINK_CREATED' });
          return NextResponse.json({ ok: true });
        }

        case 'add_admin':
        case 'remove_admin':
        case 'manage_admin': {
          const op = action === 'remove_admin' ? 'remove' : action === 'manage_admin' ? String(body.subAction || 'add') : 'add';
          const targetEmail = String(body.targetEmail ?? body.email ?? '').toLowerCase();
          if (op === 'remove') {
            await sb.from('organizer_assignments').delete().eq('trip_id', tripId).eq('admin_email', targetEmail);
          } else {
            await sb.from('organizer_assignments').upsert({
              trip_id: tripId,
              admin_email: targetEmail,
              admin_name: String(body.targetName ?? body.name ?? targetEmail),
              role: body.role || 'tour_manager'
            });
          }
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'ADMIN_ROLE_CHANGED', details: { op, target: targetEmail } });
          return NextResponse.json({ ok: true });
        }

        case 'remove_passenger': {
          const targetId = String(body.rosterId ?? body.memberId ?? '');
          // The UI sends the roster id; resolve it to the claimed member (if any).
          let memberIdToRemove = String(body.memberId ?? '');
          if (!memberIdToRemove && targetId) {
            const { data: member } = await sb
              .from('trip_members')
              .select('id')
              .eq('trip_id', tripId)
              .or(`roster_id.eq.${targetId},id.eq.${targetId}`)
              .maybeSingle();
            memberIdToRemove = member?.id || '';
          }
          if (memberIdToRemove) {
            await sb.from('trip_members').update({ session_revoked: true, sharing_enabled: false }).eq('id', memberIdToRemove);
            await sb.from('latest_locations').update({ sharing_status: 'disabled' }).eq('member_id', memberIdToRemove);
          }
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'PASSENGER_SESSION_REVOKED', details: { targetId } });
          return NextResponse.json({ ok: true });
        }

        case 'update_alert':
        case 'update_alert_status': {
          const nextStatus = String(body.status ?? body.newStatus ?? 'Acknowledged');
          await sb
            .from('assistance_requests')
            .update({
              status: nextStatus,
              assigned_responder: body.assignedResponder || undefined,
              internal_notes: body.internalNotes || undefined,
              resolution_notes: body.resolutionNotes || undefined,
              ...(nextStatus === 'Acknowledged' ? { acknowledged_at: now, acknowledged_by: session.name } : {}),
              ...(RESOLVED_ALERT_STATUSES.includes(nextStatus) ? { resolved_at: now, resolved_by: session.name } : {})
            })
            .eq('id', body.alertId);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'SOS_UPDATED', details: { alertId: body.alertId, status: nextStatus } });
          return NextResponse.json({ ok: true });
        }

        case 'reply_alert': {
          await sb.from('assistance_messages').insert({
            request_id: body.alertId,
            sender_name: session.name,
            sender_role: 'organizer',
            message: String(body.message || '')
          });
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'SOS_REPLIED', details: { alertId: body.alertId } });
          return NextResponse.json({ ok: true });
        }

        case 'send_group_chat':
        case 'chat_pin':
        case 'chat_react':
        case 'chat_edit':
        case 'chat_delete': {
          const op = action === 'chat_pin' ? 'pin' : action === 'chat_react' ? 'react' : action === 'chat_edit' ? 'edit' : action === 'chat_delete' ? 'delete' : 'send';
          const res = await pgChatOperation({
            tripId,
            senderId: session.email,
            senderName: session.name,
            senderCode: 'STAFF',
            senderRole: 'admin',
            op,
            message: body.message,
            messageId: body.messageId,
            emoji: body.emoji
          });
          return NextResponse.json({ ok: true, result: res });
        }

        case 'update_essentials': {
          const { data: tr } = await sb.from('trips').select('essentials').eq('id', tripId).maybeSingle();
          const merged = { ...(tr?.essentials || {}), ...(body.essentials || {}) };
          await sb.from('trips').update({ essentials: merged }).eq('id', tripId);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'ESSENTIALS_UPDATED' });
          return NextResponse.json({ ok: true });
        }

        case 'add_itinerary': {
          const { data: tr } = await sb.from('trips').select('essentials').eq('id', tripId).maybeSingle();
          const ess = tr?.essentials || {};
          const list = Array.isArray(ess.itinerary) ? ess.itinerary : [];
          list.push({
            id: crypto.randomUUID(),
            day_label: String(body.dayLabel ?? body.day_label ?? ''),
            time_label: String(body.timeLabel ?? body.time_label ?? ''),
            title: String(body.title ?? ''),
            location_name: String(body.locationName ?? body.location_name ?? ''),
            instructions: String(body.instructions ?? body.notes ?? '')
          });
          await sb.from('trips').update({ essentials: { ...ess, itinerary: list } }).eq('id', tripId);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'ITINERARY_ITEM_ADDED', details: { title: body.title } });
          return NextResponse.json({ ok: true });
        }

        case 'delete_itinerary': {
          const { data: tr } = await sb.from('trips').select('essentials').eq('id', tripId).maybeSingle();
          const ess = tr?.essentials || {};
          const list = (Array.isArray(ess.itinerary) ? ess.itinerary : []).filter((i: { id: string }) => i.id !== body.itemId);
          await sb.from('trips').update({ essentials: { ...ess, itinerary: list } }).eq('id', tripId);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'ITINERARY_ITEM_REMOVED', details: { itemId: body.itemId } });
          return NextResponse.json({ ok: true });
        }

        case 'end_trip_and_purge':
        case 'end_and_purge': {
          await sb.from('trips').update({ status: 'completed', ended_at: now }).eq('id', tripId);
          await Promise.all([
            sb.from('location_history').delete().eq('trip_id', tripId),
            sb.from('latest_locations').delete().eq('trip_id', tripId),
            sb.from('assistance_requests').delete().eq('trip_id', tripId),
            sb.from('remembered_devices').delete().eq('trip_id', tripId),
            sb.from('trip_members').delete().eq('trip_id', tripId),
            sb.from('passenger_roster').delete().eq('trip_id', tripId),
            sb.from('trip_invitations').update({ is_revoked: true }).eq('trip_id', tripId)
          ]);
          await pgAppendAuditLog({ tripId, actorLabel: session.email, action: 'TRIP_ENDED_AND_PII_PURGED' });
          return NextResponse.json({ ok: true, purged: true });
        }
      }
    }

    // Local JSON fallback for offline Windows development
    switch (action) {
      case 'update_settings': {
        const trip = await updateTripSettings({
          tripId,
          staleThresholdSeconds: body.staleThresholdSeconds !== undefined ? Number(body.staleThresholdSeconds) : undefined,
          updateIntervalSeconds: body.updateIntervalSeconds !== undefined ? Number(body.updateIntervalSeconds) : undefined,
          retentionDays: body.retentionDays !== undefined ? Number(body.retentionDays) : undefined,
          separationThresholdMeters: body.separationThresholdMeters !== undefined ? Number(body.separationThresholdMeters) : undefined,
          organizerContact: body.organizerContact !== undefined ? String(body.organizerContact) : undefined,
          actorEmail: session.email
        });
        return NextResponse.json({ trip });
      }
      case 'create_meeting_point': {
        const mp = await createMeetingPoint({
          tripId,
          title: String(body.title || ''),
          notes: String(body.notes ?? body.description ?? ''),
          latitude: Number(body.latitude),
          longitude: Number(body.longitude),
          scheduledAt: String(body.scheduledAt ?? body.scheduled_time ?? '') || new Date().toISOString(),
          radiusMeters: Number(body.radiusMeters ?? body.radius_meters ?? 300),
          actorEmail: session.email
        });
        return NextResponse.json({ meetingPoint: mp });
      }
      case 'manage_meeting_point': {
        await toggleOrDeleteMeetingPoint({
          tripId,
          meetingPointId: String(body.meetingPointId),
          subAction: body.subAction === 'delete' ? 'delete' : 'toggle',
          actorEmail: session.email
        });
        return NextResponse.json({ ok: true });
      }
      case 'toggle_meeting_point':
      case 'delete_meeting_point': {
        await toggleOrDeleteMeetingPoint({
          tripId,
          meetingPointId: String(body.meetingPointId),
          subAction: action === 'delete_meeting_point' ? 'delete' : 'toggle',
          actorEmail: session.email
        });
        return NextResponse.json({ ok: true });
      }
      case 'start_headcount': {
        const hc = await startHeadcountSession({
          tripId,
          title: String(body.title || 'Group Headcount'),
          subgroupName: String(body.subgroupName ?? body.subgroup_name ?? 'All'),
          actorEmail: session.email
        });
        return NextResponse.json({ headcount: hc });
      }
      case 'close_headcount': {
        await closeHeadcountSession(tripId, String(body.sessionId), session.email);
        return NextResponse.json({ ok: true });
      }
      case 'create_announcement': {
        const rawPriority = String(body.priority || 'normal');
        const ann = await createAnnouncement({
          tripId,
          title: String(body.title || ''),
          body: String(body.body || ''),
          priority: ANNOUNCEMENT_PRIORITIES.includes(rawPriority)
            ? (rawPriority as 'normal' | 'important' | 'urgent')
            : 'normal',
          subgroupName: String(body.subgroupName ?? body.subgroup_name ?? 'All'),
          actorEmail: session.email
        });
        return NextResponse.json({ announcement: ann });
      }
      case 'rotate_invite':
      case 'generate_invite': {
        const inv = await generateOrRotateInviteLink(tripId, body.revokeExisting === true, session.email);
        return NextResponse.json({ invite: inv });
      }
      case 'add_admin':
      case 'remove_admin':
      case 'manage_admin': {
        const op = action === 'remove_admin' ? 'remove' : action === 'manage_admin' ? String(body.subAction || 'add') : 'add';
        await manageTripAdministrators({
          tripId,
          action: op === 'remove' ? 'remove' : op === 'promote' ? 'promote' : 'add',
          targetEmail: String(body.targetEmail ?? body.email ?? ''),
          targetName: body.targetName ?? body.name ? String(body.targetName ?? body.name ?? '') : undefined,
          role: body.role,
          actorEmail: session.email
        });
        return NextResponse.json({ ok: true });
      }
      case 'remove_passenger': {
        await removePassengerFromTrip(tripId, String(body.rosterId ?? body.memberId ?? ''), session.email);
        const touristSession = await getTouristSessionFromCookies();
        const res = NextResponse.json({ ok: true });
        if (touristSession && touristSession.memberId === (body.memberId ?? body.rosterId)) {
          res.cookies.delete(TOURIST_COOKIE_NAME);
        }
        return res;
      }
      case 'archive_trip': {
        await archiveTrip(tripId, session.email);
        return NextResponse.json({ ok: true });
      }
      case 'revive_trip': {
        const revived = await reviveArchivedTrip(tripId, session.email);
        return NextResponse.json({ ok: true, ...revived });
      }
      case 'end_trip_and_purge':
      case 'end_and_purge': {
        await endTripAndPurgePersonalData(tripId, session.email);
        const res = NextResponse.json({ ok: true, purged: true });
        res.cookies.delete(TOURIST_COOKIE_NAME);
        return res;
      }
      case 'update_alert':
      case 'update_alert_status': {
        const alert = await updateEmergencyAlertStatus({
          tripId,
          alertId: String(body.alertId),
          newStatus: (body.status ?? body.newStatus ?? 'Acknowledged') as Parameters<typeof updateEmergencyAlertStatus>[0]['newStatus'],
          assignedResponder: body.assignedResponder,
          internalNotes: body.internalNotes,
          resolutionNotes: body.resolutionNotes,
          actorEmail: session.email
        });
        return NextResponse.json({ alert });
      }
      case 'reply_alert': {
        const alert = await addAssistanceMessage({
          tripId,
          alertId: String(body.alertId),
          senderRole: 'admin',
          senderName: session.name,
          message: String(body.message || '')
        });
        return NextResponse.json({ alert });
      }
      case 'add_itinerary': {
        const item = await addTripItineraryItem({
          tripId,
          dayLabel: String(body.dayLabel ?? body.day_label ?? ''),
          timeLabel: String(body.timeLabel ?? body.time_label ?? ''),
          title: String(body.title ?? ''),
          locationName: String(body.locationName ?? body.location_name ?? ''),
          instructions: String(body.instructions ?? body.notes ?? ''),
          actorEmail: session.email
        });
        return NextResponse.json({ item });
      }
      case 'delete_itinerary': {
        await deleteTripItineraryItem(tripId, String(body.itemId), session.email);
        return NextResponse.json({ ok: true });
      }
      case 'send_group_chat': {
        const msg = await sendGroupChatMessage({
          tripId,
          senderId: 'admin-ops',
          senderName: session.name || 'LTT BD Operations',
          senderCode: 'STAFF',
          senderRole: 'admin',
          message: String(body.message || ''),
          replyToId: body.replyToId || null,
          replyToPreview: body.replyToPreview || null
        });
        return NextResponse.json({ message: msg });
      }
      case 'chat_react':
      case 'chat_pin':
      case 'chat_edit':
      case 'chat_delete': {
        const opMap: Record<string, 'react' | 'pin' | 'edit' | 'delete'> = {
          chat_react: 'react',
          chat_pin: 'pin',
          chat_edit: 'edit',
          chat_delete: 'delete'
        };
        const result = await operateLocalGroupChat({
          tripId,
          senderId: 'admin-ops',
          isAdmin: true,
          op: opMap[action],
          messageId: String(body.messageId),
          emoji: body.emoji,
          message: body.message
        });
        return NextResponse.json({ ok: true, result });
      }
      case 'update_essentials': {
        const essentials = await updateTripEssentials({
          tripId,
          essentials: body.essentials || {},
          actorEmail: session.email
        });
        return NextResponse.json({ essentials });
      }
      case 'simulate_tourists': {
        if (process.env.NODE_ENV === 'production') {
          return NextResponse.json({ error: 'The load simulator is disabled in production.' }, { status: 403 });
        }
        const sim = await simulateTouristsForTrip(tripId, Number(body.count || 50), session.email);
        return NextResponse.json(sim);
      }
      default:
        return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Admin operation failed.' },
      { status: 500 }
    );
  }
}
