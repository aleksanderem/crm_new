/**
 * Convex → Supabase OrgSettings Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

export const writeOrgSettingsToSupabase = internalAction({
  args: {
    orgSettingsId: v.string(),
    organizationId: v.string(),
    allowCustomLostReason: v.boolean(),
    lostReasonRequired: v.boolean(),
    defaultCurrency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    resourceSharingEnabled: v.optional(v.boolean()),
    reminderEnabled: v.optional(v.boolean()),
    reminderHoursBefore: v.optional(v.number()),
    appointmentWorkflowConfig: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row = {
      id: args.orgSettingsId,
      organization_id: args.organizationId,
      allow_custom_lost_reason: args.allowCustomLostReason,
      lost_reason_required: args.lostReasonRequired,
      default_currency: args.defaultCurrency ?? null,
      timezone: args.timezone ?? null,
      resource_sharing_enabled: args.resourceSharingEnabled ?? null,
      reminder_enabled: args.reminderEnabled ?? null,
      reminder_hours_before: args.reminderHoursBefore ?? null,
      appointment_workflow_config: args.appointmentWorkflowConfig ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("org_settings")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for orgSettings: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`OrgSettings written to Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});
