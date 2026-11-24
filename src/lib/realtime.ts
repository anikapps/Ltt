'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSupabaseBrowserClient } from './supabase';

export type TripRealtimeEvent =
  | { type: 'location_update'; member_id: string; latitude: number; longitude: number; accuracy: number; updated_at: string }
  | { type: 'chat_message'; message: Record<string, unknown> }
  | { type: 'chat_reaction'; messageId: string; reactions: unknown[] }
  | { type: 'chat_pin'; messageId: string; is_pinned: boolean }
  | { type: 'chat_edit'; messageId: string; message: string }
  | { type: 'chat_delete'; messageId: string }
  | { type: 'announcement_published'; title: string; priority: string }
  | { type: 'sos_alert'; alertId: string; display_name: string; priority: string }
  | { type: 'sos_reply'; alertId: string; message: Record<string, unknown> }
  | { type: 'headcount_update'; sessionId: string }
  | { type: 'typing'; member_id: string; display_name: string; is_typing: boolean };

interface UseTripRealtimeOptions {
  tripId: string;
  memberId?: string;
  displayName?: string;
  onEvent: (event: TripRealtimeEvent) => void;
}

export function useTripRealtime({ tripId, memberId, displayName, onEvent }: UseTripRealtimeOptions) {
  const [connected, setConnected] = useState(false);
  const [onlineMemberIds, setOnlineMemberIds] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabaseBrowserClient>>['channel']> | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!tripId) return;
    const sb = getSupabaseBrowserClient();
    if (!sb) return;

    const channel = sb.channel(`trip:${tripId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: memberId || `observer-${Math.random().toString(36).slice(2, 8)}` }
      }
    });

    channel
      .on('broadcast', { event: 'trip_event' }, ({ payload }) => {
        const evt = payload as TripRealtimeEvent;
        if (evt.type === 'typing') {
          setTypingUsers((prev) => {
            const next = { ...prev };
            if (evt.is_typing) {
              next[evt.member_id] = evt.display_name;
            } else {
              delete next[evt.member_id];
            }
            return next;
          });
        }
        onEventRef.current(evt);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setOnlineMemberIds(Object.keys(state));
      })
      .subscribe(async (status) => {
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED' && memberId) {
          await channel.track({
            member_id: memberId,
            display_name: displayName || 'Traveller',
            online_at: new Date().toISOString()
          });
        }
      });

    channelRef.current = channel;

    return () => {
      setConnected(false);
      sb.removeChannel(channel);
      channelRef.current = null;
    };
  }, [tripId, memberId, displayName]);

  const broadcastEvent = useCallback((event: TripRealtimeEvent) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'trip_event',
      payload: event
    });
  }, []);

  return { connected, onlineMemberIds, typingUsers, broadcastEvent };
}
