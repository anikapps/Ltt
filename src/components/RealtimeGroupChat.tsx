'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Edit3,
  Megaphone,
  Pin,
  Reply,
  Search,
  Send,
  Trash2,
  X
} from 'lucide-react';
import { useTripRealtime } from '@/lib/realtime';
import type { GroupChatMessage } from '@/types/lttbd';

export interface LocalChatMsg extends GroupChatMessage {
  _status?: 'sending' | 'sent' | 'failed';
}

interface RealtimeGroupChatProps {
  tripId: string;
  tripName: string;
  role: 'tourist' | 'admin';
  senderId: string;
  senderName: string;
  senderCode: string;
  initialMessages: GroupChatMessage[];
  peerCount?: number;
  presets?: string[];
  onRefreshSync?: () => void;
}

export function RealtimeGroupChat({
  tripId,
  tripName,
  role,
  senderId,
  senderName,
  senderCode,
  initialMessages,
  peerCount,
  presets,
  onRefreshSync
}: RealtimeGroupChatProps) {
  const [messages, setMessages] = useState<LocalChatMsg[]>(initialMessages);
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<LocalChatMsg | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [muted, setMuted] = useState(false);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const apiEndpoint = role === 'admin' ? `/api/admin/trips/${tripId}` : `/api/tourist/trip/${tripId}`;

  useEffect(() => {
    setMuted(localStorage.getItem(`lttbd_mute_${tripId}`) === '1');
  }, [tripId]);

  useEffect(() => {
    setMessages((prev) => {
      const seen = new Set(initialMessages.map((m) => m.id));
      const pendingLocal = prev.filter((m) => m._status === 'sending' || m._status === 'failed');
      return [...initialMessages, ...pendingLocal.filter((m) => !seen.has(m.id))];
    });
  }, [initialMessages]);

  // Fast 2-second fallback sync when running locally without Supabase Realtime
  useEffect(() => {
    if (!onRefreshSync) return;
    const timer = setInterval(onRefreshSync, 2000);
    return () => clearInterval(timer);
  }, [onRefreshSync]);

  const { connected, onlineMemberIds, typingUsers, broadcastEvent } = useTripRealtime({
    tripId,
    memberId: senderId,
    displayName: senderName,
    onEvent: (evt) => {
      if (evt.type === 'chat_message') {
        const incoming = evt.message as unknown as LocalChatMsg;
        setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
      } else if (evt.type === 'chat_reaction') {
        setMessages((prev) =>
          prev.map((m) => (m.id === evt.messageId ? { ...m, reactions: evt.reactions as LocalChatMsg['reactions'] } : m))
        );
      } else if (evt.type === 'chat_edit') {
        setMessages((prev) =>
          prev.map((m) => (m.id === evt.messageId ? { ...m, message: evt.message, edited_at: new Date().toISOString() } : m))
        );
      } else if (evt.type === 'chat_delete') {
        setMessages((prev) => prev.filter((m) => m.id !== evt.messageId));
      } else if (evt.type === 'chat_pin') {
        setMessages((prev) =>
          prev.map((m) => (m.id === evt.messageId ? { ...m, is_pinned: evt.is_pinned } : m))
        );
      }
    }
  });

  // Always scroll smoothly to show the newest incoming or sent message
  useEffect(() => {
    requestAnimationFrame(() => {
      if (bottomAnchorRef.current) {
        bottomAnchorRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } else if (scrollBoxRef.current) {
        scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
      }
    });
  }, [messages.length, messages[messages.length - 1]?.id]);

  async function sendMessageText(rawText: string) {
    const text = rawText.trim();
    if (!text) return;

    if (editingId) {
      await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat_edit', messageId: editingId, message: text })
      });
      setMessages((prev) => prev.map((m) => (m.id === editingId ? { ...m, message: text, edited_at: new Date().toISOString() } : m)));
      broadcastEvent({ type: 'chat_edit', messageId: editingId, message: text });
      setEditingId(null);
      setDraft('');
      return;
    }

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: LocalChatMsg = {
      id: tempId,
      trip_id: tripId,
      sender_id: senderId,
      sender_name: senderName,
      sender_code: senderCode,
      sender_role: role,
      message: text,
      reply_to_id: replyTo?.id || null,
      reply_to_preview: replyTo ? `${replyTo.sender_name}: ${replyTo.message.slice(0, 60)}` : null,
      created_at: new Date().toISOString(),
      _status: 'sending'
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setReplyTo(null);

    try {
      const res = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_group_chat',
          message: text,
          replyToId: optimistic.reply_to_id,
          replyToPreview: optimistic.reply_to_preview
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const saved: LocalChatMsg = {
        ...((data.message || data.result || optimistic) as LocalChatMsg),
        _status: 'sent'
      };
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      broadcastEvent({ type: 'chat_message', message: saved as unknown as Record<string, unknown> });
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, _status: 'failed' } : m)));
    }
  }

  async function handleReact(messageId: string, emoji: string) {
    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat_react', messageId, emoji })
    });
    const data = await res.json();
    const reactions = data.message?.reactions || data.result?.reactions;
    if (res.ok && reactions) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      broadcastEvent({ type: 'chat_reaction', messageId, reactions });
    }
  }

  async function handlePin(messageId: string) {
    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat_pin', messageId })
    });
    const data = await res.json();
    const isPinned = Boolean(data.result?.is_pinned);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, is_pinned: isPinned } : m)));
    broadcastEvent({ type: 'chat_pin', messageId, is_pinned: isPinned });
  }

  async function handleDelete(messageId: string) {
    await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'chat_delete', messageId })
    });
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    broadcastEvent({ type: 'chat_delete', messageId });
  }

  const pinnedMessages = messages.filter((m) => m.is_pinned);
  const filtered = searchQuery.trim()
    ? messages.filter(
        (m) =>
          m.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.sender_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;
  const displayed = filtered.slice(-visibleLimit);
  const typingNames = Object.values(typingUsers);

  return (
    <div className="flex flex-col bg-slate-950 border border-white/10 rounded-2xl shadow-xl overflow-hidden text-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 bg-slate-900/80">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-white">{tripName} — Live Group Chat</h2>
          <p className="text-xs text-slate-400">
            {peerCount !== undefined ? `${peerCount} passengers · ` : ''}
            {onlineMemberIds.length} online
            <span className="ml-2 text-emerald-400 font-semibold">
              ● {connected ? 'Realtime Live' : 'Fast Sync'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowSearch((s) => !s)}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-300"
            title="Search chat history"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              localStorage.setItem(`lttbd_mute_${tripId}`, next ? '1' : '0');
            }}
            className="p-2 rounded-lg hover:bg-white/10 text-slate-300"
            title={muted ? 'Unmute notifications' : 'Mute notifications'}
          >
            {muted ? <BellOff className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Quick Presets */}
      {presets && presets.length > 0 && (
        <div className="px-4 py-2.5 border-b border-white/10 bg-slate-900/50 flex items-center gap-2 overflow-x-auto">
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => sendMessageText(preset)}
              className="text-[11px] font-bold bg-slate-800 hover:bg-blue-600 text-slate-100 px-3 py-1.5 rounded-full whitespace-nowrap border border-white/10 transition"
            >
              {preset}
            </button>
          ))}
        </div>
      )}

      {showSearch && (
        <div className="px-4 py-2 border-b border-white/10 bg-slate-900 flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages or name..."
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')}>
              <X className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
      )}

      {/* Pinned Banner */}
      {pinnedMessages.length > 0 && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-400/30 text-xs text-amber-200 flex items-center gap-2">
          <Pin className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="truncate font-semibold">{pinnedMessages[pinnedMessages.length - 1].message}</span>
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={scrollBoxRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[340px] max-h-[58vh] bg-slate-950"
      >
        {filtered.length > visibleLimit && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setVisibleLimit((v) => v + 40)}
              className="text-xs font-bold text-blue-300 hover:underline bg-white/10 px-3 py-1 rounded-full"
            >
              Load older messages
            </button>
          </div>
        )}

        {displayed.map((m) => {
          const isMine = m.sender_id === senderId || (role === 'admin' && m.sender_role === 'admin');
          const isStaff = m.sender_role === 'admin' || m.message_type === 'announcement';

          return (
            <div key={m.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-md ${
                  isMine
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
                    : isStaff
                    ? 'bg-amber-500/15 border border-amber-400/40 text-white'
                    : 'bg-slate-800/90 border border-white/10 text-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-4 text-[11px] font-bold mb-1">
                  <span className={isMine ? 'text-blue-100' : isStaff ? 'text-amber-300' : 'text-amber-400'}>
                    {isStaff && <Megaphone className="w-3 h-3 inline mr-1" />}
                    {isMine ? `You (${senderCode})` : `${m.sender_name} (${m.sender_code})`}
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {m.reply_to_preview && (
                  <div className="text-[11px] opacity-80 border-l-2 border-amber-400 pl-2 mb-1.5 truncate">
                    {m.reply_to_preview}
                  </div>
                )}

                <p className="whitespace-pre-wrap break-words leading-relaxed">{m.message}</p>

                <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] opacity-80">
                  <div className="flex items-center gap-1.5">
                    {['👍', '❤️', '🙏'].map((em) => (
                      <button key={em} type="button" onClick={() => handleReact(m.id, em)} className="hover:scale-125 transition">
                        {em}
                      </button>
                    ))}
                    <button type="button" onClick={() => setReplyTo(m)} title="Reply">
                      <Reply className="w-3 h-3" />
                    </button>
                    {role === 'admin' && (
                      <button type="button" onClick={() => handlePin(m.id)} title="Pin / Unpin">
                        <Pin className="w-3 h-3" />
                      </button>
                    )}
                    {isMine && (
                      <button type="button" onClick={() => { setEditingId(m.id); setDraft(m.message); }} title="Edit">
                        <Edit3 className="w-3 h-3" />
                      </button>
                    )}
                    {(isMine || role === 'admin') && (
                      <button type="button" onClick={() => handleDelete(m.id)} title="Delete">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1">
                    {m.edited_at && '(edited)'}
                    {isMine && m._status !== 'failed' && <Check className="w-3 h-3" />}
                    {m._status === 'failed' && <span className="text-rose-300 font-bold">Failed</span>}
                  </span>
                </div>

                {m.reactions && m.reactions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {m.reactions.map((r) => (
                      <span key={r.emoji} className="inline-flex items-center gap-1 rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-bold border border-white/15">
                        {r.emoji} {r.member_ids.length}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomAnchorRef} />
      </div>

      {typingNames.length > 0 && (
        <div className="px-4 py-1 text-[11px] text-amber-300 italic bg-slate-900">
          {typingNames.join(', ')} typing...
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessageText(draft);
        }}
        className="p-3 border-t border-white/10 bg-slate-900 space-y-2"
      >
        {(replyTo || editingId) && (
          <div className="flex items-center justify-between text-xs bg-slate-800 rounded-lg px-3 py-1.5 text-slate-200">
            <span>{editingId ? 'Editing message' : `Replying to ${replyTo?.sender_name}`}</span>
            <button type="button" onClick={() => { setReplyTo(null); setEditingId(null); setDraft(''); }}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              broadcastEvent({ type: 'typing', member_id: senderId, display_name: senderName, is_typing: e.target.value.length > 0 });
            }}
            placeholder={role === 'admin' ? 'Send an instant message as Operations...' : 'Write a message to the group...'}
            className="flex-1 rounded-xl bg-slate-950 border border-blue-500/40 px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-bold inline-flex items-center gap-1.5 shadow-lg"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Send</span>
          </button>
        </div>
      </form>
    </div>
  );
}
