/**
 * Convex → Supabase Custom Field Definition & Value Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "./client";

// ── Custom Field Definitions ─────────────────────────────────────────────────

export const writeDefinitionToSupabase = internalAction({
  args: {
    definitionId: v.string(),
    organizationId: v.string(),
    entityType: v.string(),
    name: v.string(),
    fieldKey: v.string(),
    fieldType: v.string(),
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    order: v.number(),
    group: v.optional(v.string()),
    activityTypeKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.definitionId,
      organization_id: args.organizationId,
      entity_type: args.entityType,
      name: args.name,
      field_key: args.fieldKey,
      field_type: args.fieldType,
      options: args.options ?? null,
      is_required: args.isRequired ?? null,
      order: args.order,
      group: args.group ?? null,
      activity_type_key: args.activityTypeKey ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("custom_field_definitions")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for custom field definition: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Custom field definition written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateDefinitionInSupabase = internalAction({
  args: {
    definitionId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    order: v.optional(v.number()),
    group: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.options !== undefined) row.options = args.options;
    if (args.isRequired !== undefined) row.is_required = args.isRequired;
    if (args.order !== undefined) row.order = args.order;
    if (args.group !== undefined) row.group = args.group;

    const { data, error } = await client
      .from("custom_field_definitions")
      .update(row)
      .eq("id", args.definitionId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for custom field definition ${args.definitionId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Custom field definition updated in Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const deleteDefinitionFromSupabase = internalAction({
  args: {
    definitionId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("custom_field_definitions")
      .delete()
      .eq("id", args.definitionId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for custom field definition ${args.definitionId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Custom field definition deleted from Supabase id=${args.definitionId}`);
    return { success: true, id: args.definitionId };
  },
});

// ── Custom Field Values ──────────────────────────────────────────────────────

export const writeValueToSupabase = internalAction({
  args: {
    valueId: v.string(),
    organizationId: v.string(),
    fieldDefinitionId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    value: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.valueId,
      organization_id: args.organizationId,
      field_definition_id: args.fieldDefinitionId,
      entity_type: args.entityType,
      entity_id: args.entityId,
      value: args.value ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("custom_field_values")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for custom field value: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Custom field value written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateValueInSupabase = internalAction({
  args: {
    valueId: v.string(),
    organizationId: v.string(),
    value: v.optional(v.any()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = {
      value: args.value ?? null,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("custom_field_values")
      .update(row)
      .eq("id", args.valueId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for custom field value ${args.valueId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Custom field value updated in Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const deleteValueFromSupabase = internalAction({
  args: {
    valueId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("custom_field_values")
      .delete()
      .eq("id", args.valueId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for custom field value ${args.valueId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Custom field value deleted from Supabase id=${args.valueId}`);
    return { success: true, id: args.valueId };
  },
});
