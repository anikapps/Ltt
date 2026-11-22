# Contributing to LTT BD

## Local Setup

1. Install **Node.js 18.17+** (Node 20 LTS recommended) and **Git**.
2. Clone the repository and run the setup script:
   - **Windows:** Double-click `start-ltt-bd.bat` (or run `start-ltt-bd.ps1` in PowerShell).
   - **macOS / Linux:**
     ```bash
     npm run setup:local
     npm install
     npm run dev
     ```
3. Never commit `.env.local` or `data/local-store.json`.

## Before Opening a Pull Request

Run the full verification suite locally:

```bash
npm run test:security
npm run typecheck
npm run lint
npm run build
```

## Guidelines

- Keep passenger PII (`passport_hash`, phone numbers, raw roster rows) strictly server-side.
- Preserve the 500-passenger trip ceiling consistently across `src/lib/capacity.ts`, API routes, `src/lib/repository.ts`, `src/lib/roster-parser.ts`, `supabase/schema.sql`, and `scripts/simulate-tourists.mjs`.
- Update relevant documentation under `docs/` when changing security rules, schema, or deployment requirements.
