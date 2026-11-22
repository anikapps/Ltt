# LTT BD — Local Setup and Supabase Preparation

## 1. Run the current build on Windows

1. Extract the ZIP into a folder.
2. Install the current Node.js LTS release if it is not already installed.
3. Double-click `start-ltt-bd.bat`.
4. On first launch, the script creates `.env.local`, generates local administrator credentials and installs dependencies. The first install needs an internet connection.
5. Save the administrator credentials printed in the startup window.
6. Open the local URL printed by the launcher (normally `http://localhost:3000`).

Keep the Command Prompt window open while using the app. Do not share `.env.local`.

## 2. Current database status — important

The current application repository still reads and writes `data/local-store.json`. The Supabase client and SQL schema are present, but trip operations have **not** been migrated to Supabase. Adding Supabase keys to `.env.local` does not switch the app to cloud storage. The dashboard intentionally reports `local` to avoid suggesting otherwise.

This local build is for evaluation and development only. Do not use real passenger passport/contact details or rely on it for a live commercial tour or multi-device production operations.

## 3. Prepare a Supabase database (database schema only)

1. Create a Supabase project.
2. Open its SQL Editor.
3. For a new database, run `supabase/schema.sql`.
4. For an existing database created from the older 100-passenger schema, back up the database first, then run `supabase/migrations/20261116_raise_trip_capacity_to_500.sql`.

This prepares the database schema and the database-side passenger-capacity guards. It does **not** connect the current application repository to that database.

## 4. What remains before cloud launch

- Implement Supabase-backed repository operations for all trip, passenger, location, headcount, chat and SOS features.
- Integrate Supabase Auth with the app's session and role model.
- Verify RLS policies and ownership checks for every API route.
- Add real Supabase integration tests and a 500-client load test.
- Complete mobile background-location and offline testing.
- Only then configure production hosting and secrets.

See `IMPLEMENTATION_STATUS_2026-11-16.md` for the verified scope of this delivery.
