import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin, requireUser } from "./_helpers/auth";
import { checkSeatLimit } from "./_helpers/seatLimits";
import { orgRoleValidator } from "@cvx/schema";
import { logActivity } from "./_helpers/activities";
import { logAudit } from "./auditLog";
import { createNotificationDirect } from "./notifications";

export const listPending = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const pending = invitations.filter((inv) => inv.status === "pending");

    return await Promise.all(
      pending.map(async (inv) => {
        const inviter = await ctx.db.get(inv.invitedBy);
        return {
          ...inv,
          inviterName: inviter?.name ?? null,
        };
      })
    );
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invitation) return null;

    const org = await ctx.db.get(invitation.organizationId);
    const inviter = await ctx.db.get(invitation.invitedBy);

    return {
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
      orgName: org?.name ?? null,
      inviterName: inviter?.name ?? null,
    };
  },
});

// Invitations stay in Convex DB for seat limit checks and auth flow
export const create = action({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    role: orgRoleValidator,
  },
  handler: async (ctx, args) => {
    const created = await ctx.runMutation(
      internal.invitations._createInternal,
      {
        organizationId: args.organizationId,
        email: args.email,
        role: args.role,
      },
    );

    // Mirror to Supabase so the team-settings page (which reads from
    // Supabase) sees the new pending invitation immediately.
    try {
      const db = createSupabaseDb();
      await db.insert("invitations", {
        _id: created.invitationId,
        organizationId: args.organizationId,
        email: created.email,
        role: created.role,
        token: created.token,
        status: created.status,
        invitedBy: created.invitedBy,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.create] Supabase mirror failed:", e);
    }

    return created.invitationId;
  },
});

export const _createInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    email: v.string(),
    role: orgRoleValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);

    // Check seat limit before creating invitation
    const { canAddMore, currentSeats, seatLimit } = await checkSeatLimit(ctx, {
      organizationId: args.organizationId,
    });
    if (!canAddMore) {
      throw new Error(
        `Seat limit reached (${currentSeats}/${seatLimit}). Upgrade your plan to add more team members.`
      );
    }

    // Check no existing pending invitation for same email+org
    const existingInvitation = await ctx.db
      .query("invitations")
      .withIndex("by_email", (q) =>
        q.eq("email", args.email).eq("organizationId", args.organizationId)
      )
      .collect();
    const hasPending = existingInvitation.some((inv) => inv.status === "pending");
    if (hasPending) {
      throw new Error("A pending invitation already exists for this email");
    }

    // Check user isn't already a member
    const existingUser = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
    if (existingUser) {
      const membership = await ctx.db
        .query("teamMemberships")
        .withIndex("by_orgAndUser", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", existingUser._id)
        )
        .unique();
      if (membership) {
        throw new Error("User is already a member of this organization");
      }
    }

    const token = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;

    const invitationId = await ctx.db.insert("invitations", {
      organizationId: args.organizationId,
      email: args.email,
      role: args.role,
      token,
      status: "pending",
      invitedBy: user._id,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "organization",
      entityId: args.organizationId,
      action: "assigned",
      description: `Invited ${args.email} with role "${args.role}"`,
      performedBy: user._id,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: user._id,
      action: "member_invited",
      entityType: "invitation",
      entityId: invitationId,
      details: JSON.stringify({ email: args.email, role: args.role }),
    });

    return {
      invitationId: String(invitationId),
      email: args.email,
      role: args.role,
      token,
      status: "pending" as const,
      invitedBy: String(user._id),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    };
  },
});

// Accept needs seat limit check + creates teamMembership (auth table) — stays in Convex DB
export const accept = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const orgId = await ctx.runMutation(
      internal.invitations._acceptInternal,
      { token: args.token },
    );
    return orgId;
  },
});

export const _acceptInternal = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invitation) throw new Error("Invitation not found");
    if (invitation.status !== "pending") throw new Error("Invitation is no longer pending");
    if (invitation.expiresAt <= Date.now()) throw new Error("Invitation has expired");
    if (user.email !== invitation.email) {
      throw new Error("This invitation was sent to a different email address");
    }

    // Check seat limit at acceptance time
    const { canAddMore, currentSeats, seatLimit } = await checkSeatLimit(ctx, {
      organizationId: invitation.organizationId,
    });
    if (!canAddMore) {
      throw new Error(
        `Seat limit reached (${currentSeats}/${seatLimit}). The organization needs to upgrade their plan.`
      );
    }

    await ctx.db.insert("teamMemberships", {
      userId: user._id,
      organizationId: invitation.organizationId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      joinedAt: Date.now(),
    });

    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: invitation.organizationId,
      entityType: "organization",
      entityId: invitation.organizationId,
      action: "assigned",
      description: `${user.email} accepted invitation and joined as "${invitation.role}"`,
      performedBy: user._id,
    });

    await logAudit(ctx, {
      organizationId: invitation.organizationId,
      userId: user._id,
      action: "member_joined",
      entityType: "invitation",
      entityId: invitation._id,
      details: JSON.stringify({ email: user.email }),
    });

    // Notify org owner
    const org = await ctx.db.get(invitation.organizationId);
    if (org && org.ownerId !== user._id) {
      await createNotificationDirect(ctx, {
        organizationId: invitation.organizationId,
        userId: org.ownerId,
        type: "member_joined",
        title: "New team member",
        message: `${user.name ?? user.email ?? "A user"} joined your organization as "${invitation.role}"`,
      });
    }

    return String(invitation.organizationId);
  },
});

export const decline = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.invitations._declineInternal, { token: args.token });
  },
});

export const _declineInternal = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const invitation = await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invitation) throw new Error("Invitation not found");
    if (invitation.status !== "pending") throw new Error("Invitation is no longer pending");

    await ctx.db.patch(invitation._id, {
      status: "declined",
      updatedAt: Date.now(),
    });
  },
});

export const cancel = action({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.invitations._cancelInternal, {
      organizationId: args.organizationId,
      invitationId: args.invitationId as any,
    });

    // Mirror status change to Supabase so the team page (which reads
    // pending invitations from Supabase) updates.
    try {
      const db = createSupabaseDb();
      await db.patch("invitations", args.invitationId, {
        status: "expired",
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error("[invitations.cancel] Supabase mirror failed:", e);
    }
  },
});

export const _cancelInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.organizationId !== args.organizationId) {
      throw new Error("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending");
    }

    await ctx.db.patch(args.invitationId, {
      status: "expired",
      updatedAt: Date.now(),
    });
  },
});

export const resend = action({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const updated = await ctx.runMutation(internal.invitations._resendInternal, {
      organizationId: args.organizationId,
      invitationId: args.invitationId as any,
    });

    // Mirror new expiry to Supabase so any consumer reading from there
    // sees the refreshed expiresAt.
    try {
      const db = createSupabaseDb();
      await db.patch("invitations", args.invitationId, {
        expiresAt: updated.expiresAt,
        updatedAt: updated.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.resend] Supabase mirror failed:", e);
    }

    return args.invitationId;
  },
});

export const _resendInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.id("invitations"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.organizationId !== args.organizationId) {
      throw new Error("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending");
    }

    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const updatedAt = Date.now();
    await ctx.db.patch(args.invitationId, { expiresAt, updatedAt });

    return { expiresAt, updatedAt };
  },
});
