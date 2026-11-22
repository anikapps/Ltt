'use client';

import { MAX_PASSENGERS_PER_TRIP } from '@/lib/capacity';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  MapPin,
  PlusCircle,
  Users,
  Radio,
  WifiOff,
  AlertTriangle,
  Calendar,
  LogOut,
  CheckCircle2,
  Clock,
  Shield,
  Lock,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { Trip, EmergencyAlert } from '@/types/lttbd';
import MinimalNav from '@/components/MinimalNav';
import BrandIdentity from '@/components/BrandIdentity';


function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface DashboardMetrics {
  totalActiveTrips: number;
  upcomingTrips: number;
  completedTrips: number;
  totalRegisteredTourists: number;
  currentlySharing: number;
  stoppedSharing: number;
  offlineTourists: number;
  activeEmergencyRequests: number;
}

export default function AdminDashboardPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [adminUser, setAdminUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [mode, setMode] = useState<'supabase' | 'local'>('local');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<EmergencyAlert[]>([]);
  const [loading, setLoading] = useState(false);

  // Create Trip Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [tripName, setTripName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(() => localDateString(new Date()));
  const [endDate, setEndDate] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 4); return localDateString(date); });
  const [maxTourists, setMaxTourists] = useState(MAX_PASSENGERS_PER_TRIP);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/trips');
      if (res.status === 401) {
        setAdminUser(null);
        return;
      }
      const data = await res.json();
      setMode(data.mode || 'local');
      setMetrics(data.metrics || null);
      setTrips(data.trips || []);
      setActiveAlerts(data.activeAlerts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function checkSession() {
      const res = await fetch('/api/admin/auth');
      if (res.ok) {
        const data = await res.json();
        setAdminUser(data.admin);
        await fetchDashboard();
      }
      setAuthChecked(true);
    }
    checkSession();
  }, [fetchDashboard]);

  // Poll dashboard every 15s when logged in
  useEffect(() => {
    if (!adminUser) return;
    const timer = setInterval(fetchDashboard, 15000);
    return () => clearInterval(timer);
  }, [adminUser, fetchDashboard]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || 'Login failed');
        return;
      }
      setAdminUser(data.admin);
      await fetchDashboard();
    } catch {
      setLoginError('We could not reach the server. Check your connection and try again.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    setAdminUser(null);
  };

  const handleCreateTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const res = await fetch('/api/admin/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tripName,
          destination,
          start_date: startDate,
          end_date: endDate,
          max_tourists: maxTourists
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Could not create trip');
        return;
      }
      setShowCreateModal(false);
      setTripName('');
      setDestination('');
      await fetchDashboard();
    } catch {
      setCreateError('We could not create the trip. Check your connection and try again.');
    } finally {
      setCreating(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-sm text-slate-500">
        Loading LTT BD Admin Portal...
      </div>
    );
  }

  if (!adminUser) {
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-slate-950">
        <MinimalNav tripName="LTT BD" touristLabel="Secure operations access" />
        <main className="ltt-admin-auth">
          <section className="ltt-admin-auth-copy">
            <span className="ltt-eyebrow ltt-eyebrow-light"><span className="ltt-eyebrow-dot" /> LTT BD OPERATIONS</span>
            <h1>Lead the journey.<br /><span style={{ color: '#91aaff' }}>See the whole picture.</span></h1>
            <p>One command space to coordinate trips, keep passenger information organised, monitor group activity, and respond when a traveller needs support.</p>
            <div className="ltt-admin-auth-points">
              <div><CheckCircle2 size={17} /> Live group coordination and location visibility</div>
              <div><CheckCircle2 size={17} /> Passenger roster and invitation management</div>
              <div><CheckCircle2 size={17} /> Incident handling, announcements, and headcounts</div>
            </div>
          </section>
          <section className="ltt-admin-auth-panel">
            <div className="ltt-admin-auth-card">
              <div className="ltt-auth-card-icon"><Shield size={22} /></div>
              <h2>Welcome back</h2>
              <p>Sign in with your authorised LTT BD operations account.</p>

              {loginError && (
                <div role="alert" className="mt-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-semibold">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div className="ltt-auth-field">
                  <label htmlFor="admin-email">Work email</label>
                  <input
                    id="admin-email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="name@company.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div className="ltt-auth-field">
                  <label htmlFor="admin-password">Password</label>
                  <input
                    id="admin-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                <button type="submit" className="ltt-auth-submit">
                  <Lock size={15} /> Sign in securely <ArrowRight size={15} />
                </button>
              </form>
              <div className="ltt-auth-footnote">
                <strong className="text-slate-600">Protected operations area.</strong> Access is limited to authorised team members. For account access, contact your LTT BD system administrator.
              </div>
              <Link href="/" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-700">
                <ArrowRight className="rotate-180" size={14} /> Back to LTT BD
              </Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="ltt-admin-dashboard flex-1 flex flex-col bg-slate-50">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="LTT BD home" className="inline-flex items-center">
            <BrandIdentity compact tagline="" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">LTT BD — Operations Dashboard</h1>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-brand-700 border border-blue-200">
                {mode === 'supabase' ? 'Supabase Cloud DB' : 'Local Evaluation Store'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Signed in as <strong>{adminUser.name}</strong> ({adminUser.email})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchDashboard}
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 bg-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-3.5 py-2 rounded-lg shadow-sm flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            Create New Trip
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-semibold text-slate-600 hover:text-red-600 px-2.5 py-2 rounded-lg border border-slate-200 bg-white flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      <div className="max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* Emergency Banner if any active alerts exist */}
        {activeAlerts.length > 0 && (
          <div className="bg-red-600 text-white rounded-2xl p-4 sm:p-5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
              <div>
                <h2 className="font-bold text-sm sm:text-base">
                  {activeAlerts.length} Active Emergency Assistance Alert(s)!
                </h2>
                <p className="text-xs text-red-100 mt-0.5">
                  Latest: <strong>{activeAlerts[0].passenger_name}</strong> requested help at{' '}
                  {new Date(activeAlerts[0].created_at).toLocaleTimeString()}.
                </p>
              </div>
            </div>
            <Link
              href={`/admin/trips/${activeAlerts[0].trip_id}`}
              className="bg-white text-red-700 hover:bg-red-50 font-bold text-xs px-4 py-2.5 rounded-xl shrink-0 self-start sm:self-center"
            >
              Respond in Trip Console &rarr;
            </Link>
          </div>
        )}

        {/* 8 Required Dashboard Overview Metrics */}
        {metrics && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              Operational Overview
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Active Trips</span>
                  <Calendar className="w-4 h-4 text-brand-600" />
                </div>
                <div className="text-2xl font-extrabold text-slate-900">{metrics.totalActiveTrips}</div>
              </Link>

              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Registered Tourists</span>
                  <Users className="w-4 h-4 text-brand-600" />
                </div>
                <div className="text-2xl font-extrabold text-slate-900">{metrics.totalRegisteredTourists}</div>
              </Link>

              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Sharing Locations</span>
                  <Radio className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-extrabold text-emerald-600">{metrics.currentlySharing}</div>
              </Link>

              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Stopped Sharing</span>
                  <WifiOff className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-extrabold text-amber-600">{metrics.stoppedSharing}</div>
              </Link>

              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Offline / Stale</span>
                  <Clock className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-2xl font-extrabold text-slate-700">{metrics.offlineTourists}</div>
              </Link>

              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Active Emergencies</span>
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                </div>
                <div className="text-2xl font-extrabold text-red-600">{metrics.activeEmergencyRequests}</div>
              </Link>

              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Upcoming Trips</span>
                  <Calendar className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-extrabold text-slate-900">{metrics.upcomingTrips}</div>
              </Link>

              <Link href={trips[0] ? `/admin/trips/${trips[0].id}` : "/admin"} className="bg-white hover:bg-brand-50 hover:border-brand-500 p-4 rounded-xl border border-slate-200 shadow-sm transition block">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Completed Trips</span>
                  <CheckCircle2 className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-2xl font-extrabold text-slate-900">{metrics.completedTrips}</div>
              </Link>
            </div>
          </section>
        )}

        {/* Trips Table / Cards */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Managed Trips ({trips.length})
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-brand-500 transition flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                        trip.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : trip.status === 'upcoming'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      {trip.status}
                    </span>
                    <span className="text-xs text-slate-500">
                      Max Capacity: <strong>{trip.max_tourists}</strong> tourists
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900">{trip.name}</h3>
                  <p className="text-xs text-slate-600 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-brand-600" />
                    {trip.destination}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">
                    Dates: <strong>{trip.start_date}</strong> to <strong>{trip.end_date}</strong>
                  </p>
                  {trip.ended_at && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Ended &amp; PII Purged at: {new Date(trip.ended_at).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <Link
                    href={`/admin/trips/${trip.id}`}
                    className="w-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    Manage Trip, Roster, Map &amp; Invites
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Create Trip Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h2 className="text-base font-bold text-slate-900 mb-1">Create New Trip</h2>
            <p className="text-xs text-slate-500 mb-4">
              Configure trip details and passenger capacity (maximum 500 passengers per trip).
            </p>

            {createError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTrip} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trip Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Malaysia Group Tour"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Destination</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Kuala Lumpur, Malaysia"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value); }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Maximum Passengers (1–500 hard limit)
                </label>
                <input
                  type="number"
                  min={1}
                  max={MAX_PASSENGERS_PER_TRIP}
                  required
                  value={maxTourists}
                  onChange={(e) => setMaxTourists(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs font-semibold text-slate-600 px-4 py-2 rounded-lg border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg"
                >
                  {creating ? 'Creating...' : 'Create Trip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
