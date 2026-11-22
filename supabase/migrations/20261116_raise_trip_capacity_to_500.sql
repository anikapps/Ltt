-- LTT BD: raise the per-trip passenger ceiling from 100 to 500.
-- Run once in the Supabase SQL Editor against an existing project.
BEGIN;

ALTER TABLE public.trips
  ALTER COLUMN max_tourists SET DEFAULT 500;

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
  ADD CONSTRAINT trips_max_tourists_1_500_check
  CHECK (max_tourists >= 1 AND max_tourists <= 500);

-- Keep the existing trip-specific setting, but never permit a roster/member
-- count above that setting. The trip row lock serializes concurrent inserts
-- for the same trip so two imports cannot both pass the final available slot.
CREATE OR REPLACE FUNCTION public.enforce_trip_passenger_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  trip_capacity INTEGER;
  current_count INTEGER;
BEGIN
  SELECT max_tourists INTO trip_capacity
  FROM public.trips
  WHERE id = NEW.trip_id
  FOR UPDATE;

  IF trip_capacity IS NULL THEN
    RAISE EXCEPTION 'Trip not found for passenger record';
  END IF;

  IF TG_TABLE_NAME = 'passenger_roster' THEN
    SELECT COUNT(*) INTO current_count
    FROM public.passenger_roster
    WHERE trip_id = NEW.trip_id;
  ELSE
    SELECT COUNT(*) INTO current_count
    FROM public.trip_members
    WHERE trip_id = NEW.trip_id;
  END IF;

  IF current_count >= LEAST(trip_capacity, 500) THEN
    RAISE EXCEPTION 'Trip passenger capacity of % has been reached', LEAST(trip_capacity, 500)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS passenger_roster_capacity_guard ON public.passenger_roster;
CREATE TRIGGER passenger_roster_capacity_guard
BEFORE INSERT ON public.passenger_roster
FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_passenger_capacity();

DROP TRIGGER IF EXISTS trip_members_capacity_guard ON public.trip_members;
CREATE TRIGGER trip_members_capacity_guard
BEFORE INSERT ON public.trip_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_passenger_capacity();

COMMIT;
