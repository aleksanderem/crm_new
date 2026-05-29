import { query, action, internalMutation, internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin, requireUser } from "./_helpers/auth";
import { checkSeatLimit } from "./_helpers/seatLimits";
import { orgRoleValidator } from "@cvx/schema";
import { logActivity } from "./_helpers/activities";
import { logAudit } from "./auditLog";
import { createNotificationDirect } from "./notifications";
import {
  sendInvitationEmail,
  renderInvitationEmail,
  buildInvitationSubject,
} from "./email/templates/invitationEmail";
import { sendViaResend, sendViaMailgun } from "./email/providers";

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
  handler: async (ctx, args): Promise<string> => {
    const created: {
      invitationId: string;
      email: string;
      role: "admin" | "member" | "viewer" | "owner";
      token: string;
      status: "pending";
      invitedBy: string;
      expiresAt: number;
      createdAt: number;
      updatedAt: number;
    } = await ctx.runMutation(internal.invitations._createInternal, {
      organizationId: args.organizationId,
      email: args.email,
      role: args.role,
    });

    // Mirror to Supabase so the team-settings page (which reads from
    // Supabase via useSupabasePendingInvitations) sees the new pending
    // invitation immediately. Matches the pattern used by organizations.create.
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

    // Send the invitation email out-of-band. Failure here must NOT roll back
    // the invitation — the row already exists; the user can use "Resend" to
    // retry. The send is delegated to an internalAction so the user-facing
    // create() response isn't blocked by Resend latency.
    await ctx.scheduler.runAfter(0, internal.invitations._sendInvitationEmail, {
      invitationId: created.invitationId,
      email: created.email,
      role: created.role,
      token: created.token,
      organizationId: args.organizationId,
      inviterUserId: created.invitedBy,
    });

    return created.invitationId;
  },
});

// Internal action: render + send the invitation email via Resend.
// Loads orgName / inviterName from the DB so the user-facing create() doesn't
// need to round-trip these via the scheduler payload.
export const _sendInvitationEmail = internalAction({
  args: {
    invitationId: v.string(),
    email: v.string(),
    role: v.string(),
    token: v.string(),
    organizationId: v.id("organizations"),
    inviterUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const [ctxInfo, platformSettings] = await Promise.all([
      ctx.runQuery(internal.invitations._getEmailContext, {
        organizationId: args.organizationId,
        inviterUserId: args.inviterUserId,
      }),
      ctx.runQuery(internal.platformSettings._getInternal, {}),
    ]);

    const fromName = platformSettings?.invitationFromName;
    const fromEmail = platformSettings?.invitationFromEmail;
    const replyTo = platformSettings?.invitationReplyToEmail;
    const from =
      fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail || undefined;

    try {
      const provider = platformSettings?.provider;
      // Resend with admin-provided API key (overrides env)
      if (provider === "resend" && platformSettings?.resendApiKey) {
        if (!from) {
          throw new Error(
            "Provider 'resend' requires invitationFromEmail to be set in /admin/email-config",
          );
        }
        const html = renderInvitationEmail({
          email: args.email,
          orgName: ctxInfo.orgName,
          inviterName: ctxInfo.inviterName,
          role: args.role,
          token: args.token,
        });
        await sendViaResend(
          {
            to: args.email,
            subject: buildInvitationSubject(ctxInfo.orgName),
            html,
            from,
            replyTo,
          },
          { apiKey: platformSettings.resendApiKey },
        );
      } else if (
        provider === "mailgun" &&
        platformSettings?.mailgunApiKey &&
        platformSettings?.mailgunDomain
      ) {
        if (!from) {
          throw new Error(
            "Provider 'mailgun' requires invitationFromEmail to be set in /admin/email-config",
          );
        }
        const html = renderInvitationEmail({
          email: args.email,
          orgName: ctxInfo.orgName,
          inviterName: ctxInfo.inviterName,
          role: args.role,
          token: args.token,
        });
        await sendViaMailgun(
          {
            to: args.email,
            subject: buildInvitationSubject(ctxInfo.orgName),
            html,
            from,
            replyTo,
          },
          {
            apiKey: platformSettings.mailgunApiKey,
            domain: platformSettings.mailgunDomain,
            region: platformSettings.mailgunRegion ?? "us",
          },
        );
      } else {
        // Fallback: env-based Resend (AUTH_RESEND_KEY + AUTH_EMAIL) — same
        // behavior as before any platform provider was configured.
        await sendInvitationEmail({
          email: args.email,
          orgName: ctxInfo.orgName,
          inviterName: ctxInfo.inviterName,
          role: args.role,
          token: args.token,
          fromName,
          fromEmail,
          replyTo,
        });
      }
    } catch (e) {
      console.error(
        `[invitations._sendInvitationEmail] failed for ${args.email} (invitation ${args.invitationId}):`,
        e,
      );
      // Swallow — invitation row exists, user can resend.
    }
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
  handler: async (ctx, args): Promise<string> => {
    const result: {
      organizationId: string;
      invitationId: string;
      acceptedAt: number;
      updatedAt: number;
    } = await ctx.runMutation(
      internal.invitations._acceptInternal,
      { token: args.token },
    );

    // Mirror status change to Supabase so any consumer reading invitations
    // from there (e.g. team-settings page) sees the accepted state.
    try {
      const db = createSupabaseDb();
      await db.patch("invitations", result.invitationId, {
        status: "accepted",
        acceptedAt: result.acceptedAt,
        updatedAt: result.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.accept] Supabase mirror failed:", e);
    }

    return result.organizationId;
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

    const joinedAt = Date.now();
    const membershipId = await ctx.db.insert("teamMemberships", {
      userId: user._id,
      organizationId: invitation.organizationId,
      role: invitation.role,
      invitedBy: invitation.invitedBy,
      joinedAt,
    });

    // Mirror to Supabase so the team-settings page (which reads members
    // via useSupabaseOrganizationMembers) and the RBAC bridge (which
    // also reads team_memberships from Supabase) both see the new
    // membership. Without this, an invited admin/member has a row in
    // Convex teamMemberships but is invisible to the UI's permission
    // checks — UI shows empty / 403 on protected actions.
    await ctx.scheduler.runAfter(
      0,
      internal.supabase.organizations.writeTeamMembershipToSupabase,
      {
        membershipId: String(membershipId),
        userId: String(user._id),
        organizationId: String(invitation.organizationId),
        role: invitation.role,
        invitedBy: String(invitation.invitedBy),
        joinedAt,
      },
    );

    // If the invitee just signed up via OTP and has no username yet, derive
    // one from the email local-part so they skip the /onboarding/username
    // screen entirely. The validator there is strict alphanumeric — an
    // address like "john.doe@x.com" would fail it, leaving the invitee
    // stuck. Slug derivation downstream tolerates anything (already strips
    // non-[a-z0-9-]).
    if (!user.username) {
      const local = (user.email ?? invitation.email).split("@")[0] ?? "";
      const base = local.toLowerCase().replace(/[^a-z0-9]/g, "");
      // Guarantee min length and uniqueness — collisions are non-fatal here
      // (the field is informational; org membership is what matters), but
      // we still prefer not to clash with an existing username.
      let candidate = (base || "user").slice(0, 16);
      let suffix = 0;
      // Cheap collision walk — schema doesn't have a unique constraint on
      // `username`, but other code uses it for org slug, so a unique-ish
      // value is friendlier.
      while (
        await ctx.db
          .query("users")
          .filter((q) => q.eq(q.field("username"), candidate))
          .first()
      ) {
        suffix += 1;
        candidate = `${(base || "user").slice(0, 14)}${suffix}`;
        if (suffix > 50) break; // give up; informational only
      }
      await ctx.db.patch(user._id, { username: candidate });
    }

    // Mirror the invitee's user row to Supabase. Without this, any
    // downstream FK reference (gabinet_employees.user_id, team_memberships
    // mirror that happens just above, etc.) hits `code=23503` on the first
    // assignment after signup.
    await ctx.scheduler.runAfter(0, internal.supabase.users.writeUserToSupabase, {
      userId: String(user._id),
      email: user.email,
      name: user.name,
      username: user.username,
      image: user.image,
      imageStorageId: user.imageId ? String(user.imageId) : undefined,
      phone: user.phone,
      isAnonymous: user.isAnonymous,
      customerId: user.customerId,
      language: user.language,
      theme: user.theme,
      timezone: user.timezone,
      createdAt: Math.floor(user._creationTime),
      updatedAt: Date.now(),
    });

    const acceptedAt = Date.now();
    const updatedAt = acceptedAt;
    await ctx.db.patch(invitation._id, {
      status: "accepted",
      acceptedAt,
      updatedAt,
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

    return {
      organizationId: String(invitation.organizationId),
      invitationId: String(invitation._id),
      acceptedAt,
      updatedAt,
    };
  },
});

export const decline = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const result: { invitationId: string; updatedAt: number } = await ctx.runMutation(
      internal.invitations._declineInternal,
      { token: args.token },
    );

    // Mirror status change to Supabase so any consumer reading invitations
    // from there sees the declined state.
    try {
      const db = createSupabaseDb();
      await db.patch("invitations", result.invitationId, {
        status: "declined",
        updatedAt: result.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.decline] Supabase mirror failed:", e);
    }
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

    const updatedAt = Date.now();
    await ctx.db.patch(invitation._id, {
      status: "declined",
      updatedAt,
    });

    return {
      invitationId: String(invitation._id),
      updatedAt,
    };
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
    const updated: {
      expiresAt: number;
      updatedAt: number;
      email: string;
      role: "admin" | "member" | "viewer" | "owner";
      token: string;
      invitedBy: string;
    } = await ctx.runMutation(internal.invitations._resendInternal, {
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

    // Re-send the invitation email with the refreshed expiry.
    await ctx.scheduler.runAfter(0, internal.invitations._sendInvitationEmail, {
      invitationId: args.invitationId,
      email: updated.email,
      role: updated.role,
      token: updated.token,
      organizationId: args.organizationId,
      inviterUserId: updated.invitedBy,
    });

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

    return {
      expiresAt,
      updatedAt,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token,
      invitedBy: String(invitation.invitedBy),
    };
  },
});

// Update the role of a PENDING invitation in place. Org-admin only. Useful
// when the inviter picked the wrong role and doesn't want to cancel +
// re-send (which would invalidate the link the invitee already received).
export const updatePendingRole = action({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.string(),
    role: orgRoleValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    const updated: {
      invitationId: string;
      role: "admin" | "member" | "viewer" | "owner";
      updatedAt: number;
    } = await ctx.runMutation(internal.invitations._updatePendingRoleInternal, {
      organizationId: args.organizationId,
      invitationId: args.invitationId as Id<"invitations">,
      role: args.role,
    });

    // Mirror to Supabase so the team-settings page reflects the new role.
    try {
      const db = createSupabaseDb();
      await db.patch("invitations", updated.invitationId, {
        role: updated.role,
        updatedAt: updated.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.updatePendingRole] Supabase mirror failed:", e);
    }

    return updated.invitationId;
  },
});

export const _updatePendingRoleInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    invitationId: v.id("invitations"),
    role: orgRoleValidator,
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const inv = await ctx.db.get(args.invitationId);
    if (!inv || inv.organizationId !== args.organizationId) {
      throw new Error("Invitation not found");
    }
    if (inv.status !== "pending") {
      throw new Error("Only pending invitations can have their role changed");
    }
    if (args.role === "owner") {
      // Ownership transfer is a separate flow — never grant via plain invite.
      throw new Error("Cannot assign owner role via invitation");
    }
    const updatedAt = Date.now();
    await ctx.db.patch(args.invitationId, { role: args.role, updatedAt });
    return {
      invitationId: String(args.invitationId),
      role: args.role,
      updatedAt,
    };
  },
});

// Admin tool — bumps expiry on a pending invitation and re-sends the email,
// bypassing the org-admin auth guard so it can be invoked from `npx convex run`.
// Useful when an env-level fix (e.g. broken SITE_URL) made an earlier email
// unusable and the invitation needs to go out fresh.
export const _adminResendAndSend = internalAction({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    // Explicit type annotation breaks a circular type inference TS hits when
    // the resolved runMutation result type indirectly references this very
    // export (TS7022/TS7023).
    const r: {
      invitationId: string;
      email: string;
      role: "admin" | "member" | "viewer" | "owner";
      token: string;
      organizationId: Id<"organizations">;
      invitedBy: string;
      expiresAt: number;
      updatedAt: number;
    } = await ctx.runMutation(internal.invitations._adminResendInternal, {
      invitationId: args.invitationId,
    });
    await ctx.scheduler.runAfter(0, internal.invitations._sendInvitationEmail, {
      invitationId: r.invitationId,
      email: r.email,
      role: r.role,
      token: r.token,
      organizationId: r.organizationId,
      inviterUserId: r.invitedBy,
    });
    return { ok: true as const, ...r };
  },
});

export const _adminResendInternal = internalMutation({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invitationId);
    if (!inv) throw new Error("Invitation not found");
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const updatedAt = Date.now();
    // Also flip back to pending in case it had been marked expired/declined
    await ctx.db.patch(args.invitationId, {
      status: "pending",
      expiresAt,
      updatedAt,
    });
    return {
      invitationId: String(args.invitationId),
      email: inv.email,
      role: inv.role,
      token: inv.token,
      organizationId: inv.organizationId,
      invitedBy: String(inv.invitedBy),
      expiresAt,
      updatedAt,
    };
  },
});

// Lightweight internal query used by _sendInvitationEmail to load the bits of
// context that the email template needs (org name, inviter name) without
// re-fetching from a Node action.
export const _getEmailContext = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    inviterUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    const inviter = await ctx.db.get(args.inviterUserId as Id<"users">);
    return {
      orgName: org?.name ?? "your team",
      inviterName: inviter?.name ?? inviter?.email ?? "A teammate",
    };
  },
});
