'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Layers,
  Navigation,
  Crosshair,
  Flag,
  Globe,
  Users,
  Search,
  Phone,
  MessageCircle,
  MapPin,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { SafeTouristPeer, MeetingPoint, TripEssentialHub } from '@/types/lttbd';
import { formatDistance, getDistanceMeters, buildGoogleMapsDirectionsUrl } from '@/lib/geo';

export interface MapMarkerPerson extends SafeTouristPeer {
  hasActiveEmergency?: boolean;
  contactNumberAdmin?: string;
}

interface GroupMapProps {
  members: MapMarkerPerson[];
  meetingPoints?: MeetingPoint[];
  essentials?: TripEssentialHub;
  currentMemberId?: string;
  adminOriginCoords?: { lat: number; lng: number } | null;
  focusedMemberId?: string | null;
  routeTargetMember?: MapMarkerPerson | null;
  routeTargetMeetingPoint?: MeetingPoint | null;
  isAdminView?: boolean;
  showSideList?: boolean;
  heightClass?: string;
  onSelectMember?: (member: MapMarkerPerson) => void;
  onRequestDirections?: (member: MapMarkerPerson) => void;
  onRequestMeetingPointDirections?: (mp: MeetingPoint) => void;
}

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return 'No GPS fix yet';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function GroupMap({
  members,
  meetingPoints = [],
  essentials,
  currentMemberId,
  adminOriginCoords,
  focusedMemberId,
  routeTargetMember,
  routeTargetMeetingPoint,
  isAdminView = false,
  showSideList = true,
  heightClass = 'h-[470px]',
  onSelectMember,
  onRequestDirections,
  onRequestMeetingPointDirections
}: GroupMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const tileLayerRef = useRef<import('leaflet').TileLayer | null>(null);
  const markersLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const mpLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const routeLayerRef = useRef<import('leaflet').LayerGroup | null>(null);
  const leafletModRef = useRef<typeof import('leaflet') | null>(null);
  const markerMapRef = useRef<Map<string, import('leaflet').Marker>>(new Map());

  const [clusterEnabled, setClusterEnabled] = useState(false); // Default unclustered so individual pins are immediately clickable
  const [showGeofences, setShowGeofences] = useState(true);
  const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('satellite');
  const [initialFitDone, setInitialFitDone] = useState(false);

  // Side List & Selected Tourist Inspector State
  const [sideSearch, setSideSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<MapMarkerPerson | null>(null);

  const streetTileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ||
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  const satelliteTileUrl =
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  const me = members.find((m) => m.member_id === currentMemberId);
  const activeMp = meetingPoints.find((mp) => mp.is_active) || meetingPoints[0];

  const originLat =
    me?.latitude ?? adminOriginCoords?.lat ?? activeMp?.latitude ?? essentials?.hotel_lat ?? essentials?.airport_lat;
  const originLng =
    me?.longitude ?? adminOriginCoords?.lng ?? activeMp?.longitude ?? essentials?.hotel_lng ?? essentials?.airport_lng;
  const hasKnownMapCenter = typeof originLat === 'number' && typeof originLng === 'number';

  // Keep selectedPerson synced with fresh member updates
  useEffect(() => {
    if (selectedPerson) {
      const updated = members.find((m) => m.member_id === selectedPerson.member_id);
      if (updated) setSelectedPerson(updated);
    } else if (members.length > 0) {
      const firstSharing = members.find((m) => m.latitude !== null) || members[0];
      setSelectedPerson(firstSharing);
    }
  }, [members]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let mounted = true;
    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      const L = await import('leaflet');
      if (!mounted || !mapContainerRef.current) return;

      leafletModRef.current = L;
      const map = L.map(mapContainerRef.current, {
        // Use configured trip coordinates when available; otherwise begin with a neutral world view.
        center: [originLat ?? 18, originLng ?? 0],
        zoom: hasKnownMapCenter ? 13 : 2,
        zoomControl: true
      });

      const baseTile = L.tileLayer(satelliteTileUrl, {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        maxZoom: 19
      }).addTo(map);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        opacity: 0.9
      }).addTo(map);

      const mpLayer = L.layerGroup().addTo(map);
      const routeLayer = L.layerGroup().addTo(map);
      const markersLayer = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
      tileLayerRef.current = baseTile;
      mpLayerRef.current = mpLayer;
      routeLayerRef.current = routeLayer;
      markersLayerRef.current = markersLayer;
    }

    initMap();
    return () => {
      mounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        markersLayerRef.current = null;
        mpLayerRef.current = null;
        routeLayerRef.current = null;
      }
    };
  }, [satelliteTileUrl]);

  // Switch between Satellite and Street Tiles
  useEffect(() => {
    const L = leafletModRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const nextUrl = mapStyle === 'satellite' ? satelliteTileUrl : streetTileUrl;
    tileLayerRef.current = L.tileLayer(nextUrl, {
      attribution:
        mapStyle === 'satellite'
          ? 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
          : '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19
    }).addTo(map);
  }, [mapStyle, streetTileUrl, satelliteTileUrl]);

  // Render Meeting Points, Hotel, & Airport Pins
  useEffect(() => {
    const L = leafletModRef.current;
    const mpLayer = mpLayerRef.current;
    if (!L || !mpLayer) return;

    mpLayer.clearLayers();

    meetingPoints
      .filter((mp) => mp.is_active)
      .forEach((mp) => {
        if (showGeofences && mp.radius_meters > 0) {
          L.circle([mp.latitude, mp.longitude], {
            radius: mp.radius_meters,
            color: '#14b8a6',
            fillColor: '#14b8a6',
            fillOpacity: 0.15,
            weight: 2,
            dashArray: '6, 6'
          }).addTo(mpLayer);
        }

        const mpIcon = L.divIcon({
          className: '',
          html: `<div style="background:#f59e0b;color:#0f172a;border:2.5px solid #fff;border-radius:10px;padding:3px 8px;font-weight:800;font-size:10px;box-shadow:0 4px 10px rgba(0,0,0,0.35);white-space:nowrap;">★ ${mp.title.slice(0, 18)}</div>`,
          iconSize: [115, 26],
          iconAnchor: [57, 13]
        });

        const marker = L.marker([mp.latitude, mp.longitude], { icon: mpIcon });
        const container = document.createElement('div');
        container.style.minWidth = '205px';
        container.style.fontFamily = 'sans-serif';
        container.innerHTML = `
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#d97706;">★ Official Meeting Point</div>
          <div style="font-weight:700;font-size:13px;color:#0f172a;margin-top:2px;">${mp.title}</div>
          <div style="font-size:11px;color:#475569;margin-top:3px;">${mp.notes || 'Group check-in assembly point'}</div>
        `;
        if (onRequestMeetingPointDirections) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = '🧭 Directions to Meeting Point';
          btn.style.cssText =
            'margin-top:8px;width:100%;background:#0d9488;color:#fff;border:none;padding:6px 10px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;';
          btn.onclick = (e) => {
            e.stopPropagation();
            onRequestMeetingPointDirections(mp);
          };
          container.appendChild(btn);
        }
        marker.bindPopup(container);
        marker.addTo(mpLayer);
      });

    if (essentials) {
      if (typeof essentials.hotel_lat === 'number' && typeof essentials.hotel_lng === 'number') {
        const hotelIcon = L.divIcon({
          className: '',
          html: `<div style="background:#1e3a8a;color:#fff;border:2.5px solid #fbbf24;border-radius:10px;padding:3px 8px;font-weight:800;font-size:10px;box-shadow:0 4px 10px rgba(0,0,0,0.35);white-space:nowrap;">🏨 Hotel</div>`,
          iconSize: [76, 26],
          iconAnchor: [38, 13]
        });
        const hMarker = L.marker([essentials.hotel_lat, essentials.hotel_lng], { icon: hotelIcon });
        hMarker.bindPopup(`
          <div style="min-width:195px;font-family:sans-serif;">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#1d4ed8;">🏨 Group Hotel</div>
            <div style="font-weight:700;font-size:13px;color:#0f172a;margin-top:2px;">${essentials.hotel_name}</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">${essentials.hotel_address}</div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${essentials.hotel_lat},${essentials.hotel_lng}&travelmode=driving" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;margin-top:8px;background:#0d9488;color:#fff;text-decoration:none;padding:6px 10px;border-radius:7px;font-size:11px;font-weight:700;">🧭 Directions to Hotel</a>
          </div>
        `);
        hMarker.addTo(mpLayer);
      }

      if (typeof essentials.airport_lat === 'number' && typeof essentials.airport_lng === 'number') {
        const airportIcon = L.divIcon({
          className: '',
          html: `<div style="background:#0f172a;color:#38bdf8;border:2.5px solid #fff;border-radius:10px;padding:3px 8px;font-weight:800;font-size:10px;box-shadow:0 4px 10px rgba(0,0,0,0.35);white-space:nowrap;">✈️ Airport</div>`,
          iconSize: [82, 26],
          iconAnchor: [41, 13]
        });
        const aMarker = L.marker([essentials.airport_lat, essentials.airport_lng], { icon: airportIcon });
        aMarker.bindPopup(`
          <div style="min-width:195px;font-family:sans-serif;">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#0284c7;">✈️ Airport</div>
            <div style="font-weight:700;font-size:13px;color:#0f172a;margin-top:2px;">${essentials.airport_name}</div>
            <div style="font-size:11px;color:#475569;margin-top:2px;">${essentials.airport_terminal}</div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${essentials.airport_lat},${essentials.airport_lng}&travelmode=driving" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;margin-top:8px;background:#0d9488;color:#fff;text-decoration:none;padding:6px 10px;border-radius:7px;font-size:11px;font-weight:700;">🧭 Directions to Airport</a>
          </div>
        `);
        aMarker.addTo(mpLayer);
      }
    }
  }, [meetingPoints, essentials, showGeofences, onRequestMeetingPointDirections]);

  // Render Dashed Route Preview Line
  useEffect(() => {
    const L = leafletModRef.current;
    const map = mapInstanceRef.current;
    const routeLayer = routeLayerRef.current;
    if (!L || !map || !routeLayer) return;

    routeLayer.clearLayers();

    const activeTarget = routeTargetMember || selectedPerson;
    const destLat =
      activeTarget?.latitude ?? routeTargetMeetingPoint?.latitude ?? null;
    const destLng =
      activeTarget?.longitude ?? routeTargetMeetingPoint?.longitude ?? null;

    if (
      typeof destLat === 'number' &&
      typeof destLng === 'number' &&
      typeof originLat === 'number' &&
      typeof originLng === 'number' &&
      (destLat !== originLat || destLng !== originLng)
    ) {
      const latlngs: [number, number][] = [
        [originLat, originLng],
        [destLat, destLng]
      ];
      L.polyline(latlngs, {
        color: '#fbbf24',
        weight: 3.5,
        dashArray: '8, 8',
        opacity: 0.95
      }).addTo(routeLayer);
    }
  }, [routeTargetMember, routeTargetMeetingPoint, selectedPerson, originLat, originLng]);

  // Render Tourist Markers
  useEffect(() => {
    const L = leafletModRef.current;
    const map = mapInstanceRef.current;
    const layerGroup = markersLayerRef.current;
    if (!L || !map || !layerGroup) return;

    layerGroup.clearLayers();
    markerMapRef.current.clear();

    const validMembers = members.filter(
      (m) => typeof m.latitude === 'number' && typeof m.longitude === 'number'
    );

    if (validMembers.length === 0) return;

    validMembers.forEach((person) => {
      const isMe = person.member_id && person.member_id === currentMemberId;
      const isSelected = selectedPerson?.member_id === person.member_id;
      let statusClass = 'ltt-marker-sharing';
      let statusLabel = 'Sharing Live';

      if (person.hasActiveEmergency) {
        statusClass = 'ltt-marker-emergency';
        statusLabel = 'SOS ASSISTANCE REQUESTED';
      } else if (person.effective_status === 'disabled') {
        statusClass = 'ltt-marker-disabled';
        statusLabel = 'Sharing Paused';
      } else if (person.effective_status === 'offline' || person.effective_status === 'unavailable') {
        statusClass = 'ltt-marker-offline';
        statusLabel = 'Stale / Offline (Last Known)';
      } else if (isMe) {
        statusClass = 'ltt-marker-me';
        statusLabel = 'You (Sharing Live)';
      }

      const initials = getInitials(person.display_name);
      const ringStyle = isSelected
        ? 'width:42px;height:42px;border:3px solid #fbbf24;box-shadow:0 0 0 5px rgba(251,191,36,0.45),0 6px 14px rgba(0,0,0,0.5);'
        : 'width:36px;height:36px;';

      const icon = L.divIcon({
        className: '',
        html: `<div class="ltt-marker-pin ${statusClass}" style="${ringStyle}" title="${person.display_name}">${initials}</div>`,
        iconSize: isSelected ? [42, 42] : [36, 36],
        iconAnchor: isSelected ? [21, 21] : [18, 18],
        popupAnchor: [0, -20]
      });

      const marker = L.marker([person.latitude!, person.longitude!], { icon });
      markerMapRef.current.set(person.member_id, marker);

      const distanceText =
        !isMe &&
        typeof originLat === 'number' &&
        typeof originLng === 'number' &&
        typeof person.latitude === 'number' &&
        typeof person.longitude === 'number'
          ? formatDistance(
              getDistanceMeters(originLat, originLng, person.latitude, person.longitude)
            )
          : '';

      const popupContainer = document.createElement('div');
      popupContainer.style.minWidth = '215px';
      popupContainer.style.fontFamily = 'sans-serif';
      popupContainer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
          <span style="font-weight:700;font-size:13px;color:#0f172a;">
            ${person.display_name} ${isMe ? '(You)' : ''}
          </span>
          <span style="font-size:10px;background:#f1f5f9;color:#475569;padding:1px 6px;border-radius:4px;font-family:monospace;">
            ${person.tourist_code || 'TB'}
          </span>
        </div>
        <div style="font-size:10px;color:#64748b;margin-top:1px;">Subgroup: ${person.subgroup_name || 'Main Group'}</div>
        <div style="font-size:11px;font-weight:700;margin-top:3px;color:${
          person.hasActiveEmergency
            ? '#dc2626'
            : person.effective_status === 'sharing'
            ? '#0d9488'
            : '#64748b'
        };">
          ● ${statusLabel}
        </div>
        ${
          distanceText
            ? `<div style="font-size:11px;color:#0f766e;font-weight:700;margin-top:3px;">${distanceText}</div>`
            : ''
        }
        <div style="font-size:10px;color:#475569;margin-top:3px;font-family:monospace;">
          GPS: ${person.latitude!.toFixed(5)}, ${person.longitude!.toFixed(5)}
        </div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">
          Updated: <strong>${formatTimeAgo(person.location_updated_at || person.last_seen_at)}</strong>
        </div>
      `;

      if (!isMe && onRequestDirections) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '🧭 Get Directions (Google Maps)';
        btn.style.cssText =
          'margin-top:8px;width:100%;background:#0d9488;color:#fff;border:none;padding:6px 10px;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;';
        btn.onclick = (e) => {
          e.stopPropagation();
          onRequestDirections(person);
        };
        popupContainer.appendChild(btn);
      }

      marker.bindPopup(popupContainer);
      marker.on('click', () => {
        setSelectedPerson(person);
        if (onSelectMember) onSelectMember(person);
      });
      marker.addTo(layerGroup);
    });

    if (!initialFitDone && validMembers.length > 0) {
      const bounds = L.latLngBounds(
        validMembers.map((m) => [m.latitude!, m.longitude!] as [number, number])
      );
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
      setInitialFitDone(true);
    }
  }, [members, currentMemberId, clusterEnabled, isAdminView, initialFitDone, originLat, originLng, selectedPerson, onSelectMember, onRequestDirections]);

  // Focus & Open Popup when a tourist is clicked in the Side List or via focusedMemberId
  const handleFocusTourist = (person: MapMarkerPerson) => {
    setSelectedPerson(person);
    if (onSelectMember) onSelectMember(person);
    const map = mapInstanceRef.current;
    if (map && typeof person.latitude === 'number' && typeof person.longitude === 'number') {
      map.flyTo([person.latitude, person.longitude], 17, { duration: 0.65 });
      const marker = markerMapRef.current.get(person.member_id);
      if (marker) {
        setTimeout(() => marker.openPopup(), 350);
      }
    }
  };

  useEffect(() => {
    if (!focusedMemberId) return;
    const target = members.find(
      (m) => m.member_id === focusedMemberId || m.display_name === focusedMemberId
    );
    if (target) {
      handleFocusTourist(target);
    }
  }, [focusedMemberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFitAll = () => {
    const L = leafletModRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    const valid = members.filter(
      (m) => typeof m.latitude === 'number' && typeof m.longitude === 'number'
    );
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(
      valid.map((m) => [m.latitude!, m.longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
  };

  const handleRecenterMe = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (me && typeof me.latitude === 'number' && typeof me.longitude === 'number') {
      map.flyTo([me.latitude, me.longitude], 17, { duration: 0.6 });
    } else if (typeof originLat === 'number' && typeof originLng === 'number') {
      map.flyTo([originLat, originLng], 16, { duration: 0.6 });
    }
  };

  const filteredSideMembers = members.filter((m) => {
    if (!sideSearch.trim()) return true;
    const q = sideSearch.trim().toLowerCase();
    return (
      m.display_name.toLowerCase().includes(q) ||
      (m.tourist_code && m.tourist_code.toLowerCase().includes(q)) ||
      (m.subgroup_name && m.subgroup_name.toLowerCase().includes(q))
    );
  });

  const selectedDist =
    selectedPerson &&
    typeof selectedPerson.latitude === 'number' &&
    typeof selectedPerson.longitude === 'number' &&
    typeof originLat === 'number' &&
    typeof originLng === 'number'
      ? getDistanceMeters(originLat, originLng, selectedPerson.latitude, selectedPerson.longitude)
      : null;

  return (
    <div
      className={`grid ${
        showSideList ? 'lg:grid-cols-12' : 'grid-cols-1'
      } gap-3 w-full items-stretch`}
    >
      {/* Left/Main Column: Interactive Satellite Map */}
      <div
        className={`${
          showSideList ? 'lg:col-span-8' : 'col-span-1'
        } relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-inner`}
      >
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Floating Map Controls */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleFitAll}
            className="bg-white/95 hover:bg-white text-slate-800 text-xs font-bold px-3 py-2 rounded-xl shadow-md border border-slate-200 flex items-center gap-1.5"
          >
            <Maximize2 className="w-3.5 h-3.5 text-brand-600" />
            Fit All
          </button>

          <button
            type="button"
            onClick={handleRecenterMe}
            className="bg-white/95 hover:bg-white text-slate-800 text-xs font-bold px-3 py-2 rounded-xl shadow-md border border-slate-200 flex items-center gap-1.5"
          >
            <Crosshair className="w-3.5 h-3.5 text-brand-600" />
            {isAdminView ? 'Center Hub' : 'My Location'}
          </button>

          <button
            type="button"
            onClick={() => setMapStyle((prev) => (prev === 'satellite' ? 'street' : 'satellite'))}
            className="bg-white/95 hover:bg-white text-slate-800 text-xs font-bold px-3 py-2 rounded-xl shadow-md border border-slate-200 flex items-center gap-1.5"
          >
            <Globe className="w-3.5 h-3.5 text-brand-600" />
            {mapStyle === 'satellite' ? 'Street View' : 'Satellite View'}
          </button>

          {meetingPoints.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGeofences((prev) => !prev)}
              className="bg-white/95 hover:bg-white text-slate-800 text-xs font-bold px-3 py-2 rounded-xl shadow-md border border-slate-200 flex items-center gap-1.5"
            >
              <Flag className="w-3.5 h-3.5 text-amber-500" />
              {showGeofences ? 'Zones: ON' : 'Zones: OFF'}
            </button>
          )}
        </div>

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 z-20 bg-navy-950/90 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow border border-white/15 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-white">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 inline-block" /> Live
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> Offline
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> ★ Meeting Point
          </span>
          <span className="flex items-center gap-1">
            <span>🏨 Hotel</span>
          </span>
          <span className="flex items-center gap-1">
            <span>✈️ Airport</span>
          </span>
        </div>
      </div>

      {/* Right Column: Side-by-Side Tourist List & Selected Tourist Inspector Card */}
      {showSideList && (
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden">
          {/* Top: Clickable Tourist List */}
          <div className="p-3 border-b border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-brand-600" />
                Tourists on Map ({filteredSideMembers.length})
              </span>
              <span className="text-[10px] font-semibold text-brand-600">
                Click any tourist to inspect
              </span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Filter by name or ID..."
                value={sideSearch}
                onChange={(e) => setSideSearch(e.target.value)}
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-56 px-2 py-1 flex-1">
            {filteredSideMembers.map((m) => {
              const isSelected = selectedPerson?.member_id === m.member_id;
              return (
                <button
                  key={m.member_id || m.display_name}
                  type="button"
                  onClick={() => handleFocusTourist(m)}
                  className={`w-full py-2 px-2.5 rounded-xl text-left flex items-center justify-between gap-2 transition ${
                    isSelected
                      ? 'bg-brand-50 border border-brand-300'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        m.hasActiveEmergency
                          ? 'bg-red-600 animate-ping'
                          : m.effective_status === 'sharing'
                          ? 'bg-teal-500'
                          : 'bg-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {m.display_name}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {m.tourist_code || 'TB'} • {m.subgroup_name || 'Main Group'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-brand-700 shrink-0">
                    Locate &rarr;
                  </span>
                </button>
              );
            })}
          </div>

          {/* Bottom: Selected Tourist Live Details Inspector Card */}
          {selectedPerson && (
            <div className="p-3.5 bg-navy-950 text-white border-t border-slate-800 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-gold-400 block">
                    Selected Tourist Details
                  </span>
                  <h4 className="font-extrabold text-sm truncate">
                    {selectedPerson.display_name}
                  </h4>
                </div>
                <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-teal-300 shrink-0">
                  {selectedPerson.tourist_code || 'LTT-001'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-white/5 p-2.5 rounded-xl border border-white/10">
                <div>
                  <span className="text-slate-400 block text-[10px]">Status</span>
                  <span className="font-bold text-teal-300 capitalize">
                    {selectedPerson.effective_status === 'sharing'
                      ? '● Live GPS Active'
                      : selectedPerson.effective_status}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Distance</span>
                  <span className="font-bold text-gold-400">
                    {selectedDist !== null ? formatDistance(selectedDist) : 'At your location'}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-white/10 flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1 text-[10px]">
                    <MapPin className="w-3 h-3 text-teal-400" />
                    {selectedPerson.latitude !== null && selectedPerson.longitude !== null
                      ? `${selectedPerson.latitude.toFixed(5)}, ${selectedPerson.longitude.toFixed(5)}`
                      : 'No GPS coordinates'}
                  </span>
                  <span className="text-slate-300 flex items-center gap-1 text-[10px]">
                    <Clock className="w-3 h-3" />
                    {formatTimeAgo(selectedPerson.location_updated_at || selectedPerson.last_seen_at)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {selectedPerson.latitude !== null && selectedPerson.longitude !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onRequestDirections) {
                        onRequestDirections(selectedPerson);
                      } else {
                        const url = buildGoogleMapsDirectionsUrl({
                          originLat,
                          originLng,
                          destLat: selectedPerson.latitude!,
                          destLng: selectedPerson.longitude!,
                          travelMode: 'walking'
                        });
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="flex-1 bg-brand-500 hover:bg-brand-600 text-white font-extrabold text-[11px] py-2 px-3 rounded-xl flex items-center justify-center gap-1 shadow"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Google Maps Directions
                  </button>
                )}

                {isAdminView && selectedPerson.contactNumberAdmin && (
                  <>
                    <a
                      href={`tel:${selectedPerson.contactNumberAdmin}`}
                      className="bg-white/15 hover:bg-white/25 text-white font-bold text-[11px] py-2 px-2.5 rounded-xl flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" />
                      Call
                    </a>
                    <a
                      href={`https://wa.me/${selectedPerson.contactNumberAdmin.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] py-2 px-2.5 rounded-xl flex items-center gap-1"
                    >
                      <MessageCircle className="w-3 h-3" />
                      WA
                    </a>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
