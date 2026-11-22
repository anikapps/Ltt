# MASTER BUILD PROMPT — LTT BD
## Smart Group Tracking, Tourist Safety & Emergency Assistance Platform

### 1. Role
Act as a senior full-stack engineer, product designer, database architect, security engineer and QA lead. Build a complete, production-minded web application called **LTT BD**. Do not stop at a prototype, static mockup or visual-only dashboard. Implement the complete working product, including database schema, authentication, authorization, realtime updates, responsive interfaces, validation, error states, tests and deployment documentation.

### 2. Product vision
LTT BD is a mobile-first group travel safety and coordination platform. A tourist joins a trip through a shared URL, QR code or invitation code. With clear consent, the tourist can share their current location with authorized members of that trip. Tourists can locate group members, navigate to meeting points or another member through Google Maps, see trip information and request help. Organizers monitor the group, run headcounts, manage incidents and coordinate assistance through an admin command centre.

**Primary promise:** Help keep every traveller reachable and make it easier to find and assist anyone who becomes separated from the group.

Do not describe the product as guaranteeing that nobody can ever get lost. GPS, mobile browser permissions, network availability, battery state and operating-system background restrictions can affect tracking.

### 3. Required technology
Use the existing LTT BD project direction:
- Next.js App Router
- TypeScript with strict mode
- Supabase PostgreSQL, Auth, Storage and Realtime
- Tailwind CSS and a polished component system
- PWA manifest and service worker for installability and limited offline access
- Vercel-ready deployment
- Google Maps URLs for navigation handoff; use a properly configured map provider for the in-app interactive map.

Use environment variables for all secrets and provider keys. Include `.env.example`. Never hardcode service-role keys or expose privileged credentials in the browser.

### 4. User roles and access
Implement role-based access control:
- **Super Admin:** all platform settings, trips, users, organizers, reports and audit logs.
- **Trip Organizer:** full management of assigned trips.
- **Tour Manager / Guide:** view assigned trip members, run headcounts, create meeting points, receive and handle assistance requests.
- **Responder:** view and update assistance requests assigned to them, with only the minimum tourist data required.
- **Tourist:** access their own profile and trip; view only members and information permitted by trip settings; control their own location-sharing consent.

Enforce permissions in Supabase Row Level Security (RLS), not only by hiding UI elements. Every query and realtime subscription must be scoped to the active trip and authorized user. Prevent cross-trip data leakage.

### 5. Tourist onboarding and registration
Create a frictionless mobile-first joining flow:
- Join using a unique trip URL, QR code or invitation code.
- Validate that the invitation is valid, active, not expired and has remaining capacity if capacity limits are enabled.
- Capture full name and preferred display name.
- Require at least one contact identifier: mobile number OR passport number. Prefer mobile number for day-to-day contact. Passport number must be optional unless the organizer explicitly configures it as required; treat it as highly sensitive data, encrypt or tokenize where feasible, mask it in UI, and never expose it on the public map.
- Optional profile photo, nationality and emergency contact.
- Show trip name, dates, organizer contact and privacy notice before joining.
- Allow organizer approval where enabled.
- Assign a unique internal tourist ID.
- Avoid requiring an account password for a simple join if secure magic-link/OTP or a trip-scoped secure access method is used. Use secure session handling and prevent invitation links from becoming permanent public access tokens.
- Provide clear permission explanations before triggering the browser geolocation prompt.

### 6. Consent-based live location
Implement location sharing as an explicit, revocable choice:
- Ask for browser/device geolocation permission only after explaining what is collected, who can see it, why it is needed and how long it is retained.
- Show a persistent, unmistakable sharing indicator: Sharing / Paused / Permission denied / Offline / Stale.
- Let tourists pause and resume sharing at any time, except that an SOS submission may request a one-time location snapshot with explicit disclosure.
- Capture latitude, longitude, accuracy, captured_at, received_at, speed and heading only when available and necessary.
- Use configurable update intervals and meaningful movement thresholds to balance responsiveness, battery use and data costs.
- Reject invalid coordinates and flag poor accuracy.
- Display last-updated time and accuracy; visually distinguish live from stale locations.
- Mark a location stale after a configurable threshold; never imply that an old coordinate is current.
- Use Supabase Realtime or an appropriate broadcast/presence strategy for authorized live map updates.
- Handle permission denial, browser tab suspension, device sleep, GPS unavailable, network loss and reconnect.
- Queue only safe, minimal pending events when offline and sync when connectivity returns; show pending/sent/failed status.
- Explain that continuous background tracking is not guaranteed in ordinary mobile browsers, especially when the browser is closed or the OS suspends it. Do not fake background tracking.
- Provide a configurable retention policy and scheduled cleanup/aggregation of old precise location points.

### 7. Tourist live map
Build an elegant, fast, accessible interactive map:
- Show authorized members of the current trip/group only.
- Marker with avatar/initials, display name and status.
- Marker clustering for larger groups.
- Search by display name or internal tourist ID; do not expose passport numbers in search.
- Filters: all, sharing now, stale, offline, paused, subgroup.
- Tap a marker to open a detail sheet with display name, permitted contact action, last update, GPS accuracy, distance and directions action.
- Clearly identify last-known locations.
- Provide map/list toggle and accessible list alternative.
- Include current-location recenter control.
- Support meeting-point markers and geofence overlays.
- Do not expose precise tourist locations to anyone outside the active trip's authorized audience.

### 8. Navigation and meeting points
- Provide “Get directions” for a selected tourist or meeting point.
- Open Google Maps using a URL with destination coordinates and an appropriate travel mode. Use the tourist's current device location as the origin where Google Maps supports it.
- Let the user confirm before leaving the web app.
- Do not claim to calculate turn-by-turn navigation inside LTT BD; Google Maps handles navigation.
- Display route distance/ETA only when supplied by a reliable mapping service.
- Allow organizers to create, edit, activate and deactivate meeting points with title, coordinates, notes, schedule and visibility.
- Provide “Navigate to meeting point” and “Share my location” shortcuts.
- Display the next scheduled meeting point and departure time on the tourist home screen.

### 9. Emergency and assistance centre
Make SOS highly visible, but prevent accidental submissions with a clear confirmation step and an easy cancellation window where appropriate.
Categories:
- Lost / separated from group
- Medical assistance
- Accident / injury
- Transport assistance
- Safety / security concern
- Cannot find meeting point
- Other

Each request should record:
- Request ID
- Tourist ID and display name
- permitted contact method
- active trip and subgroup
- category and optional description
- optional attachment
- location snapshot, GPS accuracy and capture time (if permission is available)
- server received time
- status and priority
- assigned responder
- acknowledgement, status-change and resolution timestamps
- complete event/audit history

Workflow:
1. Tourist submits SOS/help request.
2. UI shows a pending state immediately, then confirms only after the server acknowledges receipt.
3. Notify assigned organizers/responders through in-app realtime alerts and configured channels.
4. Organizer acknowledges, assigns responder, adds internal notes and updates status.
5. Tourist can see a simple status timeline and communicate with the assigned team through a secure trip-scoped thread.
6. Escalate unacknowledged high-priority incidents after configurable intervals to additional authorized organizers.
7. Close only with resolution notes and a recorded outcome.

Statuses: New, Acknowledged, Assigned, Responding, Resolved, Closed, Cancelled. Priorities: Normal, High, Critical. Provide fallback contact instructions if submission fails or connectivity is unavailable. Never promise SMS, push, email or WhatsApp delivery unless the relevant provider is configured and delivery is confirmed.

### 10. Admin command centre
Create a desktop-optimized but responsive command centre with:
- Overview cards: active trips, registered tourists, sharing now, stale/offline, open help requests.
- Live map with trip and subgroup filters.
- Search and quick locate.
- Tourist directory with profile, trip, subgroup, status, last location time and permitted contact action.
- Incident inbox sorted by priority and age.
- Assignment and escalation workflow.
- Activity timeline and audit trail.
- Meeting point and geofence management.
- Announcements and trip messages.
- Trip creation/editing, invitation links and QR generation.
- Organizer, guide and responder assignment.
- CSV import with column mapping, preview, validation, duplicate detection and error report.
- CSV export with permission checks and sensitive fields excluded by default.
- Reports for attendance, location-sharing availability, incidents and trip activity.
- Settings for stale thresholds, update intervals, retention, consent text, notification channels and map configuration.

### 11. Smart safety and group coordination
Implement:
- **Digital headcount:** create roll calls for a trip/group/subgroup; tourists confirm present; organizer sees present, missing and not-yet-responded.
- **Scheduled checkpoints:** define time and place for group check-ins.
- **Geofence alerts:** configurable zones around meeting points, hotels or venues. Alert only when location quality and update freshness are adequate; include debounce/hysteresis to avoid GPS drift false alarms.
- **Separation alerts:** optionally flag a tourist who is far from a meeting point or group cluster, with configurable thresholds and clear “possible separation” wording rather than asserting danger.
- **Missing/stale detection:** identify location updates that exceed a configured threshold.
- **Daily itinerary:** show destination, time, instructions, meeting point and organizer contact.
- **Announcements:** trip-wide, subgroup and individual messages; show sent/read status only when technically confirmed.
- **Digital tourist ID:** QR-based trip identification card with minimal information. Never encode passport number or private contact details in a publicly readable QR payload.
- **Offline essentials:** cache itinerary, meeting-point details, organizer phone numbers and emergency instructions. Make clear that live map, realtime alerts and server submission require connectivity.
- **Incident notes:** internal-only notes visible to authorized staff, separated from tourist-visible messages.

### 12. UI / UX and visual direction
Create a premium, reassuring travel-tech identity:
- Deep navy foundation with turquoise/teal and restrained warm-gold accents.
- Clean typography, excellent contrast, generous spacing and refined cards.
- High-quality map experience and clear marker hierarchy.
- Large touch targets and a prominent SOS action.
- Bottom navigation on mobile: Home, Live Map, Help, Trip.
- Desktop sidebar/navigation for admin.
- Light and dark themes.
- Skeleton loading, empty states, error states, permission-denied states and reconnect banners.
- Accessible keyboard navigation, semantic controls, screen-reader labels and WCAG-conscious contrast.
- Keep the tourist experience extremely simple; avoid overwhelming tourists with admin-level controls.
- Use realistic sample data only in a clearly labelled demo/seed environment. Never present fake locations or fake emergency activity as real.

### 13. Data model
Design normalized PostgreSQL tables with timestamps, indexes, foreign keys and constraints. At minimum consider:
- profiles
- trips
- trip_members
- trip_invitations
- trip_groups
- group_members
- organizer_assignments
- location_consents
- latest_locations
- location_history (partition or retention strategy as appropriate)
- meeting_points
- geofences
- headcount_sessions
- headcount_responses
- assistance_requests
- assistance_request_events
- assistance_messages
- announcements
- announcement_receipts
- notification_events
- audit_logs

Use UUID primary keys. Add indexes for trip_id, member_id, captured_at, status, priority and geospatial lookup. Use PostGIS if available for distance and radius queries; otherwise implement safe indexed alternatives. Separate latest location from historical location records. Avoid collecting more data than necessary.

### 14. Security, privacy and reliability
- Enable and test RLS on every table exposed to clients.
- Use server-side authorization for privileged actions.
- Validate all inputs on server and client.
- Rate-limit join attempts, OTP flows, location writes, SOS submissions and messaging.
- Protect invitation tokens; support expiry, revocation and rotation.
- Avoid exposing passport numbers, private phone numbers or emergency contact details to other tourists.
- Encrypt sensitive fields where appropriate and restrict staff access.
- Add audit logs for admin access, exports, assignment changes and incident updates.
- Provide privacy notice, consent history, data export/deletion workflow and configurable retention.
- Prevent IDOR, privilege escalation, cross-trip access and unauthorized realtime subscriptions.
- Use secure headers, safe file upload validation, size/type limits and malware-scanning integration where available.
- Provide backups and recovery guidance.
- Do not store location data indefinitely by default.

### 15. Notifications
Build an extensible notification service:
- In-app realtime notification is required.
- Browser push notifications are optional and require permission.
- Email/SMS/WhatsApp integrations must be explicitly configured with provider credentials.
- Store notification attempt, provider response and delivery status.
- Provide fallback in-app alerts and visible failure states.
- Critical emergency alerts should support escalation to multiple assigned staff members.

### 16. Testing and acceptance criteria
Do not call the project complete until these are verified:
1. A tourist can join a valid trip invitation and cannot join a revoked/expired invitation.
2. A tourist can grant, pause and revoke location-sharing consent.
3. Authorized trip members can see fresh locations; unauthorized users cannot.
4. Stale/offline/paused states are clearly distinguished.
5. Selecting a tourist or meeting point opens a correct Google Maps destination.
6. A tourist can submit an assistance request and receives a truthful server acknowledgement state.
7. Organizers receive, acknowledge, assign, update and close requests.
8. RLS prevents cross-trip access for every role.
9. Headcount, meeting points, announcements and trip management work end to end.
10. CSV import validates and reports errors without silently corrupting records.
11. Mobile layouts work on common phone sizes and desktop admin layouts remain usable.
12. Offline essentials remain available while realtime features clearly show their limitations.
13. No critical page contains dead buttons, fake data presented as real, placeholder actions or unimplemented controls.
14. Automated tests cover authorization, core workflows, validation and important UI states.

### 17. Delivery requirements
Deliver the complete working codebase, not only a plan:
- All application pages, components, API/server actions and database migrations.
- Supabase schema, indexes, RLS policies and seed/demo data.
- `.env.example` with descriptions, no real secrets.
- PWA manifest/service worker and icons.
- Setup and deployment README.
- Test suite and instructions.
- Clear list of integrations requiring external API keys.
- Production build must pass TypeScript, lint and tests.
- Include a final implementation report listing completed features, known platform limitations and exact deployment steps.
- Package the complete source project as a ZIP, excluding `node_modules`, build caches, secrets and real user data.

### 18. Execution instruction
Build the entire application in one coherent implementation. Make sensible decisions without repeatedly asking for approval. If an external service requires credentials, implement the integration boundary, provide `.env.example`, and explain the exact setup needed. Do not silently replace a required feature with a mockup. Prioritize privacy, safety, reliability and a polished user experience over decorative complexity.
