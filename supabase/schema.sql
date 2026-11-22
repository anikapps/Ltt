-- ============================================================================
-- LTT BD V3 — COMPLETE NORMALIZED POSTGRESQL SCHEMA, INDEXES, & RLS
-- Covers all 18+ tables specified in MASTER_BUILD_PROMPT.md Section 13 & 14.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES (Super Admins, Trip Organizers, Tour Managers, Responders)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'trip_organizer' CHECK (
    role IN ('super_admin', 'trip_organizer', 'tour_manager', 'responder', 'tourist')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TRIPS
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  max_tourists INTEGER NOT NULL DEFAULT 500 CHECK (max_tourists >= 1 AND max_tourists <= 500),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed')),
  organizer_contact TEXT DEFAULT '+8801933-128801',
  stale_threshold_seconds INTEGER NOT NULL DEFAULT 180,
  update_interval_seconds INTEGER NOT NULL DEFAULT 20,
  retention_days INTEGER NOT NULL DEFAULT 7,
  separation_threshold_meters INTEGER NOT NULL DEFAULT 500,
  require_passport BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- 3. ORGANIZER_ASSIGNMENTS (RBAC per Trip: Organizer, Tour Manager, Responder)
CREATE TABLE IF NOT EXISTS public.organizer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_email TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tour_manager' CHECK (
    role IN ('super_admin', 'trip_organizer', 'tour_manager', 'responder', 'main_admin', 'tour_leader', 'assistant_leader')
  ),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, admin_email)
);

-- 4. TRIP_GROUPS (Subgroups within a trip, e.g., Bus A, Bus B, Family Group)
CREATE TABLE IF NOT EXISTS public.trip_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  leader_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PASSENGER_ROSTER (Server-side imported verification records)
CREATE TABLE IF NOT EXISTS public.passenger_roster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  serial_no INTEGER NOT NULL,
  full_name_display TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  passport_hash TEXT NOT NULL,
  passport_masked TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  contact_number_admin TEXT NOT NULL,
  subgroup_name TEXT DEFAULT 'Main Group',
  is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_member_id UUID,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. TRIP_INVITATIONS (Unique Trip URLs, QR tokens, expiry, & revocation)
CREATE TABLE IF NOT EXISTS public.trip_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  invitation_code TEXT NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. TRIP_MEMBERS (Registered Tourists with internal Tourist Code)
CREATE TABLE IF NOT EXISTS public.trip_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  roster_id UUID REFERENCES public.passenger_roster(id) ON DELETE SET NULL,
  tourist_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  subgroup_name TEXT NOT NULL DEFAULT 'Main Group',
  contact_info TEXT,
  passport_masked TEXT,
  nationality TEXT DEFAULT 'Bangladeshi',
  emergency_contact TEXT,
  sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  session_token_hash TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. GROUP_MEMBERS (Mapping between trip_groups and trip_members)
CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.trip_groups(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  UNIQUE (group_id, member_id)
);

-- 9. LOCATION_CONSENTS (Audit log of explicit informed location-sharing consent)
CREATE TABLE IF NOT EXISTS public.location_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  consent_granted BOOLEAN NOT NULL,
  consent_version TEXT NOT NULL DEFAULT 'v1.0',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. LATEST_LOCATIONS (Fast indexed current location per tourist)
CREATE TABLE IF NOT EXISTS public.latest_locations (
  member_id UUID PRIMARY KEY REFERENCES public.trip_members(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy DOUBLE PRECISION NOT NULL DEFAULT 0,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  sharing_status TEXT NOT NULL DEFAULT 'sharing' CHECK (
    sharing_status IN ('sharing', 'disabled', 'offline', 'unavailable')
  ),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. LOCATION_HISTORY (Bounded historical breadcrumbs subject to retention cleanup)
CREATE TABLE IF NOT EXISTS public.location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. MEETING_POINTS (Scheduled Checkpoints & Assembly Points)
CREATE TABLE IF NOT EXISTS public.meeting_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  notes TEXT,
  scheduled_at TIMESTAMPTZ,
  radius_meters INTEGER NOT NULL DEFAULT 250,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. GEOFENCES (Configurable safety zones around meeting points, hotels, venues)
CREATE TABLE IF NOT EXISTS public.geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 300,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. HEADCOUNT_SESSIONS (Digital Roll Calls)
CREATE TABLE IF NOT EXISTS public.headcount_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subgroup_name TEXT DEFAULT 'All',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- 15. HEADCOUNT_RESPONSES (Tourist Check-In Confirmations)
CREATE TABLE IF NOT EXISTS public.headcount_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.headcount_sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'needs_help')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, member_id)
);

-- 16. ASSISTANCE_REQUESTS (7-Category SOS & Help Centre)
CREATE TABLE IF NOT EXISTS public.assistance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  tourist_code TEXT NOT NULL,
  passenger_name TEXT NOT NULL,
  subgroup_name TEXT NOT NULL DEFAULT 'Main Group',
  contact_details TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'Lost / separated from group',
      'Medical assistance',
      'Accident / injury',
      'Transport assistance',
      'Safety / security concern',
      'Cannot find meeting point',
      'Other'
    )
  ),
  priority TEXT NOT NULL DEFAULT 'High' CHECK (priority IN ('Normal', 'High', 'Critical')),
  description TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'New' CHECK (
    status IN ('New', 'Acknowledged', 'Assigned', 'Responding', 'Resolved', 'Closed', 'Cancelled')
  ),
  assigned_responder TEXT,
  internal_notes TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- 17. ASSISTANCE_REQUEST_EVENTS (Audit History per SOS Incident)
CREATE TABLE IF NOT EXISTS public.assistance_request_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.assistance_requests(id) ON DELETE CASCADE,
  actor_label TEXT NOT NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 18. ASSISTANCE_MESSAGES (Two-way communication thread between tourist & responder)
CREATE TABLE IF NOT EXISTS public.assistance_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.assistance_requests(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('tourist', 'organizer', 'responder')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. ANNOUNCEMENTS & RECEIPTS (Trip-wide or subgroup broadcasts)
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  subgroup_name TEXT DEFAULT 'All',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.announcement_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, member_id)
);

-- 20. NOTIFICATION_EVENTS & AUDIT_LOGS
CREATE TABLE IF NOT EXISTS public.notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'in_app',
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'delivered_in_app',
  payload JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_trip_members_trip_id ON public.trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_latest_locations_trip_id ON public.latest_locations(trip_id);
CREATE INDEX IF NOT EXISTS idx_location_history_trip_captured ON public.location_history(trip_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistance_requests_trip_status ON public.assistance_requests(trip_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_meeting_points_trip_id ON public.meeting_points(trip_id);
CREATE INDEX IF NOT EXISTS idx_headcount_sessions_trip_id ON public.headcount_sessions(trip_id);

-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passenger_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.latest_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.headcount_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.headcount_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistance_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistance_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
