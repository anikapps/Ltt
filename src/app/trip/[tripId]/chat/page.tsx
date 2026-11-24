'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, MessageCircle, ShieldAlert, Send, Phone, XCircle } from 'lucide-react';
import { MinimalNav } from '@/components/MinimalNav';
import { RealtimeGroupChat } from '@/components/RealtimeGroupChat';
import { useTripRealtime } from '@/lib/realtime';
import type { EmergencyAlert, GroupChatMessage } from '@/types/lttbd';

export default function GuestChatAndSosPage() {
  const params = useParams<{ tripId: string }>();
  const router = useRouter();
  const tripId = params.tripId;

  const [tab, setTab] = useState<'sos' | 'group'>('group');
  const [tripName, setTripName] = useState('Group Chat');
  const [organizerContact, setOrganizerContact] = useState('');
  const [me, setMe] = useState<{ id: string; tourist_code: string; display_name: string } | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [groupMessages, setGroupMessages] = useState<GroupChatMessage[]>([]);
  const [myAlerts, setMyAlerts] = useState<EmergencyAlert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string>('');
  const [sosReply, setSosReply] = useState('');
  const [closingSos, setClosingSos] = useState(false);

  const sosBottomRef = useRef<HTMLDivElement | null>(null);

  const loadData = useCallback(async () => {
    const res = await fetch(`/api/tourist/trip/${tripId}`);
    if (res.status === 401) {
      router.push('/join');
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setTripName(data.trip?.name || 'Group Chat');
    setOrganizerContact(data.trip?.organizer_contact || '');
    setMe(data.me);
    setPeerCount((data.peers || []).length);
    setGroupMessages(data.groupMessages || []);
    setMyAlerts(data.myAlerts || []);
    if (!selectedAlertId && data.myAlerts?.[0]?.id) {
      setSelectedAlertId(data.myAlerts[0].id);
    }
  }, [tripId, router, selectedAlertId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sos') === '1') {
      setTab('sos');
    }
    loadData();
  }, [loadData]);

  // Fast 2-second poll while on SOS tab so admin acknowledgements & replies appear immediately
  useEffect(() => {
    if (tab !== 'sos') return;
    const timer = setInterval(loadData, 2000);
    return () => clearInterval(timer);
  }, [tab, loadData]);

  const { broadcastEvent } = useTripRealtime({
    tripId,
    memberId: me?.id,
    displayName: me?.display_name,
    onEvent: (evt) => {
      if (evt.type === 'sos_reply') {
        loadData();
      }
    }
  });

  const activeAlert = myAlerts.find((a) => a.id === selectedAlertId) || myAlerts[0];
  const isClosedOrResolved = activeAlert
    ? ['resolved', 'Resolved', 'Closed', 'Cancelled'].includes(activeAlert.status)
    : false;
  const isAcknowledged = activeAlert
    ? ['Acknowledged', 'Assigned', 'Responding', 'responding'].includes(activeAlert.status)
    : false;

  // Auto-scroll SOS thread smoothly whenever new messages arrive
  useEffect(() => {
    requestAnimationFrame(() => {
      sosBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [activeAlert?.messages?.length, tab]);

  async function sendSosReplyText(rawText: string) {
    const text = rawText.trim();
    if (!activeAlert || !text || !me) return;

    const tempMsg = {
      id: `temp-${crypto.randomUUID()}`,
      sender_role: 'tourist' as const,
      sender_name: me.display_name,
      message: text,
      created_at: new Date().toISOString()
    };
    setMyAlerts((prev) =>
      prev.map((a) => (a.id === activeAlert.id ? { ...a, messages: [...(a.messages || []), tempMsg] } : a))
    );
    setSosReply('');

    await fetch(`/api/tourist/trip/${tripId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reply_sos',
        alertId: activeAlert.id,
        message: text
      })
    });
    broadcastEvent({ type: 'sos_reply', alertId: activeAlert.id, message: tempMsg });
    loadData();
  }

  async function handleCloseSos() {
    if (!activeAlert) return;
    setClosingSos(true);
    try {
      await fetch(`/api/tourist/trip/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close_sos', alertId: activeAlert.id })
      });
      await loadData();
    } finally {
      setClosingSos(false);
    }
  }

  const activeSosCount = myAlerts.filter(
    (a) => !['resolved', 'Resolved', 'Closed', 'Cancelled'].includes(a.status)
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <MinimalNav
        role="tourist"
        tripId={tripId}
        tripName={tripName}
        userName={me ? `${me.display_name} (${me.tourist_code})` : ''}
        chatCount={groupMessages.length}
        hasActiveSos={activeSosCount > 0}
      />

      <main className="max-w-5xl w-full mx-auto px-3 sm:px-6 py-4 space-y-4 flex-1">
        {/* Matching Dark Operations Desk Pill Switcher */}
        <div className="grid grid-cols-2 bg-slate-900 p-1.5 rounded-2xl border border-white/10 gap-1.5">
          <button
            type="button"
            onClick={() => setTab('sos')}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
              tab === 'sos'
                ? 'bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <ShieldAlert className="w-4 h-4" /> Direct SOS &amp; Operations ({activeSosCount} Active)
          </button>
          <button
            type="button"
            onClick={() => setTab('group')}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
              tab === 'group'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <MessageCircle className="w-4 h-4" /> Group &amp; Tour Leader Chat ({groupMessages.length})
          </button>
        </div>

        {tab === 'group' && me ? (
          <RealtimeGroupChat
            tripId={tripId}
            tripName={tripName}
            role="tourist"
            senderId={me.id}
            senderName={me.display_name}
            senderCode={me.tourist_code}
            initialMessages={groupMessages}
            peerCount={peerCount}
            presets={[
              'On my way to the meeting point!',
              'Reached the hotel lobby.',
              'Running 5 minutes late.'
            ]}
            onRefreshSync={loadData}
          />
        ) : tab === 'sos' ? (
          <div className="space-y-3">
            {activeAlert && !isClosedOrResolved && (
              <div className="rounded-2xl bg-gradient-to-r from-rose-700 to-amber-600 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-lg">
                <div className="text-xs sm:text-sm font-extrabold tracking-wide">
                  🚨 URGENT EMERGENCY ASSISTANCE REQUESTED — {isAcknowledged ? 'Acknowledged by Operations' : 'Waiting for Operations'}
                </div>
                {activeAlert.assigned_responder && (
                  <span className="text-xs font-bold bg-black/25 px-3 py-1 rounded-full">
                    Assigned: {activeAlert.assigned_responder}
                  </span>
                )}
              </div>
            )}

            <div className="grid lg:grid-cols-12 gap-4">
              {/* Left Thread List */}
              <div className="lg:col-span-4 bg-slate-900/90 rounded-2xl border border-white/10 p-4 space-y-2.5">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Your SOS Threads ({myAlerts.length})
                </div>
                {myAlerts.length === 0 ? (
                  <div className="text-xs text-slate-400 py-6 text-center">
                    No SOS alerts sent. Use the red <strong>I NEED HELP (SOS)</strong> banner above if you need assistance.
                  </div>
                ) : (
                  myAlerts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAlertId(a.id)}
                      className={`w-full text-left rounded-xl p-3 border transition ${
                        activeAlert?.id === a.id
                          ? 'bg-rose-950/60 border-rose-500/60 text-white'
                          : 'bg-slate-950/60 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold">{a.category}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${
                          ['resolved', 'Resolved', 'Closed', 'Cancelled'].includes(a.status)
                            ? 'bg-emerald-600'
                            : ['Acknowledged', 'Assigned', 'Responding'].includes(a.status)
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-rose-600'
                        }`}>
                          {a.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-amber-300 mt-1 truncate">{a.message}</div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {new Date(a.created_at).toLocaleTimeString()}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Right Active SOS Chat Panel */}
              <div className="lg:col-span-8 bg-slate-900/90 rounded-2xl border border-white/10 overflow-hidden flex flex-col">
                {!activeAlert ? (
                  <div className="p-10 text-center text-sm text-slate-400 my-auto">
                    Select an SOS thread or tap <strong>I NEED HELP (SOS)</strong> above to reach Tour Operations immediately.
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-gradient-to-r from-rose-950/80 to-slate-900 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-400 text-slate-950">
                            {activeAlert.priority}
                          </span>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-700 text-white">
                            {activeAlert.status}
                          </span>
                          {isAcknowledged && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                              <CheckCircle2 className="w-3 h-3" /> Acknowledged by Operations
                            </span>
                          )}
                        </div>
                        <h2 className="text-base font-extrabold text-white mt-1.5">
                          {me?.display_name} ({me?.tourist_code}) — {activeAlert.category}
                        </h2>
                        <p className="text-xs text-slate-300 mt-0.5">{activeAlert.message}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        {organizerContact && (
                          <a
                            href={`tel:${organizerContact}`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white px-3 py-2 text-xs font-bold"
                          >
                            <Phone className="w-3.5 h-3.5" /> Call Leader
                          </a>
                        )}
                        {!isClosedOrResolved && (
                          <button
                            type="button"
                            disabled={closingSos}
                            onClick={handleCloseSos}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 text-xs font-extrabold shadow"
                          >
                            <XCircle className="w-3.5 h-3.5" /> {closingSos ? 'Closing...' : "Close SOS (I'm Safe)"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Quick SOS Replies */}
                    <div className="px-4 py-2.5 bg-slate-950/50 border-b border-white/10 flex items-center gap-2 overflow-x-auto">
                      {[
                        'I am waiting right where I sent the pin.',
                        'Please call my phone now.',
                        'I am safe now, thank you!'
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => sendSosReplyText(preset)}
                          className="text-[11px] font-bold bg-slate-800 hover:bg-rose-600 text-slate-100 px-3 py-1.5 rounded-full whitespace-nowrap border border-white/10 transition"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    {/* SOS Messages */}
                    <div className="p-4 space-y-3 min-h-[280px] max-h-[50vh] overflow-y-auto bg-slate-950">
                      {(activeAlert.messages || []).map((msg) => {
                        const isMe = msg.sender_role === 'tourist';
                        return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-md ${
                                isMe
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-800/90 border border-white/10 text-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-4 text-[11px] font-bold mb-1">
                                <span className={isMe ? 'text-rose-100' : 'text-amber-400'}>{msg.sender_name}</span>
                                <span className="text-slate-400 text-[10px]">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p>{msg.message}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={sosBottomRef} />
                    </div>

                    {/* SOS Reply Composer */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendSosReplyText(sosReply);
                      }}
                      className="p-3 bg-slate-900 border-t border-white/10 flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={sosReply}
                        onChange={(e) => setSosReply(e.target.value)}
                        placeholder="Reply directly to Tour Operations..."
                        className="flex-1 rounded-xl bg-slate-950 border border-blue-500/40 px-4 py-2.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                      <button
                        type="submit"
                        disabled={!sosReply.trim()}
                        className="rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white px-4 py-2.5 text-xs sm:text-sm font-extrabold inline-flex items-center gap-1.5 shadow-lg"
                      >
                        <Send className="w-4 h-4" /> Send SOS Reply
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 rounded-2xl p-8 text-center text-sm text-slate-400">Loading chat...</div>
        )}
      </main>
    </div>
  );
}
