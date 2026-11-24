# LTT BD V4 — Group Travel Management & Tourist Safety Platform

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-149eca?logo=react)
![Database](https://img.shields.io/badge/Database-Normalized%20Supabase%20PostgreSQL-3ecf8e?logo=supabase)
![Cost](https://img.shields.io/badge/Free%20Tier-200%20Pax%20%240%2Fmo-16a34a)

**Every Group. Every Journey. Every Tourist. Connected.**

LTT BD V4 is a full-stack group travel operations, live location, and tourist safety platform built on **Next.js 16**, **React 19**, **Normalized Supabase PostgreSQL**, **Supabase Realtime Broadcast & Presence**, **ExcelJS**, and **Esri Free Street Maps**.

---

## What's New in V4

1. **Security & Foundation (Phase 1):**
   - Upgraded to **Next.js 16**, **React 19**, and **Node.js 22 LTS**; replaced `xlsx` 0.18.5 with **ExcelJS** + formula-injection sanitization.
   - Replaced single JSONB state with **normalized PostgreSQL** tables (`trips`, `passenger_roster`, `trip_members`, `latest_locations`, `location_history`, `group_messages`, `announcements`, `assistance_requests`, `remembered_devices`, and append-only `audit_logs`).
   - Supports both **new Supabase Publishable/Secret keys** (`sb_publishable_`, `sb_secret_`) and legacy `anon`/`service_role` keys.
2. **Reliable Live Operations (Phase 2):**
   - **Supabase Realtime Broadcast + Presence** on private trip channels (`trip:<tripId>`) with automatic reconnect and 45s polling fallback.
   - Concurrent-safe GPS persistence (`latest_locations` + `location_history`) and append-only audit logging across 13 operational events.
3. **Premium Product Experience (Phase 3):**
   - **2-Field Smart Tourist Login:** Name (or partial name) + Passport or Mobile Number, automatic cross-trip search, wrong-trip correction, safe disambiguation, **Remember Me** (masked identifier), and **Change Trip** (revoking old trip session).
   - **Post-Login Location Permission Screen:** Explains why location helps, remembers preference, and shows honest browser/GPS status (`Sharing`, `Permission denied`, `GPS disabled`, `Location unavailable`).
   - **Live Map Home (Street Map Default):** Last known locations stay visible with timestamps even when offline.
   - **Redesigned Trip Essentials:** Itinerary, Hotels, Flight details, Travel checklist, Latest announcement, and bottom **Log out**.
   - **Fast Realtime Chat:** Optimistic send, smart auto-scroll + "New messages" pill, pagination, reply, emoji reactions, pin, edit/delete, search, and mute toggle.
   - **Super Admin Control Centre:** Multi-trip command center, **Old Tour Revival** (revoking old sessions/consents/tokens), multi-destination Announcements, and downloadable **BI CSV Reports**.

---

## Quick Upgrade Steps (On Your Existing Supabase + Vercel Setup)

1. **Run the V4 SQL Migration in Supabase:**
   - Open **Supabase → SQL Editor → + New query**.
   - Paste and run **`supabase/migrations/20261124_v4_normalized_upgrade.sql`**.
2. **Push to GitHub via GitHub Desktop:**
   - Replace the files in your local `LTT-BD` folder with this `ltt-bd` folder (keep `.git` untouched), then **Commit to main** → **Push origin**.
   - Vercel automatically runs `npm install` (upgrading to Next.js 16 + React 19 + ExcelJS) and deploys!
