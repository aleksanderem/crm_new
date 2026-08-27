/**
 * SP2 Task 3 — Platform-admin read actions: listOrganizations + getOrganizationDetail.
 *
 * These are read-only actions that expose cross-tenant org data to platform admins.
 * Every action first calls verifyPlatformAdmin to enforce the access guard.
 *
 * Read path: createSupabaseDb().query(...).collect() returns rows with camelCase
 * keys and `_id` as the primary key (mirrors convex/admin/entitlements.ts exactly).
 */

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const entStatusValidator = v.union(v.literal("active"), v.literal("none"));

const orgStatusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
);

const listOrgRowValidator = v.object({
  organizationId: v.string(),
  name: v.string(),
  slug: v.string(),
  ownerEmail: v.union(v.string(), v.null()),
  memberCount: v.number(),
  status: orgStatusValidator,
  plan: v.null(),
  crm: entStatusValidator,
  gabinet: entStatusValidator,
  createdAt: v.number(),
});

const memberRowValidator = v.object({
  userId: v.string(),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: v.string(),
  joinedAt: v.number(),
});

const orgDetailValidator = v.object({
  organizationId: v.string(),
  name: v.string(),
  slug: v.string(),
  website: v.union(v.string(), v.null()),
  ownerId: v.string(),
  status: orgStatusValidator,
  suspendedReason: v.union(v.string(), v.null()),
  seatLimitOverride: v.union(v.number(), v.null()),
  members: v.array(memberRowValidator),
  entitlements: v.object({
    crm: entStatusValidator,
    gabinet: entStatusValidator,
  }),
  plan: v.null(),
  seatUsage: v.object({
    currentSeats: v.number(),
    effectiveSeatLimit: v.number(),
  }),
});

// ---------------------------------------------------------------------------
// listOrganizations
// ---------------------------------------------------------------------------

export const listOrganizations = action({
  args: {},
  returns: v.array(listOrgRowValidator),
  handler: async (ctx) => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const [orgs, memberships, entRows] = await Promise.all([
      db.query("organizations").collect(),
      db.query("teamMemberships").collect(),
      db.query("productSubscriptions").collect(),
    ]);

    const ownerIds = [...new Set(orgs.map((o) => String(o.ownerId)))];
    const owners = await db.getMany("users", ownerIds);
    const ownerById = new Map(owners.map((u) => [String(u._id), u]));

    const memberCount = new Map<string, number>();
    for (const m of memberships) {
      const k = String(m.organizationId);
      memberCount.set(k, (memberCount.get(k) ?? 0) + 1);
    }

    const entByOrg = new Map<string, Set<string>>();
    for (const e of entRows) {
      if (String(e.status) !== "active") continue;
      const k = String(e.organizationId);
      if (!entByOrg.has(k)) entByOrg.set(k, new Set());
      entByOrg.get(k)!.add(String(e.productId));
    }

    return orgs
      .map((o) => {
        const id = String(o._id);
        const owner = ownerById.get(String(o.ownerId));
        const ents = entByOrg.get(id) ?? new Set<string>();
        const rawStatus = (o.status as string | undefined) ?? "active";
        return {
          organizationId: id,
          name: (o.name as string) ?? "",
          slug: (o.slug as string) ?? "",
          ownerEmail: (owner?.email as string | null) ?? null,
          memberCount: memberCount.get(id) ?? 0,
          status: (rawStatus === "suspended" ? "suspended" : "active") as
            | "active"
            | "suspended",
          plan: null,
          crm: (ents.has("crm") ? "active" : "none") as "active" | "none",
          gabinet: (ents.has("gabinet") ? "active" : "none") as
            | "active"
            | "none",
          createdAt: Number(o.createdAt ?? 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// ---------------------------------------------------------------------------
// getOrganizationDetail
// ---------------------------------------------------------------------------

export const getOrganizationDetail = action({
  args: { organizationId: v.string() },
  returns: orgDetailValidator,
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    const db = createSupabaseDb();
    const id = args.organizationId;

    const [org, memberships, entRows] = await Promise.all([
      db.get("organizations", id),
      db.query("teamMemberships").eq("organizationId", id).collect(),
      db.query("productSubscriptions").eq("organizationId", id).collect(),
    ]);

    if (!org) throw new Error("Organization not found");

    // Resolve member user details.
    const memberUserIds = memberships.map((m) => String(m.userId));
    const memberUsers = await db.getMany("users", memberUserIds);
    const userById = new Map(memberUsers.map((u) => [String(u._id), u]));

    const members = memberships.map((m) => {
      const u = userById.get(String(m.userId));
      return {
        userId: String(m.userId),
        name: (u?.name as string | null) ?? null,
        email: (u?.email as string | null) ?? null,
        role: String(m.role),
        joinedAt: Number(m.joinedAt ?? 0),
      };
    });

    // Build entitlements map for this org.
    const activeProductIds = new Set(
      entRows
        .filter((e) => String(e.status) === "active")
        .map((e) => String(e.productId)),
    );

    const entitlements = {
      crm: (activeProductIds.has("crm") ? "active" : "none") as
        | "active"
        | "none",
      gabinet: (activeProductIds.has("gabinet") ? "active" : "none") as
        | "active"
        | "none",
    };

    // Seat usage — best-effort via checkSeatLimitAction.
    let seatUsage = { currentSeats: memberships.length, effectiveSeatLimit: 20 };
    try {
      const result = await ctx.runAction(
        internal._helpers.seatLimits.checkSeatLimitAction,
        { organizationId: id, skipPendingInvitations: true },
      );
      seatUsage = {
        currentSeats: result.currentSeats,
        effectiveSeatLimit: result.seatLimit,
      };
    } catch (e) {
      // Fail-open: use member count as fallback when subscription data unavailable.
      console.warn(
        "[admin/organizations.getOrganizationDetail] seatLimit lookup failed:",
        e,
      );
    }

    const rawStatus = (org.status as string | undefined) ?? "active";

    return {
      organizationId: id,
      name: (org.name as string) ?? "",
      slug: (org.slug as string) ?? "",
      website: (org.website as string | null) ?? null,
      ownerId: String(org.ownerId),
      status: (rawStatus === "suspended" ? "suspended" : "active") as
        | "active"
        | "suspended",
      suspendedReason: (org.suspendedReason as string | null) ?? null,
      seatLimitOverride: (org.seatLimitOverride as number | null) ?? null,
      members,
      entitlements,
      plan: null,
      seatUsage,
    };
  },
});
