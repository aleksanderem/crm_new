/**
 * Gabinet onboarding: setup status and completion tracking.
 */

import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";

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
 */
export const completeSetup = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const perm = await checkPermission(ctx, args.organizationId, "settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    await ctx.db.patch(args.organizationId, {
      onboardingCompleted: true,
      updatedAt: Date.now(),
    });
  },
});
