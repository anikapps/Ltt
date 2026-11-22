'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  UserRoundPlus,
  Radio,
  WifiOff,
  LayoutDashboard
} from 'lucide-react';

interface MinimalNavProps {
  tripId?: string;
  tripName?: string;
  touristLabel?: string;
  chatCount?: number;
  hasActiveSos?: boolean;
  sharingEnabled?: boolean;
  sharingStatus?: SharingStatus;
  onToggleSharing?: () => void;
}

export default function MinimalNav({
  tripId,
  tripName = 'LTT BD',
  touristLabel,
  chatCount,
  hasActiveSos = false,
  sharingEnabled,
  sharingStatus,
  onToggleSharing
}: MinimalNavProps) {
  const pathname = usePathname() || '/';
  const isTouristArea = pathname.startsWith('/trip/');
  const isAdminArea = pathname.startsWith('/admin');
  const isJoinArea = pathname.startsWith('/join');
  const pathParts = pathname.split('/');
  const currentTripId = tripId || (isTouristArea ? pathParts[2] : pathname.startsWith('/admin/trips/') ? pathParts[3] : undefined);

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

  return (
    <header className="ltt-nav-wrap">
      <div className="ltt-nav-inner">
        <Link href="/" className="ltt-nav-brand" aria-label="LTT BD home">
          <BrandIdentity tagline={touristLabel || 'Group travel, in sync'} />
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
  );
}
