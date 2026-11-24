-- ============================================================================
-- LTT BD — Free-Tier Migration (200 Passengers + Persistent App State Table)
-- Run this in Supabase SQL Editor after supabase/schema.sql.
-- ============================================================================

-- 1. Enforce 200-passenger free-tier ceiling on trips.
-- Drop ANY existing max_tourists check constraint (e.g. trips_max_tourists_1_500_check
-- left behind by the 20261116 migration) before adding the free-tier ceiling.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.trips'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%max_tourists%'
  LOOP
    EXECUTE format('ALTER TABLE public.trips DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.trips
  ADD CONSTRAINT trips_max_tourists_check
  CHECK (max_tourists >= 1 AND max_tourists <= 200);

ALTER TABLE public.trips
  ALTER COLUMN max_tourists SET DEFAULT 200;

UPDATE public.trips
  SET max_tourists = 200
  WHERE max_tourists > 200;

-- 2. Server-only persistent JSONB state store (RLS enabled with NO public policies)
-- Only accessible using the server-side SUPABASE_SERVICE_ROLE_KEY.
CREATE TABLE IF NOT EXISTS public.lttbd_app_state (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lttbd_app_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.lttbd_app_state FROM anon, authenticated;
