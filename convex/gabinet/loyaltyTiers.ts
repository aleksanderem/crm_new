import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import { gabinetLoyaltyTierValidator } from "../schema";
import type { GabinetLoyaltyTierRow } from "../_helpers/supabaseRows";

const DEFAULT_TIERS = [
  { tier: "bronze" as const, name: "Brązowy", threshold: 0, color: "#cd7f32" },
  { tier: "silver" as const, name: "Srebrny", threshold: 200, color: "#c0c0c0" },
  { tier: "gold" as const, name: "Złoty", threshold: 500, color: "#ffd700" },
  { tier: "platinum" as const, name: "Platynowy", threshold: 1000, color: "#e5e4e2" },
];

export const list = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<GabinetLoyaltyTierRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const db = createSupabaseDb();
    const rows = await db
      .query("gabinetLoyaltyTiers")
      .eq("organizationId", String(args.organizationId))
      .collect();
    return (rows as GabinetLoyaltyTierRow[]).sort(
      (a, b) => (a.threshold as number) - (b.threshold as number),
    );
  },
});

export const upsert = action({
  args: {
    organizationId: v.id("organizations"),
    tier: gabinetLoyaltyTierValidator,
    name: v.string(),
    threshold: v.number(),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
        organizationId: args.organizationId,
      });
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
      const perm = await ctx.runAction(
        internal._helpers.authAction.checkPermission,
        { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
      ) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const now = Date.now();
      const db = createSupabaseDb();
      const orgIdStr = String(args.organizationId);

      const existing = await db
        .query("gabinetLoyaltyTiers")
        .eq("organizationId", orgIdStr)
        .eq("tier", args.tier)
        .first();

      if (existing) {
        const patch: Record<string, unknown> = {
          name: args.name,
          threshold: args.threshold,
          updatedAt: now,
        };
        if (args.color !== undefined) patch.color = args.color;
        await db.patch("gabinetLoyaltyTiers", String(existing._id), patch);
        return String(existing._id);
      } else {
        const id = await db.insert("gabinetLoyaltyTiers", {
          organizationId: orgIdStr,
          tier: args.tier,
          name: args.name,
          threshold: args.threshold,
          color: args.color ?? null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        return id;
      }
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.loyaltyTiers",
        fnName: "upsert",
        argsJson: JSON.stringify(args),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const seedDefaults = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
        organizationId: args.organizationId,
      });
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
      const perm = await ctx.runAction(
        internal._helpers.authAction.checkPermission,
        { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
      ) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const now = Date.now();
      const db = createSupabaseDb();
      const orgIdStr = String(args.organizationId);

      const existing = await db
        .query("gabinetLoyaltyTiers")
        .eq("organizationId", orgIdStr)
        .collect();

      const existingTiers = new Set(existing.map((r) => r.tier as string));
      let created = 0;

      for (const def of DEFAULT_TIERS) {
        if (!existingTiers.has(def.tier)) {
          await db.insert("gabinetLoyaltyTiers", {
            organizationId: orgIdStr,
            tier: def.tier,
            name: def.name,
            threshold: def.threshold,
            color: def.color,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          });
          created++;
        }
      }

      return { created };
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.loyaltyTiers",
        fnName: "seedDefaults",
        argsJson: JSON.stringify(args),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});
