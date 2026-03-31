/**
 * Convex → Supabase Treatment & Treatment Variant Write Actions
 *
 * Internal actions that persist gabinet treatment data to PostgreSQL via Supabase
 * service-role client (bypasses RLS). Dual-write pattern: Convex mutations
 * write to Convex first, then schedule these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "../client";

// ── Treatments ──────────────────────────────────────────────────────────

export const writeTreatmentToSupabase = internalAction({
  args: {
    treatmentId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.number(),
    price: v.number(),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    isActive: v.boolean(),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.treatmentId,
      organization_id: args.organizationId,
      name: args.name,
      description: args.description ?? null,
      category: args.category ?? null,
      duration: args.duration,
      price: args.price,
      currency: args.currency ?? null,
      tax_rate: args.taxRate ?? null,
      required_equipment: args.requiredEquipment ?? null,
      required_equipment_ids: args.requiredEquipmentIds ?? null,
      contraindications: args.contraindications ?? null,
      preparation_instructions: args.preparationInstructions ?? null,
      aftercare_instructions: args.aftercareInstructions ?? null,
      is_active: args.isActive,
      requires_approval: args.requiresApproval ?? null,
      color: args.color ?? null,
      sort_order: args.sortOrder ?? null,
      treatment_count: args.treatmentCount ?? null,
      tag_ids: args.tagIds ?? null,
      category_id: args.categoryId ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("gabinet_treatments")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for treatment: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Treatment written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateTreatmentInSupabase = internalAction({
  args: {
    treatmentId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.optional(v.number()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
    parameters: v.optional(v.any()),
    requiredDocumentTemplateIds: v.optional(v.array(v.string())),
    requiredFormTemplates: v.optional(v.any()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.string()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.category !== undefined) row.category = args.category;
    if (args.duration !== undefined) row.duration = args.duration;
    if (args.price !== undefined) row.price = args.price;
    if (args.currency !== undefined) row.currency = args.currency;
    if (args.taxRate !== undefined) row.tax_rate = args.taxRate;
    if (args.requiredEquipment !== undefined) row.required_equipment = args.requiredEquipment;
    if (args.requiredEquipmentIds !== undefined) row.required_equipment_ids = args.requiredEquipmentIds;
    if (args.contraindications !== undefined) row.contraindications = args.contraindications;
    if (args.preparationInstructions !== undefined) row.preparation_instructions = args.preparationInstructions;
    if (args.aftercareInstructions !== undefined) row.aftercare_instructions = args.aftercareInstructions;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.requiresApproval !== undefined) row.requires_approval = args.requiresApproval;
    if (args.color !== undefined) row.color = args.color;
    if (args.sortOrder !== undefined) row.sort_order = args.sortOrder;
    if (args.treatmentCount !== undefined) row.treatment_count = args.treatmentCount;
    if (args.parameters !== undefined) row.parameters = args.parameters;
    if (args.requiredDocumentTemplateIds !== undefined) row.required_document_template_ids = args.requiredDocumentTemplateIds;
    if (args.requiredFormTemplates !== undefined) row.required_form_templates = args.requiredFormTemplates;
    if (args.shortDescription !== undefined) row.short_description = args.shortDescription;
    if (args.image !== undefined) row.image = args.image;
    if (args.tagIds !== undefined) row.tag_ids = args.tagIds;
    if (args.categoryId !== undefined) row.category_id = args.categoryId;

    const { data, error } = await client
      .from("gabinet_treatments")
      .update(row)
      .eq("id", args.treatmentId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for treatment ${args.treatmentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Treatment updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deleteTreatmentFromSupabase = internalAction({
  args: {
    treatmentId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: match Convex behavior (isActive = false)
    const { error } = await client
      .from("gabinet_treatments")
      .update({ is_active: false, updated_at: Date.now() })
      .eq("id", args.treatmentId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for treatment ${args.treatmentId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Treatment soft-deleted in Supabase id=${args.treatmentId} org=${args.organizationId}`);
    return { success: true, id: args.treatmentId };
  },
});

// ── Treatment Variants ──────────────────────────────────────────────────

export const writeVariantToSupabase = internalAction({
  args: {
    variantId: v.string(),
    organizationId: v.string(),
    treatmentId: v.string(),
    name: v.string(),
    price: v.optional(v.number()),
    duration: v.optional(v.number()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.variantId,
      organization_id: args.organizationId,
      treatment_id: args.treatmentId,
      name: args.name,
      price: args.price ?? null,
      duration: args.duration ?? null,
      description: args.description ?? null,
      short_description: args.shortDescription ?? null,
      image: args.image ?? null,
      is_active: args.isActive ?? null,
      sort_order: args.sortOrder ?? null,
    };

    const { data, error } = await client
      .from("gabinet_treatment_variants")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for treatment variant: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Treatment variant written to Supabase id=${data.id} treatment=${args.treatmentId}`);
    return { success: true, id: data.id };
  },
});

export const updateVariantInSupabase = internalAction({
  args: {
    variantId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    duration: v.optional(v.number()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    // Clear-override flags result in setting to null
    clearPrice: v.optional(v.boolean()),
    clearDuration: v.optional(v.boolean()),
    clearDescription: v.optional(v.boolean()),
    clearShortDescription: v.optional(v.boolean()),
    clearImage: v.optional(v.boolean()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = {};
    if (args.name !== undefined) row.name = args.name;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.sortOrder !== undefined) row.sort_order = args.sortOrder;

    // Handle clearable fields
    if (args.clearPrice) row.price = null;
    else if (args.price !== undefined) row.price = args.price;

    if (args.clearDuration) row.duration = null;
    else if (args.duration !== undefined) row.duration = args.duration;

    if (args.clearDescription) row.description = null;
    else if (args.description !== undefined) row.description = args.description;

    if (args.clearShortDescription) row.short_description = null;
    else if (args.shortDescription !== undefined) row.short_description = args.shortDescription;

    if (args.clearImage) row.image = null;
    else if (args.image !== undefined) row.image = args.image;

    const { data, error } = await client
      .from("gabinet_treatment_variants")
      .update(row)
      .eq("id", args.variantId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for variant ${args.variantId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Treatment variant updated in Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const deleteVariantFromSupabase = internalAction({
  args: {
    variantId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Hard delete — Convex also does ctx.db.delete for variants
    const { error } = await client
      .from("gabinet_treatment_variants")
      .delete()
      .eq("id", args.variantId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for variant ${args.variantId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Treatment variant deleted from Supabase id=${args.variantId}`);
    return { success: true, id: args.variantId };
  },
});
