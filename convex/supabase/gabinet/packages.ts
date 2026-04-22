/**
 * Convex → Supabase Treatment Package & Package Usage Write Actions
 *
 * Internal actions that persist gabinet treatment package and usage data
 * to PostgreSQL via Supabase service-role client (bypasses RLS).
 * Dual-write pattern: Convex mutations write to Convex first, then schedule
 * these actions to replicate to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient, upsertWithFkRetry } from "../client";

// ---------------------------------------------------------------------------
// Treatment Packages
// ---------------------------------------------------------------------------

export const writePackageToSupabase = internalAction({
  args: {
    packageId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    treatments: v.any(), // JSONB array of {treatmentId, quantity}
    totalPrice: v.number(),
    currency: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    isActive: v.boolean(),
    loyaltyPointsAwarded: v.optional(v.number()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.packageId,
      organization_id: args.organizationId,
      name: args.name,
      description: args.description ?? null,
      treatments: args.treatments,
      total_price: args.totalPrice,
      currency: args.currency ?? null,
      discount_percent: args.discountPercent ?? null,
      validity_days: args.validityDays ?? null,
      is_active: args.isActive,
      loyalty_points_awarded: args.loyaltyPointsAwarded ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_treatment_packages", row);

    console.info(`Package written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updatePackageInSupabase = internalAction({
  args: {
    packageId: v.string(),
    organizationId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    treatments: v.optional(v.any()),
    totalPrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    loyaltyPointsAwarded: v.optional(v.number()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.description !== undefined) row.description = args.description;
    if (args.treatments !== undefined) row.treatments = args.treatments;
    if (args.totalPrice !== undefined) row.total_price = args.totalPrice;
    if (args.currency !== undefined) row.currency = args.currency;
    if (args.discountPercent !== undefined) row.discount_percent = args.discountPercent;
    if (args.validityDays !== undefined) row.validity_days = args.validityDays;
    if (args.isActive !== undefined) row.is_active = args.isActive;
    if (args.loyaltyPointsAwarded !== undefined) row.loyalty_points_awarded = args.loyaltyPointsAwarded;

    const { data, error } = await client
      .from("gabinet_treatment_packages")
      .update(row)
      .eq("id", args.packageId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for package ${args.packageId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Package updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const deletePackageFromSupabase = internalAction({
  args: {
    packageId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    // Soft-delete: set is_active = false
    const { error } = await client
      .from("gabinet_treatment_packages")
      .update({ is_active: false, updated_at: Date.now() })
      .eq("id", args.packageId)
      .eq("organization_id", args.organizationId);

    if (error) {
      const msg = `Supabase delete failed for package ${args.packageId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Package soft-deleted in Supabase id=${args.packageId} org=${args.organizationId}`);
    return { success: true, id: args.packageId };
  },
});

// ---------------------------------------------------------------------------
// Package Usage
// ---------------------------------------------------------------------------

export const writePackageUsageToSupabase = internalAction({
  args: {
    usageId: v.string(),
    organizationId: v.string(),
    patientId: v.string(),
    packageId: v.string(),
    purchasedAt: v.number(),
    expiresAt: v.optional(v.number()),
    status: v.string(),
    treatmentsUsed: v.any(), // JSONB array of {treatmentId, usedCount, totalCount}
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.usageId,
      organization_id: args.organizationId,
      patient_id: args.patientId,
      package_id: args.packageId,
      purchased_at: args.purchasedAt,
      expires_at: args.expiresAt ?? null,
      status: args.status,
      treatments_used: args.treatmentsUsed,
      paid_amount: args.paidAmount,
      payment_method: args.paymentMethod ?? null,
      created_by: args.createdBy,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const data = await upsertWithFkRetry(client, "gabinet_package_usage", row);

    console.info(`Package usage written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updatePackageUsageInSupabase = internalAction({
  args: {
    usageId: v.string(),
    organizationId: v.string(),
    status: v.optional(v.string()),
    treatmentsUsed: v.optional(v.any()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.status !== undefined) row.status = args.status;
    if (args.treatmentsUsed !== undefined) row.treatments_used = args.treatmentsUsed;

    const { data, error } = await client
      .from("gabinet_package_usage")
      .update(row)
      .eq("id", args.usageId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for package usage ${args.usageId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Package usage updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
