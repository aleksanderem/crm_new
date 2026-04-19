/**
 * Gabinet onboarding: setup status and completion tracking.
 */

import { query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";

/**
 * Get onboarding setup status for an organization.
 * Returns which setup steps have been completed.
 */
export const getSetupStatus = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    // Check employees exist (gabinetEmployees table uses by_org index)
    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Check treatments exist
    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Check working hours exist
    const workingHours = await ctx.db
      .query("gabinetWorkingHours")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    // Get organization onboarding status
    const org = await ctx.db.get(args.organizationId);

    return {
      needsSetup: employees.length === 0 && treatments.length === 0,
      hasEmployees: employees.length > 0,
      hasTreatments: treatments.length > 0,
      hasSchedule: !!workingHours,
      onboardingCompleted: org?.onboardingCompleted ?? false,
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
