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
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });

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
 * Persists wizard-collected data (org name, currency, treatments, working hours)
 * in addition to seeding document templates.
 * Organizations table is an auth table that stays in Convex.
 */
export const completeSetup = action({
  args: {
    organizationId: v.id("organizations"),
    organizationName: v.optional(v.string()),
    currency: v.optional(v.string()),
    treatments: v.optional(v.array(v.object({
      name: v.string(),
      price: v.number(),
      duration: v.number(),
    }))),
    workingHours: v.optional(v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      isOpen: v.boolean(),
    }))),
  },
  handler: async (ctx, args) => {
    // Auth + permissions via internal query
    const { userId } = await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "settings",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Update organization name in Convex (auth table)
    if (args.organizationName) {
      await ctx.runMutation(internal.organizations._updateOrgInternal, {
        organizationId: args.organizationId,
        name: args.organizationName,
      });
    }

    // Upsert default currency in orgSettings (Supabase)
    if (args.currency) {
      const existingSettings = await db
        .query("orgSettings")
        .eq("organizationId", orgIdStr)
        .first();
      if (existingSettings) {
        await db.patch("orgSettings", existingSettings._id as string, {
          defaultCurrency: args.currency,
          updatedAt: now,
        });
      } else {
        await db.insert("orgSettings", {
          organizationId: orgIdStr,
          allowCustomLostReason: false,
          lostReasonRequired: false,
          defaultCurrency: args.currency,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Seed treatments entered in the wizard
    if (args.treatments && args.treatments.length > 0) {
      for (const t of args.treatments) {
        await db.insert("gabinetTreatments", {
          organizationId: orgIdStr,
          name: t.name,
          price: t.price,
          duration: t.duration,
          isActive: true,
          createdBy: String(userId),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Seed working hours configured in the wizard (upsert by dayOfWeek)
    if (args.workingHours && args.workingHours.length > 0) {
      for (const wh of args.workingHours) {
        const existing = await db
          .query("gabinetWorkingHours")
          .eq("organizationId", orgIdStr)
          .eq("dayOfWeek", wh.dayOfWeek)
          .first();
        if (existing) {
          await db.patch("gabinetWorkingHours", existing._id as string, {
            startTime: wh.startTime,
            endTime: wh.endTime,
            isOpen: wh.isOpen,
            updatedAt: now,
          });
        } else {
          await db.insert("gabinetWorkingHours", {
            organizationId: orgIdStr,
            dayOfWeek: wh.dayOfWeek,
            startTime: wh.startTime,
            endTime: wh.endTime,
            isOpen: wh.isOpen,
            breakStart: null,
            breakEnd: null,
            locationId: null,
            createdBy: String(userId),
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Delegate Convex-only org patch to internalMutation
    await ctx.runMutation(
      internal.gabinet.onboarding._completeSetupSideEffects,
      { organizationId: args.organizationId },
    );

    // Seed default beauty document templates for this organization.
    // Idempotent — skips any template whose name already exists.
    await ctx.runMutation(internal.documents.seed.seedBeautyDocumentTemplatesInternal, {
      organizationId: args.organizationId,
      userId,
    });

    // Backfill filledBy on any existing formField templates that pre-date
    // the filledBy feature. Idempotent — no-op when values are already correct.
    await ctx.runMutation(internal.documents.seed.migrateFormFieldFilledByInternal, {
      organizationId: args.organizationId,
    });
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
