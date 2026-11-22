# LTT BD — Version 3.1 Brand Refresh Notes

## Product and interface

- Rebuilt the public homepage with a clearer product story, strong join-trip call to action, responsive sections, and a product-preview panel explicitly labelled as illustrative rather than live passenger data.
- Added a dedicated invitation gateway that accepts a trip invite URL, path, or short code and routes travellers into the relevant join flow.
- Reworked shared navigation and visual styling across public, join, tourist, and admin surfaces, including mobile breakpoints, keyboard focus states, and reduced-motion preferences.
- Added consistent loading, not-found, and error states.
- Rebuilt Trip Essentials with clear unconfigured states instead of showing guessed hotel, contact, emergency, or meeting-point details.
- Refreshed PWA metadata, theme colours, icons, and service-worker cache version.

## Onboarding, location, and privacy

- Tourist onboarding is roster-only: the server requires a full-name match plus either the registered passport number or contact number.
- Coach/group assignment comes from the matched roster row; a tourist cannot self-assign to another coach.
- Location sharing starts OFF and requires explicit consent. Denied or unavailable GPS is never replaced with a made-up coordinate.
- Pausing or opting out clears the active location sent by the client; peer responses continue to exclude passport and contact details.
- Meeting-point coordinates must be explicitly configured and pass coordinate/radius validation.
- Demo simulation is restricted to the clearly labelled local sample trip and is blocked in production.

## Administrator setup

- Public pages and sign-in no longer expose fixed demo credentials.
- The first-run setup script creates a local `.env.local` with a unique local administrator password and cryptographic secrets. Credentials are printed once in the startup terminal; save them securely.
- `.env.local` is ignored by Git and is not included in this ZIP.
- Production deployments still require an intentionally configured authentication and secret-management setup; the local bootstrap is not a production identity provider.

## Validation performed for this package

- `node scripts/run-verification-tests.mjs`: all 12 test groups passed (covering 14 acceptance/security criteria).
- TypeScript parser check: all 32 `.ts` / `.tsx` source files parsed with zero syntax diagnostics.
- `node --check` passed for the bootstrap and verification scripts.
- `package.json` and `public/manifest.json` parsed as valid JSON.

A complete `next build` could not be run in the packaging environment because installing npm dependencies repeatedly timed out. The project ZIP therefore contains the source and setup scripts, not `node_modules` or a compiled build. On a computer with Node.js and working npm access, use `start-ltt-bd.bat` for the guided first-run install and launch.

## LTT BD brand refresh

The product has been rebranded as LTT BD across the landing page, navigation, administrator screens, traveller screens, browser metadata, PWA manifest, install prompts, QR labels, documentation, setup scripts and app icons. The original TourBuzz environment variable names remain accepted as legacy aliases so existing local configurations can be migrated without rotating credentials or cryptographic secrets. New installations use the `LTTBD_*` environment variables and `admin@lttbd.local` as the generated local administrator email.
