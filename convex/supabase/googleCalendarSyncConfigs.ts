/**
 * Convex → Supabase GoogleCalendarSyncConfigs Dual-Write Action
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeGoogleCalendarSyncConfigToSupabase = internalAction({
  args: {
    configId: v.string(),
    organizationId: v.string(),
    userId: v.string(),
    connectionId: v.string(),
    googleCalendarId: v.string(),
    googleCalendarName: v.string(),
    isOrgDefault: v.boolean(),
    targetModule: v.string(),
    targetActivityType: v.optional(v.string()),
    visibility: v.string(),
    syncEnabled: v.boolean(),
    lastSyncToken: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    syncStatus: v.optional(v.string()),
    syncError: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const row = {
      id: args.configId,
      organization_id: args.organizationId,
      user_id: args.userId,
      connection_id: args.connectionId,
      google_calendar_id: args.googleCalendarId,
      google_calendar_name: args.googleCalendarName,
      is_org_default: args.isOrgDefault,
      target_module: args.targetModule,
      target_activity_type: args.targetActivityType ?? null,
      visibility: args.visibility,
      sync_enabled: args.syncEnabled,
      last_sync_token: args.lastSyncToken ?? null,
      last_sync_at: args.lastSyncAt ?? null,
      sync_status: args.syncStatus ?? null,
      sync_error: args.syncError ?? null,
    };

    const { data, error } = await client
      .from("google_calendar_sync_configs")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for googleCalendarSyncConfig: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`GoogleCalendarSyncConfig written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
