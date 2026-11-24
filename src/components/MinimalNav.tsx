'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import type { SharingStatus } from '@/types/lttbd';
import BrandIdentity from '@/components/BrandIdentity';
import {
  Compass,
  Home,
  MapPin,
  MessageCircle,
  Building2,
  ShieldCheck,
  ShieldAlert,
  UserRoundPlus,
  Radio,
  WifiOff,
  LayoutDashboard,
  X
} from 'lucide-react';

interface MinimalNavProps {
  tripId?: string;
  tripName?: string;
  touristLabel?: string;
  userName?: string;
  role?: string;
  onlineCount?: number;
  chatCount?: number;
  hasActiveSos?: boolean;
  sharingEnabled?: boolean;
  sharingStatus?: SharingStatus;
  onToggleSharing?: () => void;
}

export function MinimalNav({
  tripId,
  tripName: _tripName = 'LTT BD',
  touristLabel,
  userName,
  role: _role,
  onlineCount: _onlineCount,
  chatCount,
  hasActiveSos = false,
  sharingEnabled,
  sharingStatus,
  onToggleSharing
}: MinimalNavProps) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const isTouristArea = pathname.startsWith('/trip/');
  const isAdminArea = pathname.startsWith('/admin');
  const isJoinArea = pathname.startsWith('/join');
  const pathParts = pathname.split('/');
  const currentTripId = tripId || (isTouristArea ? pathParts[2] : pathname.startsWith('/admin/trips/') ? pathParts[3] : undefined);

  // Persistent SOS modal available on every tourist page
  const [sosModalOpen, setSosModalOpen] = useState(false);
  const [sosCategory, setSosCategory] = useState('Lost / separated from group');
  const [sosNote, setSosNote] = useState('');
  const [sendingSos, setSendingSos] = useState(false);
  const [sosError, setSosError] = useState('');

  const brandHref = isTouristArea && currentTripId ? `/trip/${currentTripId}` : isAdminArea ? '/admin' : '/';

  const links: Array<{ href: string; label: string; icon: LucideIcon; exact?: boolean }> = isTouristArea && currentTripId
    ? [
        { href: `/trip/${currentTripId}`, label: 'Live map', icon: MapPin, exact: true },
        { href: `/trip/${currentTripId}/chat`, label: chatCount !== undefined ? `Messages ${chatCount}` : 'Messages', icon: MessageCircle },
        { href: `/trip/${currentTripId}/essentials`, label: 'Trip essentials', icon: Building2 }
      ]
    : isAdminArea
      ? [
          { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
          ...(currentTripId ? [{ href: `/admin/trips/${currentTripId}`, label: 'Trip command', icon: ShieldCheck }] : [])
        ]
      : isJoinArea
        ? [{ href: '/', label: 'Back to home', icon: Home, exact: true }]
        : [
            { href: '/#features', label: 'Features', icon: Compass },
            { href: '/admin', label: 'Operations portal', icon: ShieldCheck },
            { href: '/join', label: 'Join a trip', icon: UserRoundPlus }
          ];

  async function submitGlobalSos(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTripId) return;
    setSosError('');
    setSendingSos(true);

    const sendReq = async (lat: number | null, lng: number | null, acc: number | null) => {
      try {
        const res = await fetch(`/api/tourist/trip/${currentTripId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'emergency_help',
            category: sosCategory,
            note: sosNote || sosCategory,
            latitude: lat,
            longitude: lng,
            accuracy: acc
          })
        });
        const data = await res.json();
        if (!res.ok) {
          setSosError(data.error || 'Could not send SOS. Please call your tour leader directly.');
          return;
        }
        setSosModalOpen(false);
        setSosNote('');
        router.push(`/trip/${currentTripId}/chat?sos=1`);
      } catch {
        setSosError('Network error sending SOS.');
      } finally {
        setSendingSos(false);
      }
    };

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendReq(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        () => sendReq(null, null, null),
        { enableHighAccuracy: true, timeout: 4000 }
      );
    } else {
      await sendReq(null, null, null);
    }
  }

  return (
    <>
      <header className="ltt-nav-wrap">
        <div className="ltt-nav-inner">
          <Link href={brandHref} className="ltt-nav-brand" aria-label={isTouristArea ? 'Live Map Home' : 'LTT BD home'}>
            <BrandIdentity tagline={touristLabel || userName || 'Group travel, in sync'} />
          </Link>

          <nav className="ltt-nav-links" aria-label="Main navigation">
            {links.map((item) => {
              const Icon = item.icon;
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href) && item.href !== '/#features';
              return (
                <Link key={item.href} href={item.href} className={`ltt-nav-link${active ? ' is-active' : ''}`}>
                  <Icon size={15} strokeWidth={2.1} />
                  <span>{item.label}</span>
                  {item.href.includes('/chat') && hasActiveSos && <i className="ltt-nav-alert-dot" aria-label="Active help request" />}
                </Link>
              );
            })}
          </nav>

          {typeof sharingEnabled === 'boolean' && onToggleSharing && (
            <button type="button" onClick={onToggleSharing} className={`ltt-gps-toggle${sharingEnabled && sharingStatus === 'sharing' ? ' is-on' : ''}${sharingEnabled && sharingStatus === 'unavailable' ? ' is-unavailable' : ''}`} aria-pressed={sharingEnabled}>
              {sharingEnabled && sharingStatus === 'sharing' ? <Radio size={15} /> : <WifiOff size={15} />}
              <span>{!sharingEnabled ? 'Sharing paused' : sharingStatus === 'unavailable' ? 'Location unavailable' : sharingStatus === 'offline' ? 'Connection inactive' : 'Location sharing on'}</span>
              <i />
            </button>
          )}
        </div>
      </header>

      {/* Persistent SOS Emergency Banner on every Tourist page */}
      {isTouristArea && currentTripId && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-semibold">
                {hasActiveSos
                  ? 'Active SOS Alert — Tour Operations has your request.'
                  : 'Need urgent help or separated from your group?'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSosModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-xs font-extrabold shadow-sm shrink-0 transition"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              I NEED HELP (SOS)
            </button>
          </div>
        </div>
      )}

      {/* Global SOS Modal */}
      {sosModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-rose-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-extrabold text-rose-700 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5" /> Request Immediate Help (SOS)
              </h2>
              <button type="button" onClick={() => setSosModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Sends your name, contact details, and live GPS coordinates to Operations and opens an emergency chat.
            </p>
            {sosError && (
              <div className="mb-3 rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                {sosError}
              </div>
            )}
            <form onSubmit={submitGlobalSos} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason</label>
                <select
                  value={sosCategory}
                  onChange={(e) => setSosCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
                >
                  <option>Lost / separated from group</option>
                  <option>Medical assistance</option>
                  <option>Accident / injury</option>
                  <option>Transport assistance</option>
                  <option>Safety / security concern</option>
                  <option>Cannot find meeting point</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Note / Landmark</label>
                <input
                  type="text"
                  value={sosNote}
                  onChange={(e) => setSosNote(e.target.value)}
                  placeholder="Describe where you are or what you need..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSosModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingSos}
                  className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white py-2.5 text-xs font-extrabold shadow-sm"
                >
                  {sendingSos ? 'Sending...' : 'SEND SOS & CHAT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default MinimalNav;
