/**
 * Convex → Supabase Room Write Actions
 *
 * Internal actions that persist gabinet room data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

export const writeRoomToSupabase = internalAction({
  args: {
    roomId: v.string(),
    organizationId: v.string(),
    locationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.roomId,
      organization_id: args.organizationId,
      location_id: args.locationId,
      name: args.name,
      description: args.description ?? null,
      floor: args.floor ?? null,
      is_active: args.isActive,
      created_at: args.createdAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_rooms", row);

    console.info(`Room written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateRoomInSupabase = internalAction({
  args: {
    roomId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = {};
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.floor !== undefined) row.floor = args.floor;
    if (args.isActive !== undefined) row.is_active = args.isActive;

    const { data, error } = await client
      .from("gabinet_rooms")
      .update(row)
      .eq("id", args.roomId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for room ${args.roomId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Room updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteRoomFromSupabase = internalAction({
  args: {
    roomId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: match Convex behavior (isActive = false)
    const { error } = await client
      .from("gabinet_rooms")
      .update({ is_active: false })
      .eq("id", args.roomId);

    if (error) {
      const msg = `Supabase delete failed for room ${args.roomId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Room soft-deleted in Supabase id=${args.roomId} org=${args.organizationId}`);
    return { success: true, id: args.roomId };
  },
});
