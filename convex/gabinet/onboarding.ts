/**
 * Gabinet onboarding: setup status and completion tracking.
 */

import { action, internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";

/**
 * Internal: read the organization's `onboardingCompleted` flag from Convex.
 * Organizations stay in Convex (auth table); `_completeSetupSideEffects`
 * patches the flag here only, so this is the canonical source.
 */
export const _getOnboardingFlag = internalQuery({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const org = await ctx.db.get(args.organizationId);
    return org?.onboardingCompleted ?? false;
  },
});

/**
 * Get onboarding setup status for an organization.
 * Returns which setup steps have been completed.
 *
 * Reads `gabinetEmployees` / `gabinetTreatments` / `gabinetWorkingHours`
 * from Supabase (those tables are Supabase-primary; the Convex copies are
 * empty). The org's `onboardingCompleted` flag is still patched in Convex
 * by `_completeSetupSideEffects`, so it's read back via an internal query.
 */
export const getSetupStatus = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    needsSetup: boolean;
    hasEmployees: boolean;
    hasTreatments: boolean;
    hasSchedule: boolean;
    onboardingCompleted: boolean;
  }> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    const employees = await db
      .query("gabinetEmployees")
      .eq("organizationId", orgIdStr)
      .collect();

    const treatments = await db
      .query("gabinetTreatments")
      .eq("organizationId", orgIdStr)
      .collect();

    const workingHours = await db
      .query("gabinetWorkingHours")
      .eq("organizationId", orgIdStr)
      .first();

    const onboardingCompleted: boolean = await ctx.runQuery(
      internal.gabinet.onboarding._getOnboardingFlag,
      { organizationId: args.organizationId },
    );

    return {
      needsSetup: employees.length === 0 && treatments.length === 0,
      hasEmployees: employees.length > 0,
      hasTreatments: treatments.length > 0,
      hasSchedule: !!workingHours,
      onboardingCompleted,
    };
  },
});

/**
 * Mark onboarding as completed for an organization.
 * Organizations table is an auth table that stays in Convex.
 */
export const completeSetup = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Auth + permissions via internal query
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "settings",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    // Delegate Convex-only org patch to internalMutation
    await ctx.runMutation(
      internal.gabinet.onboarding._completeSetupSideEffects,
      { organizationId: args.organizationId },
    );
  },
});

/**
 * Internal: patch organization record to mark onboarding completed.
 * Organizations table stays in Convex (auth table).
 */
export const _completeSetupSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.organizationId, {
      onboardingCompleted: true,
      updatedAt: Date.now(),
    });
  },
});
