'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import MinimalNav from '@/components/MinimalNav';
import {
  ArrowLeft,
  MessageSquare,
  Send,
  ShieldAlert,
  Phone,
  MapPin,
  CheckCircle2,
  Building2,
  Sparkles
} from 'lucide-react';
import {
  SafeTouristPeer,
  EmergencyAlert,
  GroupChatMessage,
  TripEssentialHub
} from '@/types/lttbd';
import { buildGoogleMapsDirectionsUrl } from '@/lib/geo';

interface ChatStateResponse {
  trip: {
    id: string;
    name: string;
    destination: string;
    organizer_contact?: string;
    essentials?: TripEssentialHub;
  };
  me: SafeTouristPeer | null;
  groupMessages?: GroupChatMessage[];
  myAlerts: EmergencyAlert[];
}

const QUICK_OPERATION_CHIPS = [
  '🚨 Please call me at my registered number',
  '📍 I am waiting at my current GPS pin',
  '🏨 I am heading back to the Group Hotel',
  '🚌 Where is the tour bus parked?',
  '✅ I am safe and back with the group'
];

export default function TouristOperationsChatPage() {
  const params = useParams<{ tripId: string }>();
  const router = useRouter();
  const tripId = params.tripId;

  const [state, setState] = useState<ChatStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<'sos' | 'group'>('sos');

  const [sosMessageText, setSosMessageText] = useState('');
  const [groupMessageText, setGroupMessageText] = useState('');
  const [attachGps, setAttachGps] = useState(true);
  const [sending, setSending] = useState(false);

  const feedEndRef = useRef<HTMLDivElement | null>(null);

  const fetchChatState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tourist/trip/${tripId}`);
      if (res.status === 401) {
        router.push('/');
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as ChatStateResponse;
      setState(data);
    } finally {
      setLoading(false);
    }
  }, [tripId, router]);

  useEffect(() => {
    fetchChatState();
    const timer = setInterval(fetchChatState, 4000);
    return () => clearInterval(timer);
  }, [fetchChatState]);

  const activeAlert = state?.myAlerts.find(
    (a) => a.status !== 'resolved' && a.status !== 'Resolved' && a.status !== 'Closed' && a.status !== 'Cancelled'
  ) || state?.myAlerts[0] || null;

  useEffect(() => {
    if (!loading && !activeAlert) {
      setActiveChannel('group');
    }
  }, [loading, activeAlert]);

  const handleSendSosReply = async (presetText?: string) => {
    const msg = (presetText ?? sosMessageText).trim();
    if (!msg || !activeAlert) return;
    setSending(true);
    try {
      await fetch(`/api/tourist/trip/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_alert_message',
          alertId: activeAlert.id,
          message: msg
        })
      });
      if (!presetText) setSosMessageText('');
      await fetchChatState();
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } finally {
      setSending(false);
    }
  };

  const handleSendGroupMessage = async (presetText?: string) => {
    const msg = (presetText ?? groupMessageText).trim();
    if (!msg) return;
    setSending(true);
    try {
      await fetch(`/api/tourist/trip/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_group_chat',
          message: msg,
          latitude: attachGps ? state?.me?.latitude : null,
          longitude: attachGps ? state?.me?.longitude : null
        })
      });
      if (!presetText) setGroupMessageText('');
      await fetchChatState();
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } finally {
      setSending(false);
    }
  };

  const handleCancelSos = async (alertId: string) => {
    await fetch(`/api/tourist/trip/${tripId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_emergency', alertId })
    });
    await fetchChatState();
  };

  if (loading || !state) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-slate-500">
        Connecting to LTT BD group chat...
      </div>
    );
  }

  const { trip, me, groupMessages = [] } = state;

  return (
    <div className="ltt-chat-page flex-1 flex flex-col bg-navy-950 text-white min-h-screen">
      <MinimalNav
        tripId={tripId}
        tripName={trip.name}
        touristLabel={me ? `${me.display_name} (${me.tourist_code}) • Operations Chat` : 'Operations Chat'}
        chatCount={groupMessages.length}
        hasActiveSos={Boolean(activeAlert)}
      />

      <div className="max-w-4xl w-full mx-auto p-4 flex-1 flex flex-col gap-4">
        {/* Channel Switcher: Direct SOS Operations Desk vs. Group Lounge */}
        <div className="grid grid-cols-2 gap-2 bg-navy-900 p-1.5 rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={() => setActiveChannel('sos')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition ${
              activeChannel === 'sos'
                ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Direct SOS &amp; Operations Desk
            {activeAlert && (
              <span className="bg-white text-red-700 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                {activeAlert.status}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveChannel('group')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition ${
              activeChannel === 'group'
                ? 'bg-gradient-to-r from-brand-600 to-teal-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Group &amp; Tour Leader Chat ({groupMessages.length})
          </button>
        </div>

        {/* CHANNEL 1: DIRECT SOS & OPERATIONS DESK CHAT */}
        {activeChannel === 'sos' && (
          <div className="flex-1 flex flex-col bg-slate-900/90 rounded-3xl border border-red-500/40 shadow-2xl overflow-hidden">
            {activeAlert ? (
              <>
                {/* Incident Status Header */}
                <div className="bg-gradient-to-r from-red-900/80 via-red-800/80 to-navy-900 p-4 border-b border-red-500/30 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-400 text-navy-950">
                        Priority: {activeAlert.priority || 'High'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-white/20 text-white">
                        Status: {activeAlert.status}
                      </span>
                    </div>
                    <h2 className="text-sm font-extrabold text-white">
                      {activeAlert.category}
                    </h2>
                    <p className="text-[11px] text-red-200">
                      {activeAlert.assigned_responder
                        ? `Assigned Responder: ${activeAlert.assigned_responder}`
                        : 'Operations Command Centre is monitoring your live GPS location.'}
                    </p>
                  </div>

                  {activeAlert.status !== 'Resolved' && activeAlert.status !== 'Cancelled' && (
                    <button
                      type="button"
                      onClick={() => handleCancelSos(activeAlert.id)}
                      className="text-xs font-bold bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-xl border border-white/20"
                    >
                      Mark Safe / Cancel SOS
                    </button>
                  )}
                </div>

                {/* Quick Chips */}
                <div className="px-4 py-2.5 bg-navy-950/60 border-b border-white/10 flex items-center gap-1.5 overflow-x-auto">
                  {QUICK_OPERATION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleSendSosReply(chip)}
                      className="text-[11px] font-bold bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white px-3 py-1.5 rounded-full whitespace-nowrap border border-slate-700 transition"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Direct Operations Message Thread */}
                <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[420px]">
                  {(activeAlert.messages || []).map((m) => {
                    const isStaff = m.sender_role === 'organizer' || m.sender_role === 'responder';
                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isStaff ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs space-y-1 shadow-lg ${
                            isStaff
                              ? 'bg-gradient-to-r from-amber-500/25 to-red-500/25 border border-amber-400/50 text-white'
                              : 'bg-brand-600 text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 text-[10px]">
                            <span className="font-extrabold text-gold-400">
                              {m.sender_name}
                              {isStaff && (
                                <span className="ml-1.5 bg-gold-400 text-navy-950 px-1.5 py-0.2 rounded font-extrabold">
                                  OPERATIONS DESK
                                </span>
                              )}
                            </span>
                            <span className="text-slate-300">
                              {new Date(m.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <p className="leading-relaxed text-sm">{m.message}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={feedEndRef} />
                </div>

                {/* Composer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendSosReply();
                  }}
                  className="p-3.5 bg-navy-950 border-t border-white/10 flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Type a direct message to Operations & Responder..."
                    value={sosMessageText}
                    onChange={(e) => setSosMessageText(e.target.value)}
                    className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 shadow-lg"
                  >
                    <Send className="w-4 h-4" />
                    Send to Operations
                  </button>
                </form>
              </>
            ) : (
              <div className="p-8 text-center space-y-3 my-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="text-sm font-extrabold text-white">No Active Emergency SOS</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  You do not have an open SOS alert right now. Switch to the Group &amp; Tour Leader Chat tab to message everyone, or return to the Live Map to trigger an SOS if you need urgent help.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveChannel('group')}
                  className="bg-brand-600 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl"
                >
                  Switch to Group &amp; Tour Leader Chat
                </button>
              </div>
            )}
          </div>
        )}

        {/* CHANNEL 2: GROUP & TOUR LEADER CHAT */}
        {activeChannel === 'group' && (
          <div className="flex-1 flex flex-col bg-slate-900/90 rounded-3xl border border-white/15 shadow-2xl overflow-hidden">
            <div className="p-3.5 bg-navy-950/70 border-b border-white/10 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {QUICK_OPERATION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSendGroupMessage(chip)}
                    className="text-[11px] font-bold bg-slate-800 hover:bg-brand-600 text-slate-200 hover:text-white px-3 py-1.5 rounded-full whitespace-nowrap border border-slate-700 transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-[11px] text-teal-300 font-bold cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={attachGps}
                  onChange={(e) => setAttachGps(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Attach My GPS Pin
              </label>
            </div>

            <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[440px]">
              {groupMessages.map((msg) => {
                const isMine = msg.sender_id === me?.member_id;
                const isStaff = msg.sender_role === 'organizer' || msg.sender_role === 'responder';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs space-y-1 shadow-lg ${
                        isStaff
                          ? 'bg-gradient-to-r from-amber-500/20 to-teal-500/20 border border-amber-400/50 text-white'
                          : isMine
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-800 text-slate-100 border border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 text-[10px]">
                        <span className="font-extrabold text-gold-400">
                          {msg.sender_name}
                          {isStaff && (
                            <span className="ml-1.5 bg-gold-400 text-navy-950 px-1.5 py-0.2 rounded font-extrabold">
                              OPERATIONS
                            </span>
                          )}
                        </span>
                        <span className="text-slate-400">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <p className="leading-relaxed text-sm">{msg.message}</p>
                      {typeof msg.latitude === 'number' && typeof msg.longitude === 'number' && (
                        <div className="pt-1">
                          <a
                            href={buildGoogleMapsDirectionsUrl({
                              originLat: me?.latitude,
                              originLng: me?.longitude,
                              destLat: msg.latitude,
                              destLng: msg.longitude,
                              travelMode: 'walking'
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-white/15 hover:bg-white/25 text-teal-200 px-2.5 py-1 rounded-lg"
                          >
                            <MapPin className="w-3 h-3" />
                            Open Shared GPS Pin in Google Maps
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={feedEndRef} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendGroupMessage();
              }}
              className="p-3.5 bg-navy-950 border-t border-white/10 flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Write a message to Operations & Tour Group..."
                value={groupMessageText}
                onChange={(e) => setGroupMessageText(e.target.value)}
                className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-3 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={sending}
                className="bg-brand-500 hover:bg-brand-600 text-white font-extrabold text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 shadow-lg"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
