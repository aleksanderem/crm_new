import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { createNotificationDirect } from "./notifications";
import { logAudit } from "./auditLog";

export const listByResource = action({
  args: {
    organizationId: v.id("organizations"),
    resourceType: v.string(),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const invites = await db
      .query("resourceInvites")
      .eq("organizationId", String(args.organizationId))
      .eq("resourceType", args.resourceType)
      .eq("resourceId", args.resourceId)
      .collect();

    return invites.filter((i) => i.status !== "revoked");
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    accessLevel: v.union(v.literal("viewer"), v.literal("editor")),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Only admins or owners can create resource invites");
    }

    const db = createSupabaseDb();
    const token = crypto.randomUUID();
    const now = Date.now();

    const inviteId = await db.insert("resourceInvites", {
      organizationId: String(args.organizationId),
      email: args.email,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      accessLevel: args.accessLevel,
      invitedBy: String(authResult.userId),
      token,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    // Side effects (notifications, audit) via internal mutation
    try {
      await ctx.runMutation(internal.resourceInvites._createSideEffects, {
        organizationId: args.organizationId,
        userId: authResult.userId,
        userName: authResult.userName ?? authResult.userEmail ?? "A team member",
        email: args.email,
        resourceType: args.resourceType,
        resourceId: args.resourceId,
        accessLevel: args.accessLevel,
      });
    } catch {
      // side effects are best-effort
    }

    return { inviteId, token };
  },
});

export const acceptByToken = action({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const invites = await db
      .query("resourceInvites")
      .eq("token", args.token)
      .first();

    if (!invites) throw new Error("Invite not found");
    if (invites.status !== "pending") throw new Error("Invite is no longer valid");

    // Get user from auth context - we need the requesting user's ID
    // Since this uses requireUser (not org-scoped), we pass through the token verification
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: invites.organizationId as any },
    );

    await db.patch("resourceInvites", invites._id as string, {
      status: "accepted",
      userId: String(authResult.userId),
      updatedAt: Date.now(),
    });

    return invites;
  },
});

export const revoke = action({
  args: {
    organizationId: v.id("organizations"),
    inviteId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const invite = await db.get("resourceInvites", args.inviteId);
    if (!invite || invite.organizationId !== String(args.organizationId)) {
      throw new Error("Invite not found");
    }

    await db.patch("resourceInvites", args.inviteId, {
      status: "revoked",
      updatedAt: Date.now(),
    });

    // Side effects (audit) via internal mutation
    try {
      await ctx.runMutation(internal.resourceInvites._revokeSideEffects, {
        organizationId: args.organizationId,
        userId: authResult.userId,
        email: invite.email as string,
        resourceType: invite.resourceType as string,
        resourceId: invite.resourceId as string,
      });
    } catch {
      // side effects are best-effort
    }

    return args.inviteId;
  },
});

// --- Internal side-effect mutations ---

export const _createSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    userName: v.string(),
    email: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    accessLevel: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (org) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: org.ownerId,
        type: "resource_invite",
        title: "Resource shared",
        message: `${args.userName} shared a ${args.resourceType} with ${args.email}`,
        link: `/${args.resourceType}s/${args.resourceId}`,
      });
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "resource_shared",
      entityType: args.resourceType,
      entityId: args.resourceId as any,
      details: JSON.stringify({ email: args.email, resourceType: args.resourceType, accessLevel: args.accessLevel }),
    });
  },
});

export const _revokeSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    email: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "resource_invite_revoked",
      entityType: args.resourceType,
      entityId: args.resourceId as any,
      details: JSON.stringify({ email: args.email, resourceType: args.resourceType }),
    });
  },
});
