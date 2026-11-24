-- ============================================================================
-- LTT BD V4 — NORMALIZED POSTGRESQL UPGRADE MIGRATION
-- Run in Supabase SQL Editor after supabase/schema.sql.
-- Adds V4 columns, group_messages table, remembered_devices, and append-only audit_logs.
-- ============================================================================

-- 1. Expand trips for cancelled/archived revival & structured Trip Essentials
ALTER TABLE public.trips
  DROP CONSTRAINT IF EXISTS trips_status_check;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_status_check
  CHECK (status IN ('upcoming', 'active', 'completed', 'cancelled', 'archived'));

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS essentials JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2. Support session revocation and consent timestamps on trip_members
ALTER TABLE public.trip_members
  ADD COLUMN IF NOT EXISTS session_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_updated_at TIMESTAMPTZ;

-- 3. Add location source & browser permission status to latest_locations
ALTER TABLE public.latest_locations
  ADD COLUMN IF NOT EXISTS location_source TEXT DEFAULT 'gps',
  ADD COLUMN IF NOT EXISTS permission_status TEXT DEFAULT 'granted';

-- 4. Normalized Group Chat Messages (Realtime, reply, reactions, pin, edit, delete, attachments)
CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_code TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('tourist', 'admin', 'system')),
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat', 'announcement')),
  reply_to_id UUID,
  reply_to_preview TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  reactions JSONB NOT NULL DEFAULT '[]'::JSONB,
  attachment_name TEXT,
  attachment_url TEXT,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_messages_trip_created ON public.group_messages(trip_id, created_at DESC);
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- 5. Expand Announcements for multi-destination publishing, expiry, and archiving
ALTER TABLE public.announcements
  ALTER COLUMN trip_id DROP NOT NULL;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS target_member_id UUID,
  ADD COLUMN IF NOT EXISTS destinations JSONB NOT NULL DEFAULT '["essentials","notifications","chat"]'::JSONB,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 6. Revocable Remembered Devices (zero unencrypted PII)
CREATE TABLE IF NOT EXISTS public.remembered_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  device_token_hash TEXT NOT NULL UNIQUE,
  masked_identifier TEXT NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.remembered_devices ENABLE ROW LEVEL SECURITY;

-- 7. Enforce append-only protection on audit_logs (prevent UPDATE or DELETE)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- 8. Ensure service_role has full access to all tables
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
