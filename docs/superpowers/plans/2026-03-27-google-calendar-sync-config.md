# Google Calendar Sync Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable per-user Google Calendar connections with module mapping (CRM/Gabinet), visibility controls, skeleton patient creation, delta sync via cron, and a settings UI to manage it all.

**Architecture:** Extend `oauthConnections` to support per-user tokens. Add `googleCalendarSyncConfigs` table for per-calendar configuration. Build a sync pipeline that routes events to CRM (scheduledActivities) or Gabinet (gabinetAppointments + skeleton patients). Enforce visibility at the query layer. Run a 10-min cron for delta sync. Provide admin and employee settings UI.

**Tech Stack:** Convex (schema, mutations, actions, crons), Google Calendar API v3, React, shadcn/ui, i18next, TanStack Router.

**Spec:** `docs/superpowers/specs/2026-03-27-google-calendar-sync-config-design.md`

---

## File Structure

### Files to Modify

| File | Changes |
|------|---------|
| `convex/schema/crm.ts` | Add `userId` + indexes to `oauthConnections`; add `requiresCompletion`, `sourceType`, `syncConfigId`, `visibilityOverride` to `scheduledActivities` |
| `convex/schema/gabinet.ts` | Make `treatmentId` optional on `gabinetAppointments`; add `requiresCompletion` + index |
| `convex/schema.ts` | Add `googleCalendarSyncConfigs` table definition |
| `convex/oauthConnections.ts` | Update `createOrUpdate` for per-user scope; add `getActiveGoogleForUser` internal query |
| `convex/google/_helpers.ts` | Add `getValidAccessTokenForConnection(ctx, connectionId)` helper |
| `convex/scheduledActivities_internal.ts` | Update `upsertFromGoogleImport` to accept new fields (`sourceType`, `syncConfigId`, `requiresCompletion`, `visibilityOverride`) |
| `convex/scheduledActivities.ts` | Add `listForCalendarWithVisibility` query |
| `convex/google/oauth.ts` | Update callback redirect to settings page; pass `userId` to `createOrUpdate` |
| `convex/google/calendar.ts` | Add `listUserCalendars` action |
| `src/routes/_app/_auth/dashboard/_layout.calendar.tsx` | Use visibility-aware query; add `requiresCompletion` indicators; add busy_only rendering |
| `src/components/sidebar-widgets/crm/calendar-widgets.tsx` | Add "Do uzupelnienia" KPI |
| `public/locales/pl/translation.json` | Add all new i18n keys |
| `public/locales/en/translation.json` | Add all new i18n keys |

### Files to Create

| File | Purpose |
|------|---------|
| `convex/googleCalendarSyncConfigs.ts` | CRUD queries/mutations for sync configurations |
| `convex/google/calendarSync.ts` | Sync pipeline: `syncAll` (cron entry), `syncCalendarConfig` (core), `syncMyCalendars` (manual), CRM resolver, Gabinet resolver |
| `convex/google/calendarSyncHelpers.ts` | Internal queries/mutations for Gabinet sync (patient lookup, skeleton creation, treatment match, appointment creation) |
| `convex/crons.ts` | New file — Convex cron registration for `sync-google-calendars` |
| `src/routes/_app/_auth/dashboard/_layout.settings.google-calendar.tsx` | Settings page for Google Calendar sync (admin + employee views) |
| `src/components/settings/google-calendar-sync-settings.tsx` | Sync config form components (calendar picker, module mapping, visibility) |

---

### Task 1: Schema Migrations

All schema changes must deploy together since Convex applies schema atomically.

**Files:**
- Modify: `convex/schema/crm.ts` (oauthConnections ~line 775, scheduledActivities ~line 364)
- Modify: `convex/schema/gabinet.ts` (gabinetAppointments ~line 343)
- Modify: `convex/schema.ts` (add googleCalendarSyncConfigs table)

**Context:**
- `convex/schema.ts` imports `createCrmTables()` from `convex/schema/crm.ts` and `createGabinetTables()` from `convex/schema/gabinet.ts` and spreads them into `defineSchema()`.
- The `googleCalendarSyncConfigs` table is a new CRM-layer table — add it to `createCrmTables()` in `convex/schema/crm.ts`.
- Existing `oauthConnections` table definition starts around line 775 of `convex/schema/crm.ts`.
- Existing `scheduledActivities` table definition starts around line 364 of `convex/schema/crm.ts`.
- Existing `gabinetAppointments` table definition starts around line 343 of `convex/schema/gabinet.ts`.

- [ ] **Step 1: Add `userId` and indexes to `oauthConnections`**

In `convex/schema/crm.ts`, find the `oauthConnections` table definition. Add:

```typescript
// Add to oauthConnections fields:
userId: v.optional(v.id("users")),

// Add to oauthConnections indexes:
.index("by_userAndProvider", ["userId", "provider", "isActive"])
.index("by_userOrgAndProvider", ["userId", "organizationId", "provider", "isActive"])
```

- [ ] **Step 2: Add new fields to `scheduledActivities`**

In `convex/schema/crm.ts`, find the `scheduledActivities` table definition. Add these fields alongside the existing Google-related fields (`googleEventId`, `googleCalendarId`, `lastGoogleSyncAt`):

```typescript
requiresCompletion: v.optional(v.boolean()),
sourceType: v.optional(v.union(v.literal("manual"), v.literal("google"), v.literal("system"))),
syncConfigId: v.optional(v.id("googleCalendarSyncConfigs")),
visibilityOverride: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
```

- [ ] **Step 3: Modify `gabinetAppointments`**

In `convex/schema/gabinet.ts`, find the `gabinetAppointments` table definition.

Change:
```typescript
treatmentId: v.id("gabinetTreatments"),
```
To:
```typescript
treatmentId: v.optional(v.id("gabinetTreatments")),
```

Add field:
```typescript
requiresCompletion: v.optional(v.boolean()),
```

Add index:
```typescript
.index("by_requiresCompletion", ["organizationId", "requiresCompletion"])
```

- [ ] **Step 4: Add `googleCalendarSyncConfigs` table**

In `convex/schema/crm.ts`, add the new table inside `createCrmTables()`:

```typescript
googleCalendarSyncConfigs: defineTable({
  organizationId: v.id("organizations"),
  userId: v.id("users"),
  connectionId: v.id("oauthConnections"),
  googleCalendarId: v.string(),
  googleCalendarName: v.string(),
  isOrgDefault: v.boolean(),
  targetModule: v.union(v.literal("crm"), v.literal("gabinet")),
  targetActivityType: v.optional(v.string()),
  visibility: v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden")),
  syncEnabled: v.boolean(),
  lastSyncToken: v.optional(v.string()),
  lastSyncAt: v.optional(v.number()),
  syncStatus: v.optional(v.union(v.literal("idle"), v.literal("syncing"), v.literal("error"))),
  syncError: v.optional(v.string()),
})
  .index("by_orgAndUser", ["organizationId", "userId"])
  .index("by_orgDefault", ["organizationId", "isOrgDefault"])
  .index("by_syncEnabled", ["syncEnabled", "lastSyncAt"]),
```

- [ ] **Step 5: Verify schema deploys**

Run: `npx convex dev --once --typecheck=disable`
Expected: Schema push succeeds without errors.

- [ ] **Step 6: Commit**

```bash
git add convex/schema/crm.ts convex/schema/gabinet.ts
git commit -m "feat(schema): add Google Calendar sync config table and schema migrations

- Add userId + indexes to oauthConnections for per-user OAuth
- Add requiresCompletion, sourceType, syncConfigId, visibilityOverride to scheduledActivities
- Make gabinetAppointments.treatmentId optional for skeleton appointments
- Add googleCalendarSyncConfigs table with indexes"
```

---

### Task 2: Per-User OAuth Support

Extend the OAuth mutations and helpers to support per-user Google connections.

**Files:**
- Modify: `convex/oauthConnections.ts`
- Modify: `convex/google/_helpers.ts`
- Modify: `convex/google/oauth.ts` (pass userId to createOrUpdate)

**Context:**
- `convex/oauthConnections.ts` has `createOrUpdate` internal mutation (line ~72) that deactivates ALL active Google connections for the org before creating a new one. This must be scoped to per-user when `userId` is provided.
- `convex/google/_helpers.ts` has `getValidAccessToken(ctx, organizationId)` that returns `{ accessToken, connectionId } | null`. We need a new `getValidAccessTokenForConnection(ctx, connectionId)` that fetches by connection ID directly.
- `convex/google/oauth.ts` callback (line ~70) calls `internal.oauthConnections.createOrUpdate` — needs to pass `userId` from the OAuth state.
- The OAuth `initiate` handler already encodes `{ organizationId, userId }` in the state parameter.

- [ ] **Step 1: Update `createOrUpdate` mutation to accept optional `userId`**

In `convex/oauthConnections.ts`, modify the `createOrUpdate` internal mutation:

Add `userId: v.optional(v.id("users"))` to the args.

In the handler, change the deactivation logic:
- If `args.userId` is provided: query `oauthConnections` by `by_userOrgAndProvider` index where `userId === args.userId && organizationId === args.organizationId && provider === "google" && isActive === true`. Deactivate only those.
- If `args.userId` is NOT provided: keep current behavior (deactivate all org-level connections).

When inserting the new connection, include `userId: args.userId` in the record.

- [ ] **Step 2: Update OAuth callback to pass `userId`**

In `convex/google/oauth.ts`, the callback handler decodes state as `{ organizationId, userId }`. Find the call to `ctx.runMutation(internal.oauthConnections.createOrUpdate, { ... })` and add `userId: state.userId` to the args object.

- [ ] **Step 3: Add `getValidAccessTokenForConnection` helper**

In `convex/google/_helpers.ts`, add a new exported async function:

```typescript
export async function getValidAccessTokenForConnection(
  ctx: ActionCtx,
  connectionId: Id<"oauthConnections">
): Promise<{ accessToken: string; connectionId: Id<"oauthConnections"> } | null> {
  // Fetch the connection directly by _id
  const connection = await ctx.runQuery(
    internal.oauthConnections.getById,
    { connectionId }
  );
  if (!connection || !connection.isActive) return null;

  // Check if token needs refresh (same logic as getValidAccessToken)
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000;
  if (connection.expiresAt && connection.expiresAt - bufferMs < now) {
    // Refresh token using same logic as existing getValidAccessToken
    if (!connection.refreshToken) return null;
    // Use the same env import as existing getValidAccessToken: import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@cvx/env";
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: connection.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    await ctx.runMutation(internal.oauthConnections.updateTokens, {
      connectionId: connection._id,
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    });
    return { accessToken: data.access_token, connectionId: connection._id };
  }

  return { accessToken: connection.accessToken, connectionId: connection._id };
}
```

- [ ] **Step 4: Add `getById` internal query to oauthConnections**

In `convex/oauthConnections.ts`, add:

```typescript
export const getById = internalQuery({
  args: { connectionId: v.id("oauthConnections") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.connectionId);
  },
});
```

- [ ] **Step 5: Verify deployment**

Run: `npx convex dev --once --typecheck=disable`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add convex/oauthConnections.ts convex/google/_helpers.ts convex/google/oauth.ts
git commit -m "feat(oauth): support per-user Google OAuth connections

- createOrUpdate scopes deactivation to userId when provided
- OAuth callback passes userId from state
- Add getValidAccessTokenForConnection helper for sync pipeline
- Add getById internal query for connection lookup"
```

---

### Task 3: Sync Config CRUD

Create the queries and mutations for managing `googleCalendarSyncConfigs`.

**Files:**
- Create: `convex/googleCalendarSyncConfigs.ts`

**Context:**
- Follow patterns from `convex/oauthConnections.ts` for CRUD structure.
- Use `verifyOrgAccess(ctx, organizationId)` for auth (imported from `convex/_helpers/permissions.ts` or wherever `verifyOrgAccess` lives — check `convex/contacts.ts` for import pattern).
- The `isOrgDefault` uniqueness must be enforced: when setting `isOrgDefault: true`, atomically clear any existing org-default first.
- `checkPermission` is not needed here — any org member can manage their own sync configs; admins can manage all.

- [ ] **Step 1: Create the file with imports and list query**

Create `convex/googleCalendarSyncConfigs.ts`:

```typescript
import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { verifyOrgAccess } from "./_helpers/auth";

// List all sync configs for the current user in an org
export const listMine = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", user._id)
      )
      .collect();
  },
});

// List all sync configs in an org (admin view)
export const listAll = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    // TODO: could add admin permission check here
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
  },
});

// Get org default calendar config
export const getOrgDefault = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgDefault", (q) =>
        q.eq("organizationId", args.organizationId).eq("isOrgDefault", true)
      )
      .first();
  },
});
```

- [ ] **Step 2: Add create mutation**

```typescript
export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    connectionId: v.id("oauthConnections"),
    googleCalendarId: v.string(),
    googleCalendarName: v.string(),
    isOrgDefault: v.optional(v.boolean()),
    targetModule: v.union(v.literal("crm"), v.literal("gabinet")),
    targetActivityType: v.optional(v.string()),
    visibility: v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const isOrgDefault = args.isOrgDefault ?? false;

    // If setting as org default, clear existing default
    if (isOrgDefault) {
      const existing = await ctx.db
        .query("googleCalendarSyncConfigs")
        .withIndex("by_orgDefault", (q) =>
          q.eq("organizationId", args.organizationId).eq("isOrgDefault", true)
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { isOrgDefault: false });
      }
    }

    return await ctx.db.insert("googleCalendarSyncConfigs", {
      organizationId: args.organizationId,
      userId: user._id,
      connectionId: args.connectionId,
      googleCalendarId: args.googleCalendarId,
      googleCalendarName: args.googleCalendarName,
      isOrgDefault,
      targetModule: args.targetModule,
      targetActivityType: args.targetActivityType,
      visibility: args.visibility,
      syncEnabled: true,
      syncStatus: "idle",
    });
  },
});
```

- [ ] **Step 3: Add update and remove mutations**

```typescript
export const update = mutation({
  args: {
    configId: v.id("googleCalendarSyncConfigs"),
    targetModule: v.optional(v.union(v.literal("crm"), v.literal("gabinet"))),
    targetActivityType: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
    syncEnabled: v.optional(v.boolean()),
    isOrgDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error("Config not found");
    await verifyOrgAccess(ctx, config.organizationId);

    const { configId, ...updates } = args;

    // If setting as org default, clear existing default
    if (updates.isOrgDefault === true) {
      const existing = await ctx.db
        .query("googleCalendarSyncConfigs")
        .withIndex("by_orgDefault", (q) =>
          q.eq("organizationId", config.organizationId).eq("isOrgDefault", true)
        )
        .first();
      if (existing && existing._id !== configId) {
        await ctx.db.patch(existing._id, { isOrgDefault: false });
      }
    }

    // Filter out undefined values
    const patch: Record<string, unknown> = {};
    if (updates.targetModule !== undefined) patch.targetModule = updates.targetModule;
    if (updates.targetActivityType !== undefined) patch.targetActivityType = updates.targetActivityType;
    if (updates.visibility !== undefined) patch.visibility = updates.visibility;
    if (updates.syncEnabled !== undefined) patch.syncEnabled = updates.syncEnabled;
    if (updates.isOrgDefault !== undefined) patch.isOrgDefault = updates.isOrgDefault;

    await ctx.db.patch(configId, patch);
  },
});

export const remove = mutation({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId);
    if (!config) throw new Error("Config not found");
    await verifyOrgAccess(ctx, config.organizationId);
    await ctx.db.delete(args.configId);
  },
});
```

- [ ] **Step 4: Add internal queries/mutations for the sync pipeline**

```typescript
// Used by sync pipeline to get configs that need syncing
export const getEnabledConfigs = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_syncEnabled", (q) => q.eq("syncEnabled", true))
      .order("asc")
      .take(args.limit);
  },
});

// Used by sync pipeline to get a single config
export const getById = internalQuery({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.configId);
  },
});

// Used by sync pipeline to update sync state
export const updateSyncState = internalMutation({
  args: {
    configId: v.id("googleCalendarSyncConfigs"),
    syncStatus: v.optional(v.union(v.literal("idle"), v.literal("syncing"), v.literal("error"))),
    syncError: v.optional(v.string()),
    lastSyncToken: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { configId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    if (updates.syncStatus !== undefined) patch.syncStatus = updates.syncStatus;
    if (updates.syncError !== undefined) patch.syncError = updates.syncError;
    if (updates.lastSyncToken !== undefined) patch.lastSyncToken = updates.lastSyncToken;
    if (updates.lastSyncAt !== undefined) patch.lastSyncAt = updates.lastSyncAt;
    await ctx.db.patch(configId, patch);
  },
});
```

- [ ] **Step 5: Verify deployment**

Run: `npx convex dev --once --typecheck=disable`
Expected: No errors. New functions appear in generated API.

- [ ] **Step 6: Commit**

```bash
git add convex/googleCalendarSyncConfigs.ts
git commit -m "feat: add googleCalendarSyncConfigs CRUD operations

- listMine/listAll queries for user and admin views
- getOrgDefault query for org-level calendar
- create/update/remove mutations with isOrgDefault uniqueness enforcement
- Internal queries/mutations for sync pipeline"
```

---

### Task 4: Sync Pipeline — CRM Path

Build the core sync pipeline with the CRM resolver (Google events → scheduledActivities).

**Files:**
- Create: `convex/google/calendarSync.ts`
- Modify: `convex/scheduledActivities_internal.ts` (update `upsertFromGoogleImport` to accept new fields)

**Context:**
- The existing `importFromGoogle` action in `convex/google/calendar.ts` (lines 165-271) already fetches from Google and upserts into scheduledActivities. The new sync pipeline replaces this with a config-driven approach that uses delta sync (syncToken).
- `convex/scheduledActivities_internal.ts` has `upsertFromGoogleImport` internal mutation that inserts/updates by `googleEventId`. It needs to accept `sourceType`, `syncConfigId`, `requiresCompletion`, and `visibilityOverride`.
- The existing `importFromGoogle` continues to work as-is for backward compat; the new pipeline is separate.
- Google Calendar API events.list with syncToken: pass `syncToken` parameter instead of `timeMin`/`timeMax`. Returns `nextSyncToken` in response for next delta sync.

- [ ] **Step 1: Update `upsertFromGoogleImport` to handle new fields**

In `convex/scheduledActivities_internal.ts`, find the `upsertFromGoogleImport` internal mutation. Add these fields to the event args validator:

```typescript
sourceType: v.optional(v.union(v.literal("manual"), v.literal("google"), v.literal("system"))),
syncConfigId: v.optional(v.id("googleCalendarSyncConfigs")),
requiresCompletion: v.optional(v.boolean()),
visibilityOverride: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
```

In the handler, when inserting a new record, include these fields. When updating an existing record, patch them.

- [ ] **Step 2: Create `convex/google/calendarSync.ts` with syncCalendarConfig**

Create the file with the core sync function. This is an `internalAction` because it calls external APIs and internal mutations:

```typescript
import { v } from "convex/values";
import { internalAction, action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getValidAccessTokenForConnection } from "./_helpers";

interface GoogleCalendarEvent {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean }>;
}

interface GoogleEventsListResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

function extractMeetUrl(event: GoogleCalendarEvent): string | undefined {
  if (event.hangoutLink) return event.hangoutLink;
  const videoEntry = event.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === "video"
  );
  return videoEntry?.uri;
}

function parseGoogleDateTime(dt?: { dateTime?: string; date?: string }): number | undefined {
  if (!dt) return undefined;
  if (dt.dateTime) return new Date(dt.dateTime).getTime();
  if (dt.date) return new Date(dt.date).getTime();
  return undefined;
}

export const syncCalendarConfig = internalAction({
  args: { configId: v.id("googleCalendarSyncConfigs") },
  handler: async (ctx, args) => {
    // Load config
    const config = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getById,
      { configId: args.configId }
    );
    if (!config || !config.syncEnabled) return { synced: 0 };

    // Mark as syncing
    await ctx.runMutation(
      internal.googleCalendarSyncConfigs.updateSyncState,
      { configId: args.configId, syncStatus: "syncing" }
    );

    try {
      // Get OAuth token for this specific user's connection
      const auth = await getValidAccessTokenForConnection(ctx, config.connectionId);
      if (!auth) {
        await ctx.runMutation(
          internal.googleCalendarSyncConfigs.updateSyncState,
          { configId: args.configId, syncStatus: "error", syncError: "OAuth token unavailable" }
        );
        return { synced: 0, error: "OAuth token unavailable" };
      }

      // Fetch events from Google (delta sync or full)
      const allEvents: GoogleCalendarEvent[] = [];
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;

      do {
        const params = new URLSearchParams({
          maxResults: "250",
          singleEvents: "true",
        });

        if (config.lastSyncToken && !pageToken) {
          // Delta sync
          params.set("syncToken", config.lastSyncToken);
        } else if (!config.lastSyncToken && !pageToken) {
          // First sync: 30 days back, 60 days forward
          const now = new Date();
          const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
          params.set("timeMin", timeMin.toISOString());
          params.set("timeMax", timeMax.toISOString());
          params.set("orderBy", "startTime");
        }

        if (pageToken) {
          params.set("pageToken", pageToken);
        }

        const calId = encodeURIComponent(config.googleCalendarId);
        const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events?${params}`;

        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
        });

        if (resp.status === 410) {
          // syncToken expired — clear and retry with full sync
          await ctx.runMutation(
            internal.googleCalendarSyncConfigs.updateSyncState,
            { configId: args.configId, lastSyncToken: undefined }
          );
          // Re-run this action without syncToken (recursive via scheduler)
          await ctx.scheduler.runAfter(0, internal.google.calendarSync.syncCalendarConfig, {
            configId: args.configId,
          });
          return { synced: 0, retrying: true };
        }

        if (!resp.ok) {
          const errorText = await resp.text();
          throw new Error(`Google API error ${resp.status}: ${errorText}`);
        }

        const data: GoogleEventsListResponse = await resp.json();
        if (data.items) {
          allEvents.push(...data.items);
        }
        pageToken = data.nextPageToken;
        if (data.nextSyncToken) {
          nextSyncToken = data.nextSyncToken;
        }
      } while (pageToken);

      // Filter out cancelled events and events without start times
      const validEvents = allEvents.filter(
        (e) => e.status !== "cancelled" && e.start
      );

      // Route to the correct module resolver
      let synced = 0;

      if (config.targetModule === "crm") {
        synced = await resolveCrmEvents(ctx, config, validEvents);
      } else if (config.targetModule === "gabinet") {
        synced = await resolveGabinetEvents(ctx, config, validEvents);
      }

      // Update sync state
      await ctx.runMutation(
        internal.googleCalendarSyncConfigs.updateSyncState,
        {
          configId: args.configId,
          syncStatus: "idle",
          syncError: undefined,
          lastSyncToken: nextSyncToken ?? config.lastSyncToken,
          lastSyncAt: Date.now(),
        }
      );

      return { synced };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      await ctx.runMutation(
        internal.googleCalendarSyncConfigs.updateSyncState,
        { configId: args.configId, syncStatus: "error", syncError: errorMsg }
      );
      return { synced: 0, error: errorMsg };
    }
  },
});
```

- [ ] **Step 3: Add CRM resolver function**

In the same file (`convex/google/calendarSync.ts`), add:

```typescript
async function resolveCrmEvents(
  ctx: any, // ActionCtx
  config: any, // googleCalendarSyncConfigs document
  events: GoogleCalendarEvent[]
): Promise<number> {
  const activityType = config.targetActivityType ?? "meeting";
  const batchSize = 50;
  let total = 0;

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    const mapped = batch.map((event) => ({
      googleEventId: event.id,
      googleCalendarId: config.googleCalendarId,
      title: event.summary ?? "(Bez tytulu)",
      description: event.description,
      location: event.location,
      meetingUrl: extractMeetUrl(event),
      dueDate: parseGoogleDateTime(event.start),
      endDate: parseGoogleDateTime(event.end),
      activityType,
      sourceType: "google" as const,
      syncConfigId: config._id,
      requiresCompletion: false,
      visibilityOverride: config.visibility,
    }));

    const validMapped = mapped.filter((e) => e.dueDate !== undefined);

    if (validMapped.length > 0) {
      const result = await ctx.runMutation(
        internal.scheduledActivities_internal.upsertFromGoogleImport,
        {
          organizationId: config.organizationId,
          ownerId: config.userId,
          events: validMapped,
        }
      );
      total += (result.imported ?? 0) + (result.updated ?? 0);
    }
  }

  return total;
}
```

- [ ] **Step 4: Add placeholder Gabinet resolver**

Add a stub that will be implemented in Task 5:

```typescript
async function resolveGabinetEvents(
  ctx: any,
  config: any,
  events: GoogleCalendarEvent[]
): Promise<number> {
  // TODO: Task 5 — Gabinet path with skeleton patients and appointments
  // For now, fall back to CRM path
  return resolveCrmEvents(ctx, config, events);
}
```

- [ ] **Step 5: Verify deployment**

Run: `npx convex dev --once --typecheck=disable`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add convex/google/calendarSync.ts convex/scheduledActivities_internal.ts
git commit -m "feat: add sync pipeline with CRM resolver

- syncCalendarConfig internalAction with delta sync (syncToken)
- CRM resolver maps Google events to scheduledActivities
- Handles pagination, token expiry (410), error recovery
- Batch upserts in chunks of 50
- Gabinet resolver stubbed for next task"
```

---

### Task 5: Sync Pipeline — Gabinet Path

Implement the Gabinet resolver: skeleton patient creation, treatment fuzzy-match, and gabinetAppointment + scheduledActivity dual-write.

**Files:**
- Modify: `convex/google/calendarSync.ts` (replace Gabinet resolver stub)
- Create internal mutations in: `convex/gabinet/appointments.ts` or a new `convex/gabinet/syncHelpers.ts`

**Context:**
- `gabinetPatients` table: `firstName`, `lastName`, `email` (required string), `phone` (optional), `organizationId`, `contactId` (optional), plus many optional medical fields. Has a search index. Check for an index like `by_email` — if not, use search or filter.
- `gabinetAppointments` table: `organizationId`, `patientId` (required), `treatmentId` (now optional), `employeeId` (required), `date` (YYYY-MM-DD string), `startTime` (HH:MM), `endTime`, `status`, `scheduledActivityId` (optional). Has index `by_orgAndDate`.
- `gabinetTreatments` table: has `name` field and `organizationId`. Check for search index on name.
- `gabinetEmployees` table: linked to `users` via `userId` field. Has index by org.
- To create both a gabinetAppointment and a scheduledActivity, write to both tables and link via `scheduledActivityId` on appointment and `moduleRef` on activity.

- [ ] **Step 1: Create internal helper mutations**

Create `convex/google/calendarSyncHelpers.ts`:

```typescript
import { v } from "convex/values";
import { internalQuery, internalMutation } from "../_generated/server";

// Find patient by email within an org
export const findPatientByEmail = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Use filter since there may not be an email index
    const patients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();
    return patients;
  },
});

// Create skeleton patient
export const createSkeletonPatient = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.string(),
    email: v.string(),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("gabinetPatients", {
      organizationId: args.organizationId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      isActive: true,
      createdBy: args.createdBy,
    });
  },
});

// Fuzzy-match treatment by name
export const findTreatmentByName = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    searchTerm: v.string(),
  },
  handler: async (ctx, args) => {
    const term = args.searchTerm.toLowerCase();
    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    // Case-insensitive substring match
    return treatments.find((t) => t.name.toLowerCase().includes(term) || term.includes(t.name.toLowerCase()));
  },
});

// Find employee by userId
export const findEmployeeByUserId = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
  },
});

// Create gabinetAppointment + linked scheduledActivity
export const createAppointmentFromSync = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    treatmentId: v.optional(v.id("gabinetTreatments")),
    employeeId: v.id("gabinetEmployees"),
    date: v.string(), // YYYY-MM-DD
    startTime: v.string(), // HH:MM
    endTime: v.string(),
    requiresCompletion: v.boolean(),
    // scheduledActivity fields
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    dueDate: v.number(),
    endDateTs: v.number(),
    ownerId: v.id("users"),
    googleEventId: v.string(),
    googleCalendarId: v.string(),
    syncConfigId: v.id("googleCalendarSyncConfigs"),
    visibilityOverride: v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden")),
  },
  handler: async (ctx, args) => {
    // Check if activity already exists (dedup by googleEventId)
    const existing = await ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndGoogleEventId", (q) =>
        q.eq("organizationId", args.organizationId).eq("googleEventId", args.googleEventId)
      )
      .first();

    if (existing) {
      // Update existing activity
      await ctx.db.patch(existing._id, {
        title: args.title,
        description: args.description,
        location: args.location,
        meetingUrl: args.meetingUrl,
        dueDate: args.dueDate,
        endDate: args.endDateTs,
        requiresCompletion: args.requiresCompletion,
        visibilityOverride: args.visibilityOverride,
      });
      // Update linked appointment if exists
      if (existing.moduleRef?.entityId) {
        const appointmentId = existing.moduleRef.entityId as any;
        await ctx.db.patch(appointmentId, {
          date: args.date,
          startTime: args.startTime,
          endTime: args.endTime,
          requiresCompletion: args.requiresCompletion,
          ...(args.treatmentId ? { treatmentId: args.treatmentId } : {}),
        });
      }
      return { type: "updated" as const, activityId: existing._id };
    }

    // Create scheduledActivity
    const activityId = await ctx.db.insert("scheduledActivities", {
      organizationId: args.organizationId,
      title: args.title,
      activityType: "appointment",
      dueDate: args.dueDate,
      endDate: args.endDateTs,
      isCompleted: false,
      ownerId: args.ownerId,
      description: args.description,
      location: args.location,
      meetingUrl: args.meetingUrl,
      googleEventId: args.googleEventId,
      googleCalendarId: args.googleCalendarId,
      lastGoogleSyncAt: Date.now(),
      sourceType: "google",
      syncConfigId: args.syncConfigId,
      requiresCompletion: args.requiresCompletion,
      visibilityOverride: args.visibilityOverride,
      moduleRef: {
        moduleId: "gabinet",
        entityType: "gabinetAppointment",
        entityId: "" as string, // placeholder, will be patched
      },
    });

    // Create gabinetAppointment
    const appointmentId = await ctx.db.insert("gabinetAppointments", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      treatmentId: args.treatmentId,
      employeeId: args.employeeId,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "scheduled",
      scheduledActivityId: activityId,
      requiresCompletion: args.requiresCompletion,
    });

    // Patch the moduleRef with real appointmentId
    await ctx.db.patch(activityId, {
      moduleRef: {
        moduleId: "gabinet",
        entityType: "gabinetAppointment",
        entityId: appointmentId as string, // Id<...> is branded string, cast for v.string() schema
      },
    });

    return { type: "created" as const, activityId, appointmentId };
  },
});
```

- [ ] **Step 2: Implement resolveGabinetEvents in calendarSync.ts**

Replace the stub in `convex/google/calendarSync.ts`:

```typescript
async function resolveGabinetEvents(
  ctx: any,
  config: any,
  events: GoogleCalendarEvent[]
): Promise<number> {
  // Find the gabinetEmployee linked to this user
  const employee = await ctx.runQuery(
    internal.google.calendarSyncHelpers.findEmployeeByUserId,
    { organizationId: config.organizationId, userId: config.userId }
  );

  let synced = 0;

  for (const event of events) {
    const dueDate = parseGoogleDateTime(event.start);
    const endDate = parseGoogleDateTime(event.end);
    if (!dueDate || !endDate) continue;

    // Extract date/time strings for gabinetAppointment
    const startDt = new Date(dueDate);
    const endDt = new Date(endDate);
    const date = startDt.toISOString().split("T")[0]; // YYYY-MM-DD
    const startTime = `${String(startDt.getHours()).padStart(2, "0")}:${String(startDt.getMinutes()).padStart(2, "0")}`;
    const endTime = `${String(endDt.getHours()).padStart(2, "0")}:${String(endDt.getMinutes()).padStart(2, "0")}`;

    // Find attendee with email (skip self)
    const attendee = event.attendees?.find((a) => a.email && !a.self);

    if (!attendee?.email || !employee) {
      // No attendee or no linked employee — create as CRM activity (blocked time slot)
      const mapped = [{
        googleEventId: event.id,
        googleCalendarId: config.googleCalendarId,
        title: config.visibility === "busy_only" ? "Zajęty" : (event.summary ?? "(Bez tytułu)"),
        description: config.visibility === "busy_only" ? undefined : event.description,
        location: config.visibility === "busy_only" ? undefined : event.location,
        meetingUrl: extractMeetUrl(event),
        dueDate,
        endDate,
        activityType: "blocked_time",
        sourceType: "google" as const,
        syncConfigId: config._id,
        requiresCompletion: false,
        visibilityOverride: config.visibility,
      }];
      await ctx.runMutation(
        internal.scheduledActivities_internal.upsertFromGoogleImport,
        { organizationId: config.organizationId, ownerId: config.userId, events: mapped }
      );
      synced++;
      continue;
    }

    // Find or create patient
    let patientId: Id<"gabinetPatients">;
    let patientIsNew = false;

    const existingPatient = await ctx.runQuery(
      internal.google.calendarSyncHelpers.findPatientByEmail,
      { organizationId: config.organizationId, email: attendee.email }
    );

    if (existingPatient) {
      patientId = existingPatient._id;
    } else {
      // Parse displayName into first/last name
      const nameParts = (attendee.displayName ?? attendee.email.split("@")[0]).split(" ");
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || "";

      patientId = await ctx.runMutation(
        internal.google.calendarSyncHelpers.createSkeletonPatient,
        {
          organizationId: config.organizationId,
          firstName,
          lastName,
          email: attendee.email,
          createdBy: config.userId,
        }
      );
      patientIsNew = true;
    }

    // Fuzzy-match treatment
    let treatmentId: Id<"gabinetTreatments"> | undefined;
    if (event.summary) {
      const matched = await ctx.runQuery(
        internal.google.calendarSyncHelpers.findTreatmentByName,
        { organizationId: config.organizationId, searchTerm: event.summary }
      );
      if (matched) treatmentId = matched._id;
    }

    const requiresCompletion = !treatmentId || patientIsNew;

    // Create appointment + scheduledActivity
    await ctx.runMutation(
      internal.google.calendarSyncHelpers.createAppointmentFromSync,
      {
        organizationId: config.organizationId,
        patientId,
        treatmentId,
        employeeId: employee._id,
        date,
        startTime,
        endTime,
        requiresCompletion,
        title: event.summary ?? "(Bez tytułu)",
        description: event.description,
        location: event.location,
        meetingUrl: extractMeetUrl(event),
        dueDate,
        endDateTs: endDate,
        ownerId: config.userId,
        googleEventId: event.id,
        googleCalendarId: config.googleCalendarId,
        syncConfigId: config._id,
        visibilityOverride: config.visibility,
      }
    );
    synced++;
  }

  return synced;
}
```

- [ ] **Step 3: Verify deployment**

Run: `npx convex dev --once --typecheck=disable`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add convex/google/calendarSync.ts convex/google/calendarSyncHelpers.ts
git commit -m "feat: add Gabinet sync resolver with skeleton patient creation

- Find/create patients by attendee email
- Fuzzy-match treatments by event title
- Create gabinetAppointment + scheduledActivity with moduleRef link
- Flag requiresCompletion when data is missing
- Dedup by googleEventId on update"
```

---

### Task 6: Cron Job + Manual Sync

Wire up the 10-minute cron and the user-facing manual sync action.

**Files:**
- Modify: `convex/google/calendarSync.ts` (add `syncAll` and `syncMyCalendars`)
- Modify: `convex/crons.ts` (register the cron)
- Modify: `convex/google/calendar.ts` (add `listUserCalendars` action)

**Context:**
- `convex/crons.ts` — read it to understand existing cron patterns. Crons use `cronJobs()` from `convex/server` and export default. The cron reference is `internal.module.function`.
- `syncAll` is an `internalAction` called by cron. It queries enabled configs and calls `syncCalendarConfig` for each.
- `syncMyCalendars` is a public `action` called by users. It finds the user's configs and syncs them.
- `listUserCalendars` is a public `action` that calls Google `calendarList.list` API to show available calendars for connection.

- [ ] **Step 1: Add `syncAll` internalAction**

In `convex/google/calendarSync.ts`, add:

```typescript
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const configs = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getEnabledConfigs,
      { limit: 5 }
    );

    const results = [];
    for (const config of configs) {
      try {
        const result = await ctx.scheduler.runAfter(0,
          internal.google.calendarSync.syncCalendarConfig,
          { configId: config._id }
        );
        results.push({ configId: config._id, scheduled: true });
      } catch (error) {
        results.push({
          configId: config._id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  },
});
```

- [ ] **Step 2: Add `syncMyCalendars` public action**

```typescript
import { auth } from "@cvx/auth";

export const syncMyCalendars = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Use @cvx/auth pattern (not ctx.auth.getUserIdentity)
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const configs = await ctx.runQuery(
      internal.googleCalendarSyncConfigs.getByOrgAndUser,
      { organizationId: args.organizationId, userId }
    );

    // Schedule each sync via scheduler (Convex actions cannot call other actions directly)
    const results = [];
    for (const config of configs) {
      if (!config.syncEnabled) continue;
      await ctx.scheduler.runAfter(0,
        internal.google.calendarSync.syncCalendarConfig,
        { configId: config._id }
      );
      results.push({ calendarName: config.googleCalendarName, scheduled: true });
    }

    return results;
  },
});
```

- [ ] **Step 3: Add `getByOrgAndUser` internal query to syncConfigs**

In `convex/googleCalendarSyncConfigs.ts`, add:

```typescript
export const getByOrgAndUser = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleCalendarSyncConfigs")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .collect();
  },
});
```

- [ ] **Step 4: Add `listUserCalendars` action to calendar.ts**

In `convex/google/calendar.ts`, add a public action that fetches the user's Google calendar list:

```typescript
export const listUserCalendars = action({
  args: { organizationId: v.id("organizations"), connectionId: v.id("oauthConnections") },
  handler: async (ctx, args) => {
    const auth = await getValidAccessTokenForConnection(ctx, args.connectionId);
    if (!auth) throw new Error("Google not connected");

    const resp = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${auth.accessToken}` } }
    );
    if (!resp.ok) throw new Error(`Google API error: ${resp.status}`);

    const data = await resp.json();
    return (data.items ?? []).map((cal: any) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary ?? false,
      backgroundColor: cal.backgroundColor,
      accessRole: cal.accessRole,
    }));
  },
});
```

Import `getValidAccessTokenForConnection` at the top of `convex/google/calendar.ts`:
```typescript
import { getValidAccessToken, getValidAccessTokenForConnection } from "./_helpers";
```

- [ ] **Step 5: Update OAuth callback redirect**

In `convex/google/oauth.ts`, find the callback handler's success redirect (currently redirects to `/dashboard/settings/integrations?success=true`). Update it to redirect to `/dashboard/settings/google-calendar?success=true` so users land on the new sync config page after connecting Google.

- [ ] **Step 6: Create the cron file**

The file `convex/crons.ts` does not exist yet — create it with standard Convex cron boilerplate:

```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "sync-google-calendars",
  { minutes: 10 },
  internal.google.calendarSync.syncAll
);

export default crons;
```

- [ ] **Step 7: Verify deployment**

Run: `npx convex dev --once --typecheck=disable`
Expected: No errors. Cron is registered.

- [ ] **Step 8: Commit**

```bash
git add convex/google/calendarSync.ts convex/google/calendar.ts convex/googleCalendarSyncConfigs.ts convex/crons.ts convex/google/oauth.ts
git commit -m "feat: add 10-min cron sync and manual sync action

- syncAll internalAction runs via cron, picks 5 least-recently-synced configs
- syncMyCalendars public action for user-triggered sync
- listUserCalendars action fetches Google calendar list for UI
- Created convex/crons.ts with sync-google-calendars interval
- Updated OAuth callback redirect for settings flow"
```

---

### Task 7: Visibility Query Layer

Add the visibility-aware query for calendar events.

**Files:**
- Modify: `convex/scheduledActivities.ts` (add `listForCalendarWithVisibility` query)

**Context:**
- The existing `listForCalendar` query (around line 402) fetches activities within a date range filtered by org and optionally by module. It enriches results with Gabinet appointment metadata.
- The new visibility-aware query wraps similar logic but applies post-filtering: for each activity with `syncConfigId`, loads the sync config, checks if the querying user is the owner, and applies visibility rules.
- Do NOT modify the existing `listForCalendar` query — add a new one alongside it to avoid breaking changes.

- [ ] **Step 1: Add `listForCalendarWithVisibility` query**

In `convex/scheduledActivities.ts`, add:

```typescript
export const listForCalendarWithVisibility = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
    moduleFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await verifyOrgAccess(ctx, args.organizationId);

    // Fetch all activities in range (same as listForCalendar)
    let activitiesQuery = ctx.db
      .query("scheduledActivities")
      .withIndex("by_orgAndDueDate", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("dueDate", args.startDate)
          .lte("dueDate", args.endDate)
      );

    const activities = await activitiesQuery.collect();

    // Apply module filter
    let filtered = activities;
    if (args.moduleFilter === "gabinet") {
      filtered = activities.filter((a) => a.moduleRef?.moduleId === "gabinet");
    } else if (args.moduleFilter === "crm") {
      filtered = activities.filter((a) => !a.moduleRef?.moduleId || a.moduleRef.moduleId !== "gabinet");
    }

    // Apply visibility rules
    const visibilityProcessed = [];
    for (const activity of filtered) {
      if (!activity.syncConfigId) {
        // Non-synced activities are always fully visible
        visibilityProcessed.push(activity);
        continue;
      }

      // Check if current user is the owner
      if (activity.ownerId === user._id) {
        // Owner always sees full details
        visibilityProcessed.push(activity);
        continue;
      }

      // Load visibility from activity override or sync config
      let visibility = activity.visibilityOverride;
      if (!visibility) {
        const syncConfig = await ctx.db.get(activity.syncConfigId);
        visibility = syncConfig?.visibility ?? "full";
      }

      if (visibility === "hidden") {
        // Skip entirely for non-owners
        continue;
      }

      if (visibility === "busy_only") {
        // Sanitize: replace with busy block
        visibilityProcessed.push({
          ...activity,
          title: "Zajęty",
          description: undefined,
          location: undefined,
          meetingUrl: undefined,
          _isBusyOnly: true,
        });
        continue;
      }

      // visibility === "full"
      visibilityProcessed.push(activity);
    }

    // Enrich with metadata (same pattern as listForCalendar)
    // ... copy the enrichment logic from listForCalendar or refactor into shared helper

    return visibilityProcessed;
  },
});
```

Note: The enrichment logic at the end should mirror what `listForCalendar` does (fetching Gabinet appointment details for moduleRef items). Read the existing `listForCalendar` handler to see the exact enrichment pattern and replicate it.

- [ ] **Step 2: Verify deployment**

Run: `npx convex dev --once --typecheck=disable`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add convex/scheduledActivities.ts
git commit -m "feat: add visibility-aware calendar query

- listForCalendarWithVisibility applies per-event visibility rules
- hidden events excluded for non-owners
- busy_only events sanitized to 'Zajęty' for non-owners
- Owner always sees full details"
```

---

### Task 8: i18n Keys

Add all necessary translation keys for the Google Calendar sync feature.

**Files:**
- Modify: `public/locales/pl/translation.json`
- Modify: `public/locales/en/translation.json`

**Context:**
- i18n files are JSON with nested keys. Check the structure of existing keys to follow the same pattern.
- Keys needed for: settings page, calendar view, sidebar widgets, sync status messages.

- [ ] **Step 1: Read existing i18n structure**

Read `public/locales/pl/translation.json` (first 50 lines) to understand the nesting pattern.

- [ ] **Step 2: Add Polish keys**

Add a `googleCalendar` section:

```json
"googleCalendar": {
  "settings": {
    "title": "Kalendarz Google",
    "orgDefault": "Domyślny kalendarz organizacji",
    "setAsDefault": "Ustaw jako domyślny",
    "employeeCalendars": "Kalendarze pracowników",
    "connectCalendar": "Połącz Kalendarz Google",
    "disconnectCalendar": "Odłącz",
    "noCalendarsConnected": "Brak połączonych kalendarzy",
    "selectCalendar": "Wybierz kalendarz",
    "targetModule": "Moduł docelowy",
    "targetModuleCrm": "CRM",
    "targetModuleGabinet": "Gabinet",
    "activityType": "Typ aktywności",
    "visibility": "Widoczność",
    "visibilityFull": "Pełna",
    "visibilityBusyOnly": "Tylko zajęty",
    "visibilityHidden": "Ukryty",
    "syncEnabled": "Synchronizacja",
    "syncStatus": "Status synchronizacji",
    "syncStatusIdle": "Gotowy",
    "syncStatusSyncing": "Synchronizowanie...",
    "syncStatusError": "Błąd",
    "lastSync": "Ostatnia synchronizacja",
    "syncNow": "Synchronizuj teraz",
    "syncing": "Synchronizowanie...",
    "syncSuccess": "Zsynchronizowano {{count}} wydarzeń",
    "syncError": "Błąd synchronizacji: {{error}}",
    "calendarName": "Nazwa kalendarza",
    "module": "Moduł",
    "employee": "Pracownik",
    "status": "Status",
    "enabled": "Włączona",
    "disabled": "Wyłączona"
  },
  "calendar": {
    "busy": "Zajęty",
    "requiresCompletion": "Wymaga uzupełnienia",
    "completeButton": "Uzupełnij",
    "source": "Źródło",
    "sourceManual": "Ręczne",
    "sourceGoogle": "Google",
    "sourceSystem": "System",
    "incompleteSidebarKpi": "Do uzupełnienia"
  }
}
```

- [ ] **Step 3: Add English keys**

Add equivalent English keys:

```json
"googleCalendar": {
  "settings": {
    "title": "Google Calendar",
    "orgDefault": "Organization default calendar",
    "setAsDefault": "Set as default",
    "employeeCalendars": "Employee calendars",
    "connectCalendar": "Connect Google Calendar",
    "disconnectCalendar": "Disconnect",
    "noCalendarsConnected": "No calendars connected",
    "selectCalendar": "Select calendar",
    "targetModule": "Target module",
    "targetModuleCrm": "CRM",
    "targetModuleGabinet": "Gabinet",
    "activityType": "Activity type",
    "visibility": "Visibility",
    "visibilityFull": "Full",
    "visibilityBusyOnly": "Busy only",
    "visibilityHidden": "Hidden",
    "syncEnabled": "Sync",
    "syncStatus": "Sync status",
    "syncStatusIdle": "Ready",
    "syncStatusSyncing": "Syncing...",
    "syncStatusError": "Error",
    "lastSync": "Last sync",
    "syncNow": "Sync now",
    "syncing": "Syncing...",
    "syncSuccess": "Synced {{count}} events",
    "syncError": "Sync error: {{error}}",
    "calendarName": "Calendar name",
    "module": "Module",
    "employee": "Employee",
    "status": "Status",
    "enabled": "Enabled",
    "disabled": "Disabled"
  },
  "calendar": {
    "busy": "Busy",
    "requiresCompletion": "Requires completion",
    "completeButton": "Complete",
    "source": "Source",
    "sourceManual": "Manual",
    "sourceGoogle": "Google",
    "sourceSystem": "System",
    "incompleteSidebarKpi": "To complete"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add public/locales/pl/translation.json public/locales/en/translation.json
git commit -m "feat(i18n): add Google Calendar sync translation keys (PL/EN)"
```

---

### Task 9: Settings UI — Google Calendar Sync

Build the admin and employee settings page for managing Google Calendar sync configurations.

**Files:**
- Create: `src/routes/_app/_auth/dashboard/_layout.settings.google-calendar.tsx`
- Create: `src/components/settings/google-calendar-sync-settings.tsx`

**Context:**
- Settings pages follow the pattern in `src/routes/_app/_auth/dashboard/_layout.settings.integrations.tsx` — read that file to understand the layout, sidebar navigation integration, and component structure.
- Use `useOrganization()` from `src/components/org-context.tsx` for org context.
- Use `useQuery` / `useMutation` / `useAction` from `convex/react`.
- Use shadcn/ui components: `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Button`, `Select`, `RadioGroup`, `Switch`, `Badge`, `Table`.
- The page needs two views: admin (org default + employee table) and employee (personal calendars).
- Use `usePermissions` hook to check if user is admin (check existing settings pages for pattern).
- The OAuth connect flow redirects to `/google/oauth/initiate?organizationId=X&userId=Y` (same as existing calendar page connect button).
- After connecting, `listUserCalendars` action fetches available calendars from Google.

- [ ] **Step 1: Create the route file**

Create `src/routes/_app/_auth/dashboard/_layout.settings.google-calendar.tsx`:

Follow the pattern from `_layout.settings.integrations.tsx`:
- Export `Route` using `createFileRoute`
- Use the settings layout wrapper
- Render the main component

The route path will be: `/dashboard/settings/google-calendar`

- [ ] **Step 2: Create the settings component**

Create `src/components/settings/google-calendar-sync-settings.tsx` with:

1. **CalendarConnectionSection** — shows connected calendars for the current user:
   - List of connected calendars with edit/remove buttons
   - "Połącz Kalendarz Google" button → OAuth flow
   - For each connected calendar: module selector, visibility radio, sync toggle, sync status

2. **OrgDefaultSection** (admin only) — shows/sets the org default calendar:
   - Dropdown of available calendars from admin's Google account
   - Module mapping and activity type selection
   - Currently set default with "Change" button

3. **EmployeeCalendarTable** (admin only) — table of all employee calendar connections:
   - Columns: Employee name, Calendar, Module, Visibility, Last sync, Status, Actions
   - Admin can enable/disable sync for each

Use these Convex hooks:
```typescript
const myConfigs = useQuery(api.googleCalendarSyncConfigs.listMine, { organizationId });
const allConfigs = useQuery(api.googleCalendarSyncConfigs.listAll, { organizationId }); // admin
const orgDefault = useQuery(api.googleCalendarSyncConfigs.getOrgDefault, { organizationId });
const createConfig = useMutation(api.googleCalendarSyncConfigs.create);
const updateConfig = useMutation(api.googleCalendarSyncConfigs.update);
const removeConfig = useMutation(api.googleCalendarSyncConfigs.remove);
const listCalendars = useAction(api.google.calendar.listUserCalendars);
const syncMy = useAction(api.google.calendarSync.syncMyCalendars);
```

- [ ] **Step 3: Add navigation link**

In the settings sidebar navigation (find where settings nav items are defined — likely in `_layout.settings.tsx` or the settings layout component), add a link to the new page:

```typescript
{ to: "/dashboard/settings/google-calendar", label: t("googleCalendar.settings.title"), icon: CalendarIcon }
```

- [ ] **Step 4: Verify the page loads**

Run: `npm run dev`
Navigate to: `/dashboard/settings/google-calendar`
Expected: Page renders without errors, shows connection section.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.settings.google-calendar.tsx src/components/settings/google-calendar-sync-settings.tsx
git commit -m "feat(ui): add Google Calendar sync settings page

- Employee view: connect calendars, set visibility/module/sync
- Admin view: org default calendar, employee calendar table
- Sync now button, status indicators, error display"
```

---

### Task 10: Calendar UI — Visibility + requiresCompletion

Update the calendar page to use the visibility-aware query and show `requiresCompletion` indicators.

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.calendar.tsx`
- Modify: `src/components/sidebar-widgets/crm/calendar-widgets.tsx`

**Context:**
- The calendar page currently uses `api.scheduledActivities.listForCalendar`. Switch to `api.scheduledActivities.listForCalendarWithVisibility`.
- Google events already have emerald styling and "G" badge (from previous work).
- `busy_only` events will come back with `_isBusyOnly: true` and title "Zajęty" — render them as gray blocks.
- `requiresCompletion` events need an orange warning icon and "Uzupełnij" button in the detail panel.
- Sidebar KPI "Do uzupełnienia: X" should show count of `requiresCompletion` events. This requires a backend query — add one to `convex/scheduledActivities.ts` or use an existing query filtered client-side.

- [ ] **Step 1: Switch to visibility-aware query**

In `_layout.calendar.tsx`, change:
```typescript
const activities = useQuery(api.scheduledActivities.listForCalendar, { ... });
```
to:
```typescript
const activities = useQuery(api.scheduledActivities.listForCalendarWithVisibility, { ... });
```

- [ ] **Step 2: Add busy_only rendering**

In the event rendering logic (month/week/day views), add a check for busy_only events:

```typescript
const isBusyOnly = (event as any)._isBusyOnly === true;
```

For busy_only events:
- Use gray color scheme: `bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600`
- No click handler (or show a minimal detail: "Zajęty" with time only)
- Override the existing `isFromGoogle` styling — busy_only takes precedence

- [ ] **Step 3: Add requiresCompletion indicators**

For events where `requiresCompletion === true`:
- On calendar tiles: add an orange `AlertTriangle` icon (from lucide-react) next to the title
- In EventDetailPanel: show an "Uzupełnij" button that navigates to the appropriate form

```tsx
{event.requiresCompletion && (
  <AlertTriangle className="size-3 text-amber-500" />
)}
```

In the detail panel:
```tsx
{event.requiresCompletion && (
  <Button
    variant="outline"
    size="sm"
    className="border-amber-500 text-amber-600"
    onClick={() => {/* navigate to completion form */}}
  >
    {t("googleCalendar.calendar.completeButton")}
  </Button>
)}
```

- [ ] **Step 4: Add "Do uzupełnienia" KPI to sidebar**

In `src/components/sidebar-widgets/crm/calendar-widgets.tsx`:

Add a query for incomplete sync events count. Either:
- Add a new query `getRequiresCompletionCount` to backend, or
- Filter from existing calendar events client-side (simpler, fine for small volumes)

Add to KpiRow items:
```typescript
{
  label: t("googleCalendar.calendar.incompleteSidebarKpi"),
  value: incompleteCount,
  color: incompleteCount > 0 ? "text-amber-500" : undefined,
}
```

- [ ] **Step 5: Verify everything renders**

Run: `npm run dev`
Navigate to calendar page. Check:
- Google events still show emerald + "G" badge
- busy_only events (if any) show as gray "Zajęty"
- requiresCompletion events show orange indicator

- [ ] **Step 6: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.calendar.tsx src/components/sidebar-widgets/crm/calendar-widgets.tsx
git commit -m "feat(ui): visibility rendering and requiresCompletion indicators

- Switch to visibility-aware calendar query
- Gray 'Zajęty' blocks for busy_only events
- Orange warning icon for requiresCompletion events
- 'Uzupełnij' button in event detail panel
- 'Do uzupełnienia' KPI in calendar sidebar"
```

---

### Task 11: Activity List Integration

Add source column and filters to the activities list.

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.activities.index.tsx`

**Context:**
- The activities page uses `enhanced-data-table` with column definitions. Read the file to understand the existing column pattern.
- Add a "Źródło" (Source) column showing the `sourceType` field.
- Add a filter for `sourceType` and `requiresCompletion`.
- Use existing `data-list-filter-bar.tsx` patterns for filters.

- [ ] **Step 1: Read the activities page to understand structure**

Read `src/routes/_app/_auth/dashboard/_layout.activities.index.tsx` to understand:
- How columns are defined
- How filters are structured
- The data source query

- [ ] **Step 2: Add source column**

Add to the columns array:

```typescript
{
  accessorKey: "sourceType",
  header: t("googleCalendar.calendar.source"),
  cell: ({ row }) => {
    const source = row.original.sourceType ?? "manual";
    const labels: Record<string, string> = {
      manual: t("googleCalendar.calendar.sourceManual"),
      google: t("googleCalendar.calendar.sourceGoogle"),
      system: t("googleCalendar.calendar.sourceSystem"),
    };
    return (
      <Badge variant={source === "google" ? "default" : "secondary"}>
        {labels[source] ?? source}
      </Badge>
    );
  },
},
```

- [ ] **Step 3: Add source and requiresCompletion filters**

Add filter options to the filter bar configuration (following existing patterns):

```typescript
// Source filter
{
  id: "sourceType",
  label: t("googleCalendar.calendar.source"),
  options: [
    { value: "manual", label: t("googleCalendar.calendar.sourceManual") },
    { value: "google", label: t("googleCalendar.calendar.sourceGoogle") },
    { value: "system", label: t("googleCalendar.calendar.sourceSystem") },
  ],
}

// Requires completion filter
{
  id: "requiresCompletion",
  label: t("googleCalendar.calendar.requiresCompletion"),
  options: [
    { value: "true", label: t("googleCalendar.calendar.requiresCompletion") },
  ],
}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.activities.index.tsx
git commit -m "feat(ui): add source column and sync filters to activity list

- 'Źródło' column with Manual/Google/System badges
- Filterable by source type
- 'Wymaga uzupełnienia' filter option"
```
