import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, verifyOrgAccess, requireOrgAdmin } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { orgRoleValidator } from "@cvx/schema";

export const create = mutation({
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

    await ctx.db.insert("teamMemberships", {
      userId: user._id,
      organizationId: orgId,
      role: "owner",
      joinedAt: now,
    });

    await logActivity(ctx, {
      organizationId: orgId,
      entityType: "organization",
      entityId: orgId,
      action: "created",
      description: `Created organization "${args.name}"`,
      performedBy: user._id,
    });

    return orgId;
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

export const update = mutation({
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

    return organizationId;
  },
});

export const getMembers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const memberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return {
          ...m,
          user: user
            ? { _id: user._id, name: user.name, email: user.email, image: user.image }
            : null,
        };
      })
    );
  },
});

export const inviteMember = mutation({
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

    const membershipId = await ctx.db.insert("teamMemberships", {
      userId: args.userId,
      organizationId: args.organizationId,
      role: args.role,
      invitedBy: user._id,
      joinedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "organization",
      entityId: args.organizationId,
      action: "assigned",
      description: `Invited new member with role "${args.role}"`,
      performedBy: user._id,
    });

    return membershipId;
  },
});

export const updateMemberRole = mutation({
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

    return args.membershipId;
  },
});

export const removeMember = mutation({
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

    return args.membershipId;
  },
});

export const getUsageStats = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const [members, contacts, companies, leads, documents, products, emails] =
      await Promise.all([
        ctx.db
          .query("teamMemberships")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
        ctx.db
          .query("contacts")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .collect(),
        ctx.db
          .query("companies")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .collect(),
        ctx.db
          .query("leads")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .collect(),
        ctx.db
          .query("documents")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .collect(),
        ctx.db
          .query("products")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .collect(),
        ctx.db
          .query("emails")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .collect(),
      ]);

    return {
      memberCount: members.length,
      contactCount: contacts.length,
      companyCount: companies.length,
      leadCount: leads.length,
      documentCount: documents.length,
      productCount: products.length,
      emailCount: emails.length,
    };
  },
});
