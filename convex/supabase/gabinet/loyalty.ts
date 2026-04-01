/**
 * Convex → Supabase Loyalty Points & Transactions Write Actions
 *
 * Internal actions that persist gabinet loyalty data to PostgreSQL via
 * Supabase service-role client (bypasses RLS). Dual-write pattern: Convex
 * mutations write to Convex first, then schedule these actions to replicate
 * to Supabase.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { createServiceRoleClient } from "../client";

// ---------------------------------------------------------------------------
// Loyalty Points
// ---------------------------------------------------------------------------

export const writeLoyaltyPointsToSupabase = internalAction({
  args: {
    loyaltyId: v.string(),
    organizationId: v.string(),
    patientId: v.string(),
    balance: v.number(),
    lifetimeEarned: v.number(),
    lifetimeSpent: v.number(),
    tier: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.loyaltyId,
      organization_id: args.organizationId,
      patient_id: args.patientId,
      balance: args.balance,
      lifetime_earned: args.lifetimeEarned,
      lifetime_spent: args.lifetimeSpent,
      tier: args.tier ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };

    const { data, error } = await client
      .from("gabinet_loyalty_points")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for loyalty points: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Loyalty points written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

export const updateLoyaltyPointsInSupabase = internalAction({
  args: {
    loyaltyId: v.string(),
    organizationId: v.string(),
    balance: v.optional(v.number()),
    lifetimeEarned: v.optional(v.number()),
    lifetimeSpent: v.optional(v.number()),
    tier: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.balance !== undefined) row.balance = args.balance;
    if (args.lifetimeEarned !== undefined) row.lifetime_earned = args.lifetimeEarned;
    if (args.lifetimeSpent !== undefined) row.lifetime_spent = args.lifetimeSpent;
    if (args.tier !== undefined) row.tier = args.tier;

    const { data, error } = await client
      .from("gabinet_loyalty_points")
      .update(row)
      .eq("id", args.loyaltyId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for loyalty points ${args.loyaltyId}: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase update returned malformed response: missing id");
    }

    console.info(`Loyalty points updated in Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});

// ---------------------------------------------------------------------------
// Loyalty Transactions
// ---------------------------------------------------------------------------

export const writeLoyaltyTransactionToSupabase = internalAction({
  args: {
    transactionId: v.string(),
    organizationId: v.string(),
    patientId: v.string(),
    type: v.string(),
    points: v.number(),
    reason: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    balanceAfter: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args): Promise<{ success: boolean; id: string }> => {
    const client = createServiceRoleClient();

    const row = {
      id: args.transactionId,
      organization_id: args.organizationId,
      patient_id: args.patientId,
      type: args.type,
      points: args.points,
      reason: args.reason,
      reference_type: args.referenceType ?? null,
      reference_id: args.referenceId ?? null,
      balance_after: args.balanceAfter,
      created_by: args.createdBy,
      created_at: args.createdAt,
    };

    const { data, error } = await client
      .from("gabinet_loyalty_transactions")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase write failed for loyalty transaction: ${error.message} (code=${error.code})`;
      console.error(msg);
      throw new Error(msg);
    }

    if (!data || typeof data.id !== "string") {
      throw new Error("Supabase write returned malformed response: missing id");
    }

    console.info(`Loyalty transaction written to Supabase id=${data.id} org=${args.organizationId}`);
    return { success: true, id: data.id };
  },
});
