import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireUser } from "./_helpers/auth";
import { createNotificationDirect } from "./notifications";

export const listByResource = query({
  args: {
    organizationId: v.id("organizations"),
    resourceType: v.string(),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const invites = await ctx.db
      .query("resourceInvites")
      .withIndex("by_orgAndResource", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("resourceType", args.resourceType)
          .eq("resourceId", args.resourceId)
      )
      .collect();

    return invites.filter((i) => i.status !== "revoked");
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    accessLevel: v.union(v.literal("viewer"), v.literal("editor")),
  },
  handler: async (ctx, args) => {
    const { user, membership } = await verifyOrgAccess(ctx, args.organizationId);

    if (membership.role !== "owner" && membership.role !== "admin") {
      throw new Error("Only admins or owners can create resource invites");
    }

    const token = crypto.randomUUID();
    const now = Date.now();

    const inviteId = await ctx.db.insert("resourceInvites", {
      organizationId: args.organizationId,
      email: args.email,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      accessLevel: args.accessLevel,
      invitedBy: user._id,
      token,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Notify org owner about the new share
    const org = await ctx.db.get(args.organizationId);
    if (org) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: org.ownerId,
        type: "resource_invite",
        title: "Resource shared",
        message: `${user.name ?? user.email ?? "A team member"} shared a ${args.resourceType} with ${args.email}`,
        link: `/${args.resourceType}s/${args.resourceId}`,
      });
    }

    return { inviteId, token };
  },
});

export const acceptByToken = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const invite = await ctx.db
      .query("resourceInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("Invite is no longer valid");

    await ctx.db.patch(invite._id, {
      status: "accepted",
      userId: user._id,
      updatedAt: Date.now(),
    });

    return invite;
  },
});

export const revoke = mutation({
  args: {
    organizationId: v.id("organizations"),
    inviteId: v.id("resourceInvites"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.organizationId !== args.organizationId) {
      throw new Error("Invite not found");
    }

    await ctx.db.patch(args.inviteId, {
      status: "revoked",
      updatedAt: Date.now(),
    });

    return args.inviteId;
  },
});
