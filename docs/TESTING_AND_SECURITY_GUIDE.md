# Testing & Security Verification Guide (Section 16)

Before using LTT BD on a live commercial tour, verify all 16 test scenarios below.

## 1. Automated Command-Line Test Suite

Run:
```bash
npm run test:security
```
This executes `scripts/run-verification-tests.mjs` and verifies:
- Bangladesh phone number normalization (`017XXXXXXXX`, `+88017XXXXXXXX`, `88017XXXXXXXX`, `0088017XXXXXXXX`, and Excel-stripped `17XXXXXXXX`).
- Exact verification truth table (`Full Name AND (Passport OR Contact)`).
- Rejection of mismatched names or mismatched identifiers.
- Enforcement of the 500-passenger capacity cap.
- Duplicate passenger claim lockout and Trip-End personal data purge.

---

## 2. Interactive Browser Test Checklist

| # | Test Scenario | How to Verify in Browser |
|---:|---|---|
| 1 | **1, 5, 25, 50, 100, 250 & 500 Simulated Passengers** | Open `/admin`, click **Malaysia Group Tour**, locate the **Capacity & Stress Simulator (Section 16)** card on the right, and click **1**, **5**, **25**, **50**, **100**, **250**, and **500** to verify local map marker clustering and table responsiveness. This is a local UI simulation, not a concurrent-device load test. |
| 2 | **Valid Name + Valid Passport (No Contact)** | Open `/join/malaysia-tour-2026-invite`, enter `TANVIR AHMED` and Passport `B11223344` (leave Contact blank). Access is granted immediately. |
| 3 | **Valid Name + Valid Contact (No Passport)** | Open `/join/malaysia-tour-2026-invite`, enter `FARHANA YASMIN` and Contact `01322446688` (or `+8801322446688`). Access is granted immediately. |
| 4 | **Incorrect Passport & Incorrect Contact** | Enter `RAFIQUL ISLAM` with Passport `WRONG123`. Server returns a generic 401 error without leaking whether the name or passport exists. |
| 5 | **Duplicate Passenger Registration** | Try verifying as `MD RAHIM UDDIN` (`A12345678`), who is already joined. The server blocks duplicate registration with HTTP 409 unless **Recover My Session on New Phone** is checked with *both* valid Passport AND Contact. |
| 6 | **Expired or Revoked Invitation** | In Admin Trip Console, click **Revoke Current Link & Generate New Link**, then refresh the old `/join/...` URL. It immediately displays **Invitation Unavailable**. |
| 7 | **Disabled Location Permission / Voluntary Toggle** | On the Tourist Map (`/trip/...`), tap **Sharing: ON** to toggle it to **Sharing: OFF**. Your pin turns grey/inactive on both the tourist and admin maps. |
| 8 | **Offline / Stale Tourist Detection** | Any tourist whose last GPS timestamp exceeds `NEXT_PUBLIC_STALE_LOCATION_SECONDS` (default 180s, such as `NUSRAT JAHAN` in the demo) is automatically marked **Offline / Stale**. |
| 9 | **Emergency Alert (`I NEED HELP`)** | On the Tourist Map, press the red **I NEED HELP** button and confirm. In `/admin/trips/...`, a red emergency banner appears with one-click **Call**, **Locate on Map**, **Acknowledge**, and **Mark Resolved** actions. |
| 10 | **Multiple Administrator Controls** | In the Trip Console under **Trip Administrators & Tour Leaders**, add an Assistant Tour Leader, promote them, or remove them. Server checks ensure only a `main_admin` can modify admin roles. |
| 11 | **Trip-End Personal Data Deletion** | Click **End Trip & Purge Personal Data** in the top right of the Trip Console and confirm. All passports, contact numbers, memberships, locations, and emergency alerts for the trip are permanently deleted. |
| 12 | **Zero Tourist PII Exposure** | Inspect the network response of `GET /api/tourist/trip/[tripId]` in browser DevTools: only `member_id`, `display_name`, `sharing_enabled`, `effective_status`, `last_seen_at`, and coordinates are present—never passports or phone numbers. |
\n\n## 3. Capacity test limitation\n\nThe 500-row CSV generator and local simulator verify data preparation and UI handling only. They do not simulate 500 concurrent phones, network conditions, or Supabase Realtime. A real 500-client load test is still required before production use.\n