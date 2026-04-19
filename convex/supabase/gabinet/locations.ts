/**
 * Convex → Supabase Location Write Actions
 *
 * Internal actions that persist gabinet location data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

export const writeLocationToSupabase = internalAction({
  args: {
    locationId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    address: v.optional(v.any()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.locationId,
      organization_id: args.organizationId,
      name: args.name,
      address: args.address ?? null,
      phone: args.phone ?? null,
      email: args.email ?? null,
      color: args.color ?? null,
      is_active: args.isActive,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_locations", row);

    console.info(`Location written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateLocationInSupabase = internalAction({
  args: {
    locationId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    address: v.optional(v.any()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.address !== undefined) row.address = args.address;
    if (args.phone !== undefined) row.phone = args.phone;
    if (args.email !== undefined) row.email = args.email;
    if (args.color !== undefined) row.color = args.color;
    if (args.isActive !== undefined) row.is_active = args.isActive;

    const { data, error } = await client
      .from("gabinet_locations")
      .update(row)
      .eq("id", args.locationId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for location ${args.locationId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Location updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteLocationFromSupabase = internalAction({
  args: {
    locationId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: match Convex behavior (isActive = false)
    const { error } = await client
      .from("gabinet_locations")
      .update({ is_active: false, updated_at: Date.now() })
      .eq("id", args.locationId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for location ${args.locationId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Location soft-deleted in Supabase id=${args.locationId} org=${args.organizationId}`);
    return { success: true, id: args.locationId };
  },
});
