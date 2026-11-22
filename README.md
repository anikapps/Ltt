# LTT BD — Group Travel Coordination & Live Tourist Location Sharing (PWA)

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)
![React](https://img.shields.io/badge/React-18.3-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript)
![Capacity](https://img.shields.io/badge/Trip%20Capacity-Up%20to%20500%20Tourists-0f766e)
![Status](https://img.shields.io/badge/Status-Local%20Evaluation%20Build-amber)

**LTT BD** is a mobile-first Progressive Web Application (PWA) built for **LTT BD operations teams** to coordinate organized group tours (up to **500 passengers per trip**), verify travellers against an imported Excel (`.xlsx`/`.csv`) roster, monitor live tourist GPS locations on a shared group map, and manage emergency assistance requests (`I NEED HELP`).

> **Production Warning (v3.1.0):** Current trip operations still persist to a local JSON store (`data/local-store.json`). Supabase schema and client scaffolding are included, but Supabase is not yet the active database/authentication layer. **Do not deploy this build for real passenger operations or upload real passport/contact data** until the Supabase repository, authentication, RLS, and integration tests are complete. See [`docs/IMPLEMENTATION_STATUS_2026-11-16.md`](docs/IMPLEMENTATION_STATUS_2026-11-16.md).

## Quick Start

### Windows (One-Click Launcher)

1. Clone or extract this repository into a folder on your computer.
2. Double-click **`start-ltt-bd.bat`** (or run `start-ltt-bd.ps1` in PowerShell).
3. On first launch, the setup script creates a private `.env.local`, generates unique local administrator credentials and cryptographic secrets, installs dependencies, runs the 14-point verification suite, and starts the app on `http://localhost:3000` (or the next available port).
4. **Save the administrator email and password printed in the terminal.** They are generated uniquely for your machine and stored only in `.env.local`.

### macOS / Linux / Manual CLI

```bash
npm run setup:local
npm install
npm run test:security
npm run dev
```

Open `/admin` to sign in with the generated local credentials, or test the sample WhatsApp invitation flow at `http://localhost:3000/join/malaysia-tour-2026-invite` using any unclaimed passenger from `public/samples/`.

## Push to GitHub (Windows)

1. Create a new **empty private repository** on GitHub (do **not** check "Add a README" or ".gitignore").
2. Double-click **`restore-to-github.bat`** inside the `ltt-bd` folder.
3. Paste your repository URL (for example, `https://github.com/YOUR_USERNAME/ltt-bd.git`) when prompted.
4. The script verifies Git configuration, stages all tracked source files (automatically excluding `.env.local`, `data/`, and logs via `.gitignore`), commits, and pushes to `main`.

## Project Structure

```text
ltt-bd/
├── .github/                  # GitHub Actions CI, Dependabot, PR & issue templates
├── docs/                     # Setup, deployment, security, branding & status guides
├── public/                   # PWA manifest, service worker, icons & sample rosters
├── scripts/                  # Local env bootstrap, verification tests & load simulator
├── src/
│   ├── app/                  # Next.js App Router pages & server API routes
│   ├── components/           # Map, QR code, navigation, branding & PWA components
│   ├── lib/                  # Repository, roster parser, normalization, HMAC & sessions
│   └── types/                # TypeScript domain definitions
├── supabase/                 # PostgreSQL schema & capacity migration (500 passengers)
├── restore-to-github.bat     # Guided Windows script to push this repo to GitHub
├── start-ltt-bd.bat          # Windows one-click launcher & diagnostics
└── start-ltt-bd.ps1          # PowerShell launcher
```

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run setup:local` | Generates private `.env.local` with unique secrets and local admin credentials |
| `npm run dev` | Starts the Next.js development server on `0.0.0.0` |
| `npm run build` | Creates a production Next.js build |
| `npm run start` | Runs the production Next.js server |
| `npm run test:security` | Runs the 14-point acceptance & security verification suite |
| `npm run typecheck` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run lint` | Runs ESLint with Next.js core-web-vitals rules |
| `npm run simulate:100` | Simulates 100 tourists on the local sample trip |
| `npm run simulate:500` | Simulates 500 tourists on the local sample trip |

## Key Security & Privacy Architecture

1. **Exact Server-Side Roster Matching:** Evaluates `Valid Full Name AND (Valid Passport Number OR Valid Contact Number)` exclusively on the server (`/api/tourist/verify`). Normalizes Bangladesh phone numbers so `017XXXXXXXX`, `+88017XXXXXXXX`, `88017XXXXXXXX`, and Excel-stripped `17XXXXXXXX` match identically.
2. **Zero Roster Exposure to Tourists:** Sensitive identifiers are isolated server-side using trip-scoped keyed HMAC-SHA256 hashes. Fellow tourists only receive `display_name`, `sharing_enabled`, `effective_status`, `last_seen_at`, and GPS coordinates.
3. **Impersonation Mitigations:** Enforces sliding-window rate limiting, duplicate claim lockouts (`is_claimed`), revocable invitation tokens, admin session removal controls, and device session recovery requiring **both** Passport AND Contact Number.
4. **Opt-In Location Sharing & Trip-End Purge:** GPS consent defaults to off. Clicking **End Trip & Purge Personal Data** in the Admin Console permanently removes imported passport hashes, contact numbers, verification records, memberships, GPS locations, and emergency alerts for that trip.

## Troubleshooting (`localhost refused to connect`)

1. Close the browser tab and check the Command Prompt window opened by `start-ltt-bd.bat`.
2. Keep that window open until Next.js prints `Ready` and shows the active local URL (e.g., `http://localhost:3000` or `3001`).
3. If first-run dependency installation failed, verify your internet connection and re-run `start-ltt-bd.bat`.
4. Check `lttbd-startup.log` in the project folder for details (it never logs the generated admin password).

## Documentation

- [`docs/INSTALLATION_AND_SUPABASE_SETUP.md`](docs/INSTALLATION_AND_SUPABASE_SETUP.md) — Supabase database schema setup and environment configuration
- [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md) — Cloudflare Workers (OpenNext), Vercel hosting, and map tile compliance
- [`docs/TESTING_AND_SECURITY_GUIDE.md`](docs/TESTING_AND_SECURITY_GUIDE.md) — Functional, capacity (up to 500 passengers), and security test scenarios
- [`docs/IMPLEMENTATION_STATUS_2026-11-16.md`](docs/IMPLEMENTATION_STATUS_2026-11-16.md) — 500-passenger capacity upgrade status and remaining production checklist
- [`docs/FEATURE_OVERVIEW.md`](docs/FEATURE_OVERVIEW.md) — Feature summary for operations teams and travellers
- [`docs/BRAND_GUIDELINES.md`](docs/BRAND_GUIDELINES.md) — Visual identity and UI design tokens
- [`docs/REVAMP_NOTES.md`](docs/REVAMP_NOTES.md) — Version 3.0 product & UX revamp notes
- [`docs/IMPLEMENTATION_REPORT.md`](docs/IMPLEMENTATION_REPORT.md) — Architecture and implementation report
- [`docs/MASTER_BUILD_PROMPT.md`](docs/MASTER_BUILD_PROMPT.md) — Original product specification and acceptance criteria
- [`SECURITY.md`](SECURITY.md) — Vulnerability reporting and repository safety rules
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Local development and pull request workflow
