# Google Calendar Sync Configuration System — Design Spec

## Goal

Allow users to connect Google Calendar(s) to the CRM/Gabinet platform with per-calendar configuration: which module imported events map to, how fields are mapped, visibility controls for coworkers, and automatic skeleton record creation for Gabinet appointments. The system uses delta sync (Google syncToken) with a 10-minute cron, with architecture prepared for future webhook-based push notifications.

## Architecture

The sync configuration is per-user, per-calendar. Each user can connect one or more Google Calendars and choose how events from each calendar flow into the platform. An organization admin can also set an org-wide default calendar. The sync pipeline fetches events incrementally via Google's syncToken mechanism, resolves each event into the appropriate module (CRM scheduledActivities or Gabinet appointments), and applies visibility rules before persisting.

## Tech Stack

Convex (schema, mutations, actions, crons), Google Calendar API v3 (calendarList.list, events.list with syncToken), existing OAuth infrastructure (oauthConnections, getValidAccessToken helper), React + shadcn/ui for settings UI.

---

## Section 1: Data Model

### Schema migration: `oauthConnections`

The existing `oauthConnections` table is org-scoped (no `userId` field) and its `createOrUpdate` mutation deactivates all existing active connections for the org when a new one is created. This design must be extended to support per-user connections.

Required changes:

- Add `userId: v.optional(v.id("users"))` to `oauthConnections` schema — optional to preserve backward compat with the existing org-level connection
- Add index `by_userAndProvider: ["userId", "provider", "isActive"]` for per-user lookups
- Update `createOrUpdate` in `convex/oauthConnections.ts`: when `userId` is provided, deactivate only that user's existing connections for the same provider within the same organization (scoped by `userId + organizationId + provider`, not just `userId + provider` — a user in two orgs keeps separate connections). When `userId` is omitted, behavior stays the same (org-level connection).
- Add index `by_userOrgAndProvider: ["userId", "organizationId", "provider", "isActive"]` for org-scoped per-user lookups (in addition to `by_userAndProvider` which is used for simpler queries).
- Add new helper `getValidAccessTokenForConnection(ctx, connectionId)` in `convex/google/_helpers.ts` that fetches the OAuth token directly by connection `_id` rather than by `organizationId`. This is what the sync pipeline uses — it loads the `connectionId` from the sync config and passes it directly. The existing `getValidAccessToken(ctx, organizationId)` continues to work for the org-level default calendar.

### New table: `googleCalendarSyncConfigs`

Stores per-user, per-calendar sync configuration. Each row represents one Google Calendar connected by one user within one organization.

Fields:

- `organizationId: v.id("organizations")` — org context
- `userId: v.id("users")` — who connected this calendar
- `connectionId: v.id("oauthConnections")` — reference to the Google OAuth connection used (now supports per-user connections)
- `googleCalendarId: v.string()` — Google Calendar ID (e.g. `primary`, `user@gmail.com`, or a specific calendar ID)
- `googleCalendarName: v.string()` — display name fetched from Google at connection time
- `isOrgDefault: v.boolean()` — if true, this calendar is the organization-wide default (only one per org). The mutation that sets `isOrgDefault: true` must atomically query for any existing org-default config and set it to `false` before setting the new one.
- `targetModule: v.union(v.literal("crm"), v.literal("gabinet"))` — which module imported events land in
- `targetActivityType: v.optional(v.string())` — for CRM: the activity type (meeting/call/etc). For Gabinet: used as the fallback treatment category when fuzzy-match against the treatment catalog fails. If this is also unset, the appointment is created without a treatment and `requiresCompletion` is flagged.
- `visibility: v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))` — how this calendar's events appear to other users
  - `full` — title, description, attendees, everything visible
  - `busy_only` — other users see a "Zajety" (Busy) block with time only, no details
  - `hidden` — events are not shown to other users at all (only the calendar owner sees them)
- `syncEnabled: v.boolean()` — whether sync is active
- `lastSyncToken: v.optional(v.string())` — Google delta sync token for incremental sync
- `lastSyncAt: v.optional(v.number())` — timestamp of last successful sync
- `syncStatus: v.optional(v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")))` — current sync state
- `syncError: v.optional(v.string())` — last error message if sync failed

Indexes:

- `by_orgAndUser: ["organizationId", "userId"]` — list all calendars for a user in an org
- `by_orgDefault: ["organizationId", "isOrgDefault"]` — find org default calendar
- `by_syncEnabled: ["syncEnabled", "lastSyncAt"]` — cron queries with `.withIndex("by_syncEnabled", q => q.eq("syncEnabled", true)).order("asc")` to get least-recently-synced first. Note: configs with `lastSyncAt: undefined` (never synced) sort before all timestamped records in Convex ascending order — this is intentional, ensuring newly connected calendars get synced first.

### Schema migration: `gabinetAppointments`

The existing `gabinetAppointments.treatmentId` is `v.id("gabinetTreatments")` (non-nullable). The sync pipeline needs to create skeleton appointments where treatment is unknown.

Required change:

- Change `treatmentId` to `v.optional(v.id("gabinetTreatments"))` — allows null when treatment cannot be determined from Google event data
- Add `requiresCompletion: v.optional(v.boolean())` — mirrors the field on `scheduledActivities`, true when the appointment was created from Google sync with missing data
- Add index `by_requiresCompletion: ["organizationId", "requiresCompletion"]` — for the "Do uzupelnienia" KPI query

Existing code that queries/creates `gabinetAppointments` with `treatmentId` as required will continue to work because all manually-created appointments always have a treatment. Only the sync pipeline creates appointments with `treatmentId: undefined`.

### Modifications to existing tables

**`scheduledActivities`** — add fields:

- `requiresCompletion: v.optional(v.boolean())` — true when a Google-imported event was created as a skeleton and needs human input to fill in missing data (e.g. treatment type, patient details)
- `sourceType: v.optional(v.union(v.literal("manual"), v.literal("google"), v.literal("system")))` — origin of the activity, defaults to "manual" for backward compatibility
- `syncConfigId: v.optional(v.id("googleCalendarSyncConfigs"))` — which sync config created this activity; used to look up visibility settings at query time
- `visibilityOverride: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden")))` — per-event visibility (inherits from sync config if not set)

---

## Section 2: Sync Pipeline

The sync pipeline is a three-step process: Fetch, Resolve, Persist. It runs for one `googleCalendarSyncConfigs` entry at a time.

### Step 1: Fetch (Delta Sync)

- Load the sync config and its `connectionId`
- Call `getValidAccessTokenForConnection(ctx, config.connectionId)` to get the OAuth token for this specific user's Google account
- Call Google Calendar API `events.list` with the config's `lastSyncToken` (if present) to get only changed events since last sync
- If no syncToken (first sync), fetch events from 30 days back to 60 days forward
- If syncToken is expired/invalid (410 error), clear the token and do a full re-sync
- Store the new syncToken returned by Google after each successful fetch
- Handle pagination (nextPageToken) within a single fetch cycle

### Step 2: Resolve (Module Routing)

Based on `targetModule` in the sync config:

**CRM path (`targetModule === "crm"`):**
- Map Google event directly to `scheduledActivities`
- Set `activityType` from config's `targetActivityType` (default: "meeting")
- Set `sourceType: "google"`, `googleEventId`, `googleCalendarId`
- Extract Google Meet link from `hangoutLink` or `conferenceData.entryPoints`
- Extract location from `location` field
- Dedup by `googleEventId` index — update if exists, create if new

**Gabinet path (`targetModule === "gabinet"`):**
- For each Google event with attendee data where at least one attendee has an email address:
  1. Pick the first attendee with a valid email (skip attendees without email)
  2. Search for existing patient by email in `gabinetPatients` (using search index or `by_email` index)
  3. If not found, create a skeleton `gabinetPatients` record with: `firstName` from `displayName` (split on space, first part), `lastName` (rest), `email` from attendee email, `isActive: true`, `createdBy: <calendar owner's userId>`. All other required fields on `gabinetPatients` (phone, pesel, etc.) are already `v.optional` in the schema. Flag `requiresCompletion: true` on the appointment (not on the patient — the patient record itself is valid, just sparse).
  4. Fuzzy-match event title against `gabinetTreatments` catalog (case-insensitive substring match). If no match, check config's `targetActivityType` as fallback treatment category. If neither matches, `treatmentId` is left `undefined`.
  5. Create `gabinetAppointment` with:
     - `patientId`: matched or skeleton patient
     - `treatmentId`: matched treatment or `undefined` (field is now optional)
     - `employeeId`: from the calendar owner's linked `gabinetEmployees` record
     - Status: `scheduled`
     - `requiresCompletion: true` if treatmentId is missing or patient was skeleton-created
  6. Create corresponding `scheduledActivities` entry with `moduleRef` pointing to the appointment
  7. Set `requiresCompletion: true` on the scheduledActivity to match the appointment

- For events without attendee data (or where no attendee has an email):
  - Create a blocked time slot (scheduledActivity only, no appointment)
  - Title from Google event, `sourceType: "google"`
  - If visibility is `busy_only`, title becomes "Zajety"

### Step 3: Visibility Application

Applied when persisting and when querying:

- `full` — all data stored and visible to all org members
- `busy_only` — all data stored, but queries for other users return sanitized version: title = "Zajety", no description/attendees/location. Calendar owner sees full data.
- `hidden` — data stored but completely excluded from queries for other users. Only visible to the calendar owner.

**Visibility enforcement at query layer:**

New query functions will be created (not modifying existing ones to avoid breaking changes):

- `getCalendarEventsWithVisibility(ctx, { organizationId, userId, dateRange })` — wrapper around the existing scheduled activities query that applies visibility post-filtering:
  1. Fetch all scheduledActivities in the date range for the org
  2. For each activity with `syncConfigId` set, load the sync config
  3. If the querying `userId` matches the activity's `ownerId` → return full data
  4. Otherwise, check the sync config's `visibility` (or the activity's `visibilityOverride` if set):
     - `full` → return as-is
     - `busy_only` → return with title = "Zajety", description/location/meetingUrl stripped
     - `hidden` → exclude from results

This is a post-filter approach. At the current scale (max ~50-100 events per org per week from Google sync), this is adequate. If performance becomes a concern, a denormalized `visibility` field on `scheduledActivities` with an index would allow pre-filtering.

---

## Section 3: Cron Job + Webhook Preparation

### Cron: Periodic Sync (10 min)

A Convex cron job runs every 10 minutes:

```
crons.interval("sync-google-calendars", { minutes: 10 }, internal.google.calendarSync.syncAll)
```

**`syncAll` internalAction:**
1. Query all `googleCalendarSyncConfigs` with `.withIndex("by_syncEnabled", q => q.eq("syncEnabled", true)).order("asc")` — this iterates in ascending `lastSyncAt` order (least recently synced first)
2. Take up to 5 configs from the iterator (rate limiting)
3. For each config, call `syncCalendarConfig(ctx, configId)`
4. Update `syncStatus` to "syncing" before, "idle" after (or "error" on failure)

Note on fairness: with 5 configs per 10-minute cycle, an org with more than 5 connected calendars will have some calendars synced less frequently. The `lastSyncAt`-based ordering ensures global fairness but not per-org fairness. This is acceptable for the current scale; per-org rate limiting can be added if needed.

**`syncCalendarConfig` internal function:**
This is the core sync function, abstracted to be callable from both the cron and a future webhook handler. It:
1. Loads the sync config and its `connectionId`
2. Gets valid OAuth token via `getValidAccessTokenForConnection(ctx, config.connectionId)` — fetches the token for this specific user's Google account
3. Runs the 3-step pipeline (Fetch → Resolve → Persist)
4. Updates `lastSyncToken` and `lastSyncAt` on the config
5. Returns sync result (events added/updated/deleted count)

**Manual sync: `syncMyCalendars` public action:**
- Callable by users from the UI ("Sync Now" button)
- Syncs all of the calling user's enabled calendars immediately
- Calls the same `syncCalendarConfig` function
- Returns results per calendar

### Webhook Preparation

The architecture is designed so that adding webhook support later requires minimal changes:

- `syncCalendarConfig` is already isolated and callable with just a `configId`
- Future webhook endpoint (`/api/google/calendar/webhook`) will:
  1. Validate the webhook payload (X-Goog-Channel-ID, X-Goog-Resource-ID)
  2. Look up the corresponding `googleCalendarSyncConfigs` by stored channel info
  3. Call the same `syncCalendarConfig` function
- Adding webhook fields to the config table later: `webhookChannelId`, `webhookResourceId`, `webhookExpiration`
- The cron continues as fallback even after webhooks are enabled (catches missed notifications)

---

## Section 4: UI — Settings

### Admin View (Organization Settings)

Located in existing Settings > Integrations or a new "Kalendarz Google" section.

**Org Default Calendar:**
- Dropdown listing all Google Calendars from the admin's connected Google account (fetched via `calendarList.list`)
- "Ustaw jako domyslny" (Set as default) button
- Module mapping: radio group — CRM / Gabinet
- Activity type mapping: dropdown of available types for the chosen module
- Visibility for org calendar is always `full` (all employees see everything)

**Employee Calendar Table:**
- Table showing all employees who have connected personal calendars
- Columns: Employee name, Calendar name, Module, Visibility, Last sync, Status
- Admin can disable/enable sync for any employee's calendar
- Admin cannot change employee's visibility settings (employee controls their own privacy)

### Employee View (Personal Settings or Calendar page)

Accessible from user profile settings or a "Polacz kalendarz" (Connect calendar) button on the calendar page.

**Connection Flow:**
1. "Polacz Google Calendar" button → Google OAuth consent screen (creates a per-user `oauthConnection` with `userId` set)
2. After OAuth success, fetch `calendarList.list` to show available calendars
3. For each calendar the user wants to connect, show config form:
   - Calendar: dropdown (pre-selected)
   - Widocznosc (Visibility): radio group — Pelna / Tylko zajety / Ukryty
   - Modul docelowy (Target module): radio — CRM / Gabinet
   - Typ aktywnosci (Activity type): dropdown based on selected module
   - Synchronizacja (Sync): toggle on/off

**Sync Status Panel:**
- Per-calendar: last sync time, status (idle/syncing/error), event count
- "Synchronizuj teraz" (Sync now) button
- Error details if sync failed

---

## Section 5: UI — Calendar View Changes

### Event Styling by Source

Google-imported events use emerald color scheme (already implemented):
- `bg-emerald-50 border-emerald-400` (light mode)
- `dark:bg-emerald-950/30 dark:border-emerald-700` (dark mode)
- "G" badge indicator on calendar tiles

### Visibility Rendering

- `busy_only` events for non-owners: rendered as gray blocks with title "Zajety", no click-through to details
- `hidden` events: not rendered at all for non-owners
- Calendar owner always sees their own events with full detail regardless of visibility setting

### requiresCompletion Indicators

Events flagged with `requiresCompletion: true` get special treatment:
- Orange/amber warning indicator on calendar tile (small exclamation icon)
- "Uzupelnij" (Complete) button in the event detail panel, which opens the appropriate form (Gabinet appointment form or CRM activity form) pre-filled with available data
- Sidebar KPI in calendar widgets: "Do uzupelnienia: X" showing count of events needing completion (queries `gabinetAppointments` by `by_requiresCompletion` index + `scheduledActivities` with `requiresCompletion: true`)

### Activity List Integration

- "Zrodlo" (Source) column in activity list/table showing: Manual / Google / System
- Filterable by source — users can filter to show only Google-imported activities
- "Wymaga uzupelnienia" (Requires completion) filter option

---

## Open Questions / Future Considerations

1. Conflict resolution: if a Google event is also manually created in the CRM, how to handle duplicates? Current approach: dedup by `googleEventId` only — manual events are separate entities.
2. Two-way sync (CRM → Google): not in scope for this design. Events flow Google → CRM only.
3. Webhook implementation: architecture is prepared but actual webhook registration and endpoint are deferred to a future iteration.
4. Multi-account Google: a user could have multiple Google accounts connected. The per-user `oauthConnections` (with `userId` field) + multiple sync configs with different `connectionId` values supports this.
5. Calendar color customization: currently hardcoded emerald for all Google events. Future: per-calendar color selection.
