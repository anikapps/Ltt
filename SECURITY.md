# Security Policy

## Production Readiness Notice

The current build (`v3.1.0`) persists trip operations to a local JSON store (`data/local-store.json`) and is intended for **local evaluation and development only**. Do not deploy this build for live passenger operations or upload real passport/contact data until the Supabase repository, Supabase Auth, Row Level Security (RLS), and integration tests are completed.

## Repository Safety Rules

- **Never commit `.env.local`**, service-role keys, session secrets, or roster HMAC peppers.
- **Never commit `data/local-store.json`**, `lttbd-startup.log`, or real passenger `.xlsx`/`.csv` rosters.
- Keep this repository **private** on GitHub while active development and security hardening are underway.

## Reporting a Vulnerability

If you discover a security issue (such as PII leakage, authentication bypass, rate-limit bypass, or secret exposure):

1. **Do not open a public GitHub issue.**
2. Report the vulnerability privately to the repository maintainer with steps to reproduce and the affected file or route.
3. Avoid attaching real passenger records or live credentials to any report.
