/**
 * Convex → Supabase Equipment & Equipment Transfer Write Actions
 *
 * Internal actions that persist gabinet equipment data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "../client";

// ── Equipment ──────────────────────────────────────────────────────────

export const writeEquipmentToSupabase = internalAction({
  args: {
    equipmentId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    currentLocationId: v.optional(v.string()),
    currentRoomId: v.optional(v.string()),
    status: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.equipmentId,
      organization_id: args.organizationId,
      name: args.name,
      description: args.description ?? null,
      serial_number: args.serialNumber ?? null,
      current_location_id: args.currentLocationId ?? null,
      current_room_id: args.currentRoomId ?? null,
      status: args.status,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("gabinet_equipment")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for equipment: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Equipment written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateEquipmentInSupabase = internalAction({
  args: {
    equipmentId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    currentLocationId: v.optional(v.string()),
    currentRoomId: v.optional(v.string()),
    status: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.serialNumber !== undefined) row.serial_number = args.serialNumber;
    if (args.currentLocationId !== undefined) row.current_location_id = args.currentLocationId;
    if (args.currentRoomId !== undefined) row.current_room_id = args.currentRoomId;
    if (args.status !== undefined) row.status = args.status;

    const { data, error } = await client
      .from("gabinet_equipment")
      .update(row)
      .eq("id", args.equipmentId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for equipment ${args.equipmentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Equipment updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

// ── Equipment Transfers ─────────────────────────────────────────────────

export const writeEquipmentTransferToSupabase = internalAction({
  args: {
    transferId: v.string(),
    organizationId: v.string(),
    equipmentId: v.string(),
    fromLocationId: v.optional(v.string()),
    toLocationId: v.string(),
    toRoomId: v.optional(v.string()),
    transferredBy: v.string(),
    transferredAt: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.transferId,
      organization_id: args.organizationId,
      equipment_id: args.equipmentId,
      from_location_id: args.fromLocationId ?? null,
      to_location_id: args.toLocationId,
      to_room_id: args.toRoomId ?? null,
      transferred_by: args.transferredBy,
      transferred_at: args.transferredAt,
      notes: args.notes ?? null,
    };

    const { data, error } = await client
      .from("gabinet_equipment_transfers")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for equipment transfer: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Equipment transfer written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
