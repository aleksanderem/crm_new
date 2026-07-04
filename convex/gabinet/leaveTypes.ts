import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import type { GabinetLeaveTypeRow } from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for leaveType writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GabinetLeaveTypeRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    let q = db.query("gabinetLeaveTypes").eq("organizationId", String(args.organizationId));
    if (args.activeOnly) {
      q = q.eq("isActive", true);
    }
    return (await q.collect()) as GabinetLeaveTypeRow[];
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetLeaveTypeRow> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    const lt = (await db.get("gabinetLeaveTypes", args.leaveTypeId)) as
      | GabinetLeaveTypeRow
      | null;
    if (!lt || String(lt.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave type not found");
    }
    return lt;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.optional(v.string()),
    isPaid: v.boolean(),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Self-heal: if the organization row is missing from Supabase (can happen
    // for orgs created before the Supabase migration or during a failed async
    // sync), upsert it now so the gabinet_leave_types FK constraint doesn't fire.
    const client = db.raw();
    const { data: existingOrg } = await client
      .from("organizations")
      .select("id")
      .eq("id", orgIdStr)
      .maybeSingle();
    if (!existingOrg) {
      const org = await ctx.runQuery(internal.supabase.backfill._getOrganization, {
        organizationId: orgIdStr,
      });
      if (org) {
        await client.from("organizations").upsert(
          {
            id: orgIdStr,
            name: org.name,
            slug: org.slug,
            owner_id: String(org.ownerId),
            logo: org.logo ?? null,
            website: org.website ?? null,
            created_at: org.createdAt ?? now,
            updated_at: org.updatedAt ?? now,
          },
          { onConflict: "id" },
        );
      }
    }

    const leaveTypeId = await db.insert("gabinetLeaveTypes", {
      organizationId: orgIdStr,
      name: args.name,
      color: args.color ?? null,
      isPaid: args.isPaid,
      annualQuotaDays: args.annualQuotaDays ?? null,
      requiresApproval: args.requiresApproval,
      isActive: true,
      createdBy: authResult.userId,
      createdAt: now,
      updatedAt: now,
    });

    return leaveTypeId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.leaveTypes",
        fnName: "create",
        argsJson: JSON.stringify(args),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isPaid: v.optional(v.boolean()),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const db = createSupabaseDb();

    const lt = await db.get("gabinetLeaveTypes", args.leaveTypeId);
    if (!lt || String(lt.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave type not found");
    }

    const { organizationId, leaveTypeId, ...updates } = args;
    const now = Date.now();

    // Build patch object with only provided fields
    const patch: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.color !== undefined) patch.color = updates.color;
    if (updates.isPaid !== undefined) patch.isPaid = updates.isPaid;
    if (updates.annualQuotaDays !== undefined) patch.annualQuotaDays = updates.annualQuotaDays;
    if (updates.requiresApproval !== undefined) patch.requiresApproval = updates.requiresApproval;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;

    await db.patch("gabinetLeaveTypes", leaveTypeId, patch);

    return leaveTypeId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.leaveTypes",
        fnName: "update",
        argsJson: JSON.stringify(args),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const db = createSupabaseDb();

    const lt = await db.get("gabinetLeaveTypes", args.leaveTypeId);
    if (!lt || String(lt.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave type not found");
    }

    // Soft-delete
    await db.patch("gabinetLeaveTypes", args.leaveTypeId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

// --- Leave Balances ---

export const getBalances = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });

    const db = createSupabaseDb();
    return await db
      .query("gabinetLeaveBalances")
      .eq("organizationId", String(args.organizationId))
      .eq("employeeId", args.employeeId)
      .eq("year", args.year)
      .collect();
  },
});

export const getAllBalances = action({
  args: {
    organizationId: v.id("organizations"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });

    const db = createSupabaseDb();
    return await db
      .query("gabinetLeaveBalances")
      .eq("organizationId", String(args.organizationId))
      .eq("year", args.year)
      .collect();
  },
});

export const initializeBalance = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    leaveTypeId: v.string(),
    year: v.number(),
    totalDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();
    const db = createSupabaseDb();

    // Check if balance already exists
    const existing = await db.query("gabinetLeaveBalances")
      .eq("organizationId", String(args.organizationId))
      .eq("employeeId", args.employeeId)
      .eq("leaveTypeId", args.leaveTypeId)
      .eq("year", args.year)
      .first();

    if (existing) {
      if (args.totalDays !== undefined) {
        await db.patch("gabinetLeaveBalances", existing._id as string, {
          totalDays: args.totalDays,
          updatedAt: now,
        });
      }
      return existing._id as string;
    }

    // Get quota from leave type
    const leaveType = await db.get("gabinetLeaveTypes", args.leaveTypeId);
    if (!leaveType) throw new Error("Leave type not found");

    const totalDays = args.totalDays ?? (leaveType.annualQuotaDays as number) ?? 0;
    const balanceId = await db.insert("gabinetLeaveBalances", {
      organizationId: String(args.organizationId),
      employeeId: args.employeeId,
      leaveTypeId: args.leaveTypeId,
      year: args.year,
      totalDays,
      usedDays: 0,
      createdAt: now,
      updatedAt: now,
    });

    return balanceId;
  },
});

export const adjustBalance = action({
  args: {
    organizationId: v.id("organizations"),
    balanceId: v.string(),
    totalDays: v.optional(v.number()),
    usedDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const db = createSupabaseDb();

    const balance = await db.get("gabinetLeaveBalances", args.balanceId);
    if (!balance || String(balance.organizationId) !== String(args.organizationId)) {
      throw new Error("Balance not found");
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.totalDays !== undefined) updates.totalDays = args.totalDays;
    if (args.usedDays !== undefined) updates.usedDays = args.usedDays;

    await db.patch("gabinetLeaveBalances", args.balanceId, updates);
  },
});

/** Initialize balances for all active employees for a given year */
export const initializeAllBalances = action({
  args: {
    organizationId: v.id("organizations"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();
    const db = createSupabaseDb();

    const employees = await db.query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .collect();

    const leaveTypes = await db.query("gabinetLeaveTypes")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .collect();

    let created = 0;
    for (const emp of employees) {
      for (const lt of leaveTypes) {
        if ((lt.annualQuotaDays as number | undefined) === undefined) continue;

        const existing = await db.query("gabinetLeaveBalances")
          .eq("organizationId", String(args.organizationId))
          .eq("employeeId", emp._id as string)
          .eq("leaveTypeId", lt._id as string)
          .eq("year", args.year)
          .first();

        if (!existing) {
          await db.insert("gabinetLeaveBalances", {
            organizationId: String(args.organizationId),
            employeeId: emp._id as string,
            leaveTypeId: lt._id as string,
            year: args.year,
            totalDays: lt.annualQuotaDays as number,
            usedDays: 0,
            createdAt: now,
            updatedAt: now,
          });

          created++;
        }
      }
    }

    return { created };
  },
});
