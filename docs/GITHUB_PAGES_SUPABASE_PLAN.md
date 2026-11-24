# LTT BD — Production Plan: GitHub Pages + Supabase (Up to 500 Tourists)

This guide explains how to take LTT BD (`v3.1.0`) from a local Next.js evaluation build to a **production-ready tour operations web app** hosted on **GitHub Pages** (frontend) + **Supabase** (database, authentication, Edge Functions, and Realtime).

---

## 1. Target Architecture

| Layer | Service | What It Runs | Secrets Stored? |
| --- | --- | --- | --- |
| **Frontend (PWA)** | **GitHub Pages** | Static Next.js export (`output: 'export'`) — Admin Console, Tourist Join, Live Map, SOS, Essentials, QR | **No** (public `NEXT_PUBLIC_*` keys only) |
| **API & Security Logic** | **Supabase Edge Functions** | Replaces `src/app/api/*`: roster parsing, HMAC-SHA256 hashing, rate limiting, tourist verification, trip-end PII purge | **Yes** (in Supabase Secrets only) |
| **Database & Auth** | **Supabase Postgres + Auth + RLS** | All 18+ tables from `supabase/schema.sql`, admin login via Supabase Auth, strict Row Level Security | **Yes** (managed by Supabase) |
| **Live Updates** | **Supabase Realtime / Polling** | Live GPS pins, SOS alerts, headcount check-ins, announcements | Public anon key + signed session |

> **Important GitHub Pages Note:** GitHub Pages is **free on public repositories** and requires **GitHub Pro** on private repositories. Because all secrets and passenger data stay inside Supabase, hosting the frontend code in a public repo is safe once `.env.local` and real rosters are never committed.

---

## 2. Step-by-Step Setup & Migration Plan

### Phase 1: Create & Configure Supabase (No Code Changes Yet)

1. Create a new project at `https://supabase.com` (pick **Singapore** region for lowest latency from Bangladesh and Southeast Asia tours).
2. Open **SQL Editor** in Supabase and run:
   - First: `supabase/schema.sql`
   - Second: `supabase/migrations/20261116_raise_trip_capacity_to_500.sql`
3. Open **Authentication → Users** and create your operations admin account(s), then insert matching rows into `public.profiles` with `role = 'super_admin'` or `'trip_organizer'`.
4. Copy your project values from **Project Settings → API**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (keep strictly private — **never** put this in GitHub!)
5. Install the Supabase CLI on Windows and store your server-only secrets inside Supabase:
   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set LTTBD_ROSTER_PEPPER="your-random-64-char-hex"
   supabase secrets set LTTBD_SESSION_SECRET="your-random-64-char-hex"
   ```

### Phase 2: Replace Next.js API Routes with 5 Supabase Edge Functions

GitHub Pages cannot run `src/app/api/*`. Move the server logic into `supabase/functions/`:

| Current Next.js API Route | New Supabase Edge Function | Responsibility |
| --- | --- | --- |
| `/api/admin/auth` | `supabase/functions/admin-auth` | Verify Supabase Auth JWT & check `profiles` role |
| `/api/admin/trips` & `/api/admin/trips/[tripId]` | `supabase/functions/admin-trips` | CRUD trips, meeting points, headcounts, announcements, SOS triage, `end_trip_and_purge_personal_data()` |
| `/api/admin/trips/[tripId]/roster` | `supabase/functions/admin-roster` | Validate `.xlsx`/`.csv` (up to 500 rows), normalize BD phones, compute trip-scoped HMAC hashes, insert into `passenger_roster` |
| `/api/tourist/verify` | `supabase/functions/tourist-verify` | Rate-limited match (`Name AND (Passport OR Contact)`), enforce `is_claimed`, issue signed tourist session token |
| `/api/tourist/trip/[tripId]` | `supabase/functions/tourist-trip` | Return sanitized non-PII group pins/essentials/announcements; accept GPS pings, SOS alerts, headcount check-ins, and chat |

*(Delete `/api/network-info` — it is only needed for local Wi-Fi testing.)*

### Phase 3: Convert Dynamic Routes for Static GitHub Pages Export

Next.js static export (`output: 'export'`) cannot serve unknown dynamic URLs like `/join/[token]` or `/trip/[tripId]` at runtime. Convert them to query-parameter routes:

| Current Dynamic Route | GitHub Pages Static Route |
| --- | --- |
| `/join/[token]` | `/join?token=<invite_token>` |
| `/trip/[tripId]` | `/trip?id=<trip_uuid>` |
| `/trip/[tripId]/chat` | `/trip/chat?id=<trip_uuid>` |
| `/trip/[tripId]/essentials` | `/trip/essentials?id=<trip_uuid>` |
| `/admin/trips/[tripId]` | `/admin/trip?id=<trip_uuid>` |

Then update `next.config.mjs` for GitHub Pages static export:

```js
const isPages = process.env.GITHUB_PAGES === 'true';
const repoBase = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: isPages ? 'export' : undefined,
  basePath: isPages ? repoBase : '',
  assetPrefix: isPages ? repoBase : '',
  trailingSlash: isPages,
  images: { unoptimized: true },
  reactStrictMode: false,
  poweredByHeader: false
};
```

Also update frontend `fetch('/api/...')` calls to point to `https://<project-ref>.supabase.co/functions/v1/<function-name>` and include the `Authorization` / tourist session header.

### Phase 4: Enable GitHub Pages Auto-Deploy

1. In your GitHub repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_MAP_TILE_URL` (commercial tile provider URL)
   - `NEXT_PUBLIC_BASE_PATH` (for example `/LTT-BD`, matching your repo name; leave blank if using a custom domain like `live.lttbd.com`)
3. Run the included `.github/workflows/deploy-pages.yml` workflow from the **Actions** tab (and switch its trigger to `push: branches: [main]` once Phase 2 and Phase 3 are complete).

---

## 3. Real-Tour Production Checklist (500 Passengers)

- **Supabase Quota:** Supabase Free Tier caps Realtime at **200 concurrent connections**. For a **500-passenger tour**, either upgrade to **Supabase Pro (\$25/mo)** or use 30-second HTTP polling instead of persistent Realtime sockets.
- **Map Tiles:** Replace free evaluation tiles with a commercial-compliant key from **Stadia Maps**, **MapTiler**, or **Carto** in `NEXT_PUBLIC_MAP_TILE_URL`.
- **Custom Domain (Optional):** Point `live.lttbd.com` (CNAME to `<username>.github.io`) in GitHub Pages settings so WhatsApp invite links look official (`https://live.lttbd.com/join?token=...`) and don't need a `/LTT-BD` subpath.
- **Field Dry Run:** Before departure, import a 500-row test roster, verify 10+ real Android/iOS phones over mobile data (not Wi-Fi), test SOS acknowledgment, and verify **End Trip & Purge Personal Data** clears all PII tables in Supabase.
