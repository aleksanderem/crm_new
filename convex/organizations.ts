import { internal } from "./_generated/api";
import { query, action, internalMutation } from "./_generated/server";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { requireUser, verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";
import { checkSeatLimit } from "./_helpers/seatLimits";
import { logActivity } from "./_helpers/activities";
import { orgRoleValidator } from "@cvx/schema";
import type { Id } from "./_generated/dataModel";

// organizations and teamMemberships are AUTH tables — STAY in Convex DB.
// Supabase gets a copy for analytics/reporting.

export const create = action({
  args: {
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    // Create org and membership in Convex DB (auth tables)
    const orgId: string = await ctx.runMutation(internal.organizations._createOrgInternal, {
      name: args.name,
      slug: args.slug,
      logo: args.logo,
      website: args.website,
    });

    // Also write to Supabase
    try {
      const db = createSupabaseDb();
      await db.insert("organizations", {
        _id: orgId,
        organizationId: orgId,
        name: args.name,
        slug: args.slug,
        logo: args.logo ?? null,
        website: args.website ?? null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch {
      // Supabase write is best-effort
    }

    return orgId;
  },
});

export const _createOrgInternal = internalMutation({
  args: {
    name: v.string(),
    slug: v.string(),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) throw new Error("Organization slug already taken");

    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      slug: args.slug,
      ownerId: user._id,
      logo: args.logo,
      website: args.website,
      createdAt: now,
      updatedAt: now,
    });

    const ownerMembershipId = await ctx.db.insert("teamMemberships", {
      userId: user._id,
      organizationId: orgId,
      role: "owner",
      joinedAt: now,
    });

    // Mirror owner membership to Supabase — same reason as in
    // invitations._acceptInternal: the UI reads team_memberships from
    // Supabase, not Convex, so without this the org creator has zero
    // permissions in their own org.
    await ctx.scheduler.runAfter(
      0,
      internal.supabase.organizations.writeTeamMembershipToSupabase,
      {
        membershipId: String(ownerMembershipId),
        userId: String(user._id),
        organizationId: String(orgId),
        role: "owner",
        joinedAt: now,
      },
    );

    await logActivity(ctx, {
      organizationId: orgId,
      entityType: "organization",
      entityId: orgId,
      action: "created",
      description: `Created organization "${args.name}"`,
      performedBy: user._id,
    });

    // Seed default reference data
    await ctx.scheduler.runAfter(
      0,
      internal.seedDefaults.seedOrganizationDefaults,
      { organizationId: orgId, userId: user._id },
    );

    return String(orgId);
  },
});

export const getMyOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const memberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Sort most-recently-joined first so the UI picks the right org on login
    // when a user belongs to multiple orgs (e.g. their own + an invited org).
    memberships.sort((a, b) => b.joinedAt - a.joinedAt);

    const orgs = await Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.organizationId);
        return org ? { ...org, role: m.role } : null;
      })
    );

    return orgs.filter(Boolean);
  },
});

export const getById = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db.get(args.organizationId);
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"organizations">> => {
    // Update in Convex DB (auth table)
    await ctx.runMutation(internal.organizations._updateOrgInternal, {
      organizationId: args.organizationId,
      name: args.name,
      slug: args.slug,
      logo: args.logo,
      website: args.website,
    });

    // Also update in Supabase
    try {
      const db = createSupabaseDb();
      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (args.name !== undefined) updates.name = args.name;
      if (args.slug !== undefined) updates.slug = args.slug;
      if (args.logo !== undefined) updates.logo = args.logo;
      if (args.website !== undefined) updates.website = args.website;
      await db.patch("organizations", String(args.organizationId), updates);
    } catch {
      // Supabase write is best-effort
    }

    return args.organizationId;
  },
});

export const _updateOrgInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const { organizationId, ...updates } = args;

    if (updates.slug) {
      const existing = await ctx.db
        .query("organizations")
        .withIndex("by_slug", (q) => q.eq("slug", updates.slug!))
        .unique();
      if (existing && existing._id !== organizationId) {
        throw new Error("Organization slug already taken");
      }
    }

    await ctx.db.patch(organizationId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "organization",
      entityId: organizationId,
      action: "updated",
      description: `Updated organization settings`,
      performedBy: user._id,
    });
  },
});

export const getMembers = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const memberships = await db
      .query("teamMemberships")
      .eq("organizationId", String(args.organizationId))
      .collect();

    const userIds = [...new Set(memberships.map((m) => String(m.userId)))];
    const users = await db.getMany("users", userIds);
    const userById = new Map(users.map((u) => [String(u._id), u]));

    return memberships.map((m) => {
      const user = userById.get(String(m.userId));
      return {
        ...m,
        user: user
          ? { _id: String(user._id), name: (user.name as string | null) ?? null, email: (user.email as string | null) ?? null, image: (user.image as string | null) ?? null }
          : null,
      };
    });
  },
});

export const inviteMember = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    role: orgRoleValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    const { canAddMore, currentSeats, seatLimit } = await ctx.runAction(
      internal._helpers.seatLimits.checkSeatLimitAction,
      { organizationId: args.organizationId },
    );
    if (!canAddMore) {
      throw new Error(
        `Seat limit reached (${currentSeats}/${seatLimit}). Upgrade your plan to add more team members.`,
      );
    }

    const membershipId: string = await ctx.runMutation(
      internal.organizations._inviteMemberInternal,
      {
        organizationId: args.organizationId,
        userId: args.userId as any,
        role: args.role,
      },
    );
    return membershipId;
  },
});

export const _inviteMemberInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: orgRoleValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);

    const existing = await ctx.db
      .query("teamMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .unique();
    if (existing) throw new Error("User is already a member");

    const joinedAt = Date.now();
    const membershipId = await ctx.db.insert("teamMemberships", {
      userId: args.userId,
      organizationId: args.organizationId,
      role: args.role,
      invitedBy: user._id,
      joinedAt,
    });

    // Mirror to Supabase — UI reads team_memberships from there.
    await ctx.scheduler.runAfter(
      0,
      internal.supabase.organizations.writeTeamMembershipToSupabase,
      {
        membershipId: String(membershipId),
        userId: String(args.userId),
        organizationId: String(args.organizationId),
        role: args.role,
        invitedBy: String(user._id),
        joinedAt,
      },
    );

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "organization",
      entityId: args.organizationId,
      action: "assigned",
      description: `Invited new member with role "${args.role}"`,
      performedBy: user._id,
    });

    return String(membershipId);
  },
});

export const updateMemberRole = action({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.string(),
    role: orgRoleValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    const membershipData = await ctx.runMutation(internal.organizations._updateMemberRoleInternal, {
      organizationId: args.organizationId,
      membershipId: args.membershipId as any,
      role: args.role,
    });
    // Await the Supabase write directly so the UI sees the updated role when it
    // refetches — scheduler.runAfter is fire-and-forget and loses the race.
    await ctx.runAction(internal.supabase.organizations.writeTeamMembershipToSupabase, {
      membershipId: args.membershipId,
      userId: membershipData.userId,
      organizationId: String(args.organizationId),
      role: args.role,
      invitedBy: membershipData.invitedBy,
      joinedAt: membershipData.joinedAt,
    });
    return args.membershipId;
  },
});

export const _updateMemberRoleInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("teamMemberships"),
    role: orgRoleValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);

    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.organizationId !== args.organizationId) {
      throw new Error("Membership not found");
    }
    if (membership.role === "owner") {
      throw new Error("Cannot change the owner's role");
    }

    await ctx.db.patch(args.membershipId, { role: args.role });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "organization",
      entityId: args.organizationId,
      action: "updated",
      description: `Updated member role to "${args.role}"`,
      performedBy: user._id,
    });

    return {
      userId: String(membership.userId),
      invitedBy: membership.invitedBy ? String(membership.invitedBy) : undefined,
      joinedAt: membership.joinedAt ?? Date.now(),
    };
  },
});

export const removeMember = action({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runMutation(internal.organizations._removeMemberInternal, {
      organizationId: args.organizationId,
      membershipId: args.membershipId as any,
    });
    // Await the Supabase delete directly so the UI sees the removal when it
    // refetches — scheduler.runAfter is fire-and-forget and loses the race.
    await ctx.runAction(internal.supabase.organizations.deleteTeamMembershipFromSupabase, {
      membershipId: args.membershipId,
    });
    return args.membershipId;
  },
});

export const _removeMemberInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    membershipId: v.id("teamMemberships"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);

    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.organizationId !== args.organizationId) {
      throw new Error("Membership not found");
    }
    if (membership.role === "owner") {
      throw new Error("Cannot remove the organization owner");
    }

    await ctx.db.delete(args.membershipId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "organization",
      entityId: args.organizationId,
      action: "deleted",
      description: `Removed a member from the organization`,
      performedBy: user._id,
    });
  },
});

export const getSeatUsage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await checkSeatLimit(ctx, args);
  },
});

// Returns only the seat limit (from subscriptions/plans, which are Convex-only tables).
// Seat counts (team_memberships + invitations) are read from Supabase by the frontend hook.
export const getSeatLimit = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const org = await ctx.db.get(args.organizationId);
    if (!org) throw new Error("Organization not found");

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", org.ownerId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "active"),
          q.eq(q.field("status"), "trialing"),
        ),
      )
      .first();

    if (!subscription) return { seatLimit: 20 };

    const plan = await ctx.db.get(subscription.planId);
    return { seatLimit: plan?.seatLimit ?? 20 };
  },
});
