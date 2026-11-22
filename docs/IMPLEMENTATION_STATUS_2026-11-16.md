# LTT BD — Implementation Status (16 November 2026)

## Changes made in this delivery

- Centralized the application ceiling in `src/lib/capacity.ts` (`MAX_PASSENGERS_PER_TRIP = 500`).
- Updated trip creation, default trip capacity, roster validation, registration checks and the demo simulator to use the 500-passenger ceiling.
- Updated the admin trip form to allow 1–500 passengers.
- Updated the canonical Supabase schema and added `supabase/migrations/20261116_raise_trip_capacity_to_500.sql` for existing projects.
- Added a 500-passenger sample CSV generator (`npm run simulate:500`).
- Added automated static guardrails for the capacity ceiling and honest storage-mode reporting.
- Corrected the dashboard's storage-mode label: it now reports `local` because repository reads/writes still use local JSON.

## Verification completed

- `node scripts/run-verification-tests.mjs` — 14/14 test groups passed.
- `node scripts/simulate-tourists.mjs 500` — generated a 500-record CSV (501 lines including header).

## Important: not production-ready yet

This delivery does **not** claim cloud production readiness. The repository (`src/lib/repository.ts`) still reads and writes `data/local-store.json`; the Supabase client is not yet the persistence layer for trip operations. A serverless deployment can lose or split local JSON state, and configuring Supabase environment variables does not fix that.

The following work remains before real passenger data or a live commercial tour should be used:

1. Implement Supabase-backed repository operations for every feature path.
2. Configure Supabase Auth and verify every API route's role/ownership checks and database RLS policies.
3. Review the schema against the TypeScript models and add integration tests against a real Supabase test project.
4. Run a true concurrent 500-client load test; the CSV generator and current logic tests are not such a test.
5. Test Android/iOS location behaviour, especially screen lock/background operation. A browser PWA cannot promise uninterrupted background GPS.
6. Add operational backups, monitoring, retention verification and incident-response procedures.
7. Upgrade the existing Next.js 14.2.15 / React 18 stack to a supported release only with compatibility and production build tests.

## Supabase capacity migration

For an existing Supabase database, run `supabase/migrations/20261116_raise_trip_capacity_to_500.sql` in the Supabase SQL Editor. For a new database, use the updated `supabase/schema.sql`.

The migration adds database-side guards to prevent roster/member inserts beyond the configured trip capacity (maximum 500). Back up the database before applying migrations.
