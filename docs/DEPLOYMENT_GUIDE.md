# Production Deployment & Cost Strategy Guide

## 1. Map Tile Provider Compliance

Public `tile.openstreetmap.org` servers are not permitted for heavy commercial production apps. LTT BD is pre-configured with `NEXT_PUBLIC_MAP_TILE_URL` in `.env.example` so you can plug in any commercial-compliant OpenStreetMap tile provider:
- **Carto Basemaps / OpenFreeMap** (pre-configured default for evaluation)
- **Stadia Maps** (`https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png?api_key=YOUR_KEY`)
- **MapTiler** (`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=YOUR_KEY`)
- **Thunderforest** (`https://tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=YOUR_KEY`)

---

## 2. Capacity & Free-Tier Quota Considerations (500 Passengers @ 30s Intervals)

- A 500-passenger trip sending GPS updates every 30 seconds generates up to **1,000 updates per minute** (**60,000 updates per hour**) while all 500 browsers are actively open in the foreground.
- For a production implementation, retain the latest position per member and store historical breadcrumbs selectively. The current application repository still writes to local JSON; these database behaviours must not be assumed active until the Supabase repository is implemented.
- Before running a full 500-passenger commercial tour, verify your Supabase Realtime concurrent connection quota (published concurrent Realtime quotas must be checked against 500 passenger devices plus staff; do not assume the default quota is sufficient).

---

## 3. Hosting Options

### Option A: Cloudflare Workers (via OpenNext Cloudflare Adapter)
1. Push your repository to your private `ltt-bd` GitHub repo.
2. Follow the OpenNext Cloudflare adapter guide (`@opennextjs/cloudflare`) or connect your GitHub repository in the Cloudflare Dashboard (**Workers & Pages** &rarr; **Create Application**).
3. Add all environment variables from `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LTTBD_ROSTER_PEPPER`, `LTTBD_SESSION_SECRET`) in your Cloudflare environment settings.

### Option B: Vercel (Zero-Configuration Next.js Hosting)
1. Import your private `ltt-bd` GitHub repository at `https://vercel.com/new`.
2. Paste the environment variables from `.env.example`.
3. Click **Deploy**.


## Production deployment gate

**Do not deploy this current build for real passenger operations.** The application still uses local JSON persistence for trip operations, despite the Supabase schema/client being present. Environment variables alone do not activate cloud persistence. See `IMPLEMENTATION_STATUS_2026-11-16.md` for the remaining production work.
