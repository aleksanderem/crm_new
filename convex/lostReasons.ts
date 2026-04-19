import { query, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const reasons = await ctx.db
      .query("lostReasons")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    reasons.sort((a, b) => a.order - b.order);
    return reasons;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("lostReasons")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const maxOrder = existing.length > 0 ? Math.max(...existing.map((r: any) => r.order ?? 0)) : -1;

    const reasonId = await db.insert("lostReasons", {
      organizationId: String(args.organizationId),
      label: args.label,
      order: maxOrder + 1,
      isActive: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return reasonId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    reasonId: v.string(),
    label: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const reason = await db.get("lostReasons", args.reasonId);
    if (!reason || reason.organizationId !== String(args.organizationId)) {
      throw new Error("Lost reason not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.label !== undefined) updates.label = args.label;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await db.patch("lostReasons", args.reasonId, updates);
    return args.reasonId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    reasonId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const reason = await db.get("lostReasons", args.reasonId);
    if (!reason || reason.organizationId !== String(args.organizationId)) {
      throw new Error("Lost reason not found");
    }

    await db.delete("lostReasons", args.reasonId);
    return args.reasonId;
  },
});

export const seed = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("lostReasons")
      .eq("organizationId", String(args.organizationId))
      .collect();

    if (existing.length > 0) return [];

    const defaults = [
      "Budget constraints",
      "Chose competitor",
      "No response",
      "Timing not right",
      "Requirements changed",
      "Price too high",
      "Other",
    ];
    const ids = [];

    for (let i = 0; i < defaults.length; i++) {
      const id = await db.insert("lostReasons", {
        organizationId: String(args.organizationId),
        label: defaults[i],
        order: i,
        isActive: true,
        createdBy: String(authResult.userId),
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }

    return ids;
  },
});

export const reorder = action({
  args: {
    organizationId: v.id("organizations"),
    reasonIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();

    for (let i = 0; i < args.reasonIds.length; i++) {
      const reason = await db.get("lostReasons", args.reasonIds[i]);
      if (!reason || reason.organizationId !== String(args.organizationId)) {
        throw new Error("Lost reason not found");
      }
      await db.patch("lostReasons", args.reasonIds[i], { order: i, updatedAt: Date.now() });
    }

    return true;
  },
});
