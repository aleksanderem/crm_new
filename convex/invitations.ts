import { action, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { requireOrgAdmin, requireUser } from "./_helpers/auth";
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

export const listPending = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    const pending = await db
      .query("invitations")
      .eq("organizationId", orgIdStr)
      .eq("status", "pending")
      .collect();

    if (pending.length === 0) return [];

    const inviterIds = [...new Set(pending.map((inv) => String(inv.invitedBy)))];
    const inviters = await db.getMany("users", inviterIds);
    const inviterMap = new Map(inviters.map((u) => [String(u._id), u.name ?? null]));

    return pending.map((inv) => ({
      ...inv,
      inviterName: inviterMap.get(String(inv.invitedBy)) ?? null,
    }));
  },
});

export const getByToken = action({
  args: { token: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    const invitation = await db
      .query("invitations")
      .eq("token", args.token)
      .unique();

    if (!invitation) return null;

    const [org, inviter] = await Promise.all([
      db.get("organizations", String(invitation.organizationId)),
      db.get("users", String(invitation.invitedBy)),
    ]);

    return {
      invitation: {
        _id: String(invitation._id),
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        module: invitation.module ?? null,
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
    // Optional module provisioning. module="gabinet" + moduleData triggers
    // auto-create of gabinet_employees row when the invitee accepts.
    module: v.optional(v.string()),
    moduleData: v.optional(v.any()),
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

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Validate before creating: check for duplicate pending invitation and
    // existing membership. Both reads go to Supabase — _createInternal is an
    // internalMutation that cannot use HTTP, so we front-load them here.
    const existingInvitations = await db
      .query("invitations")
      .eq("organizationId", orgIdStr)
      .eq("email", args.email)
      .collect();
    if (existingInvitations.some((inv) => inv.status === "pending")) {
      throw new Error("A pending invitation already exists for this email");
    }
    const existingUser = await db.query("users").eq("email", args.email).first();
    if (existingUser) {
      const membership = await db
        .query("teamMemberships")
        .eq("organizationId", orgIdStr)
        .eq("userId", String(existingUser._id))
        .first();
      if (membership) {
        throw new Error("User is already a member of this organization");
      }
    }

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
      module?: string;
      moduleData?: unknown;
    } = await ctx.runMutation(internal.invitations._createInternal, {
      organizationId: args.organizationId,
      email: args.email,
      role: args.role,
      module: args.module,
      moduleData: args.moduleData,
    });

    // Mirror to Supabase so the team-settings page (which reads from
    // Supabase via useSupabasePendingInvitations) sees the new pending
    // invitation immediately. Matches the pattern used by organizations.create.
    try {
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
        module: created.module ?? null,
        moduleData: created.moduleData ?? null,
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
    const supabase = createSupabaseDb();
    const [org, inviter, platformSettings] = await Promise.all([
      supabase.get("organizations", args.organizationId),
      supabase.get("users", args.inviterUserId),
      ctx.runQuery(internal.platformSettings._getInternal, {}),
    ]);
    const ctxInfo = {
      orgName: org?.name ?? "your team",
      inviterName: inviter?.name ?? inviter?.email ?? "A teammate",
    };

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
    module: v.optional(v.string()),
    moduleData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);

    // Duplicate and membership checks are performed in the parent create action
    // (Supabase reads) before this mutation is called.

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
      module: args.module,
      moduleData: args.moduleData,
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
      module: args.module,
      moduleData: args.moduleData,
    };
  },
});

// Accept needs seat limit check + creates teamMembership (auth table) — stays in Convex DB
export const accept = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<string> => {
    const db = createSupabaseDb();

    // Look up and validate the invitation in Supabase so _acceptInternal
    // (an internalMutation) doesn't need ctx.db.query on the invitations table.
    const invitation = await db
      .query("invitations")
      .eq("token", args.token)
      .unique();

    if (!invitation) throw new Error("Invitation not found");
    if (invitation.status !== "pending") throw new Error("Invitation is no longer pending");
    if (invitation.expiresAt <= Date.now()) throw new Error("Invitation has expired");

    // Accepting converts a pending slot to a member slot (net zero change),
    // so we skip pending invitations in the count.
    const { canAddMore, currentSeats, seatLimit } = await ctx.runAction(
      internal._helpers.seatLimits.checkSeatLimitAction,
      { organizationId: invitation.organizationId, skipPendingInvitations: true },
    );
    if (!canAddMore) {
      throw new Error(
        `Seat limit reached (${currentSeats}/${seatLimit}). The organization needs to upgrade their plan.`,
      );
    }

    // Early membership pre-check: if the invitee already has an account and is
    // already a member of this org, surface a user-friendly error before reaching
    // _acceptInternal — which would otherwise silently skip the insert.
    const inviteeUser = await db.query("users").eq("email", invitation.email).first();
    if (inviteeUser) {
      const existingMembership = await db
        .query("teamMemberships")
        .eq("organizationId", String(invitation.organizationId))
        .eq("userId", String(inviteeUser._id))
        .first();
      if (existingMembership) {
        throw new Error("You are already a member of this organization");
      }
    }

    // Read org owner from Supabase so _acceptInternal (a mutation) doesn't need ctx.db.get on organizations
    const org = await db.get("organizations", String(invitation.organizationId));
    const orgOwnerId = org?.ownerId ? String(org.ownerId) : undefined;

    const result: {
      organizationId: string;
      invitationId: string;
      acceptedAt: number;
      updatedAt: number;
    } = await ctx.runMutation(
      internal.invitations._acceptInternal,
      {
        orgOwnerId,
        invitationId: String(invitation._id),
        invitationEmail: invitation.email,
        invitationOrgId: String(invitation.organizationId),
        invitationRole: invitation.role,
        invitationInvitedBy: String(invitation.invitedBy),
        invitationModule: invitation.module ?? undefined,
        invitationModuleData: invitation.moduleData ?? undefined,
      },
    );

    // Mirror status change to Supabase so any consumer reading invitations
    // from there (e.g. team-settings page) sees the accepted state.
    try {
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
  args: {
    orgOwnerId: v.optional(v.string()),
    // Invitation data pre-fetched from Supabase by the parent accept action.
    // internalMutations cannot make HTTP calls, so we receive these as args
    // instead of querying ctx.db on TABLE_MAP tables.
    invitationId: v.string(),
    invitationEmail: v.string(),
    invitationOrgId: v.string(),
    invitationRole: orgRoleValidator,
    invitationInvitedBy: v.string(),
    invitationModule: v.optional(v.string()),
    invitationModuleData: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    // Status and expiry were validated in the parent accept action.
    // Re-verify email match here — current user is only known inside the mutation.
    if (user.email !== args.invitationEmail) {
      throw new Error("This invitation was sent to a different email address");
    }

    const orgId = args.invitationOrgId as Id<"organizations">;
    const invitedById = args.invitationInvitedBy as Id<"users">;

    const joinedAt = Date.now();

    // Guard against duplicate membership — e.g. a user already linked to this
    // org via another path (password-employee creation, manual addMember) who
    // then accepts a still-pending invitation. Without this check,
    // ctx.db.insert creates a second Convex row and the Supabase mirror fails
    // silently because upsertWithFkRetry uses onConflict:"id" while Supabase
    // enforces a UNIQUE index on (organization_id, user_id).
    const existingMembership = await ctx.db
      .query("teamMemberships")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", orgId).eq("userId", user._id),
      )
      .first();

    if (!existingMembership) {
      const membershipId = await ctx.db.insert("teamMemberships", {
        userId: user._id,
        organizationId: orgId,
        role: args.invitationRole,
        invitedBy: invitedById,
        joinedAt,
      });

      // Mirror to Supabase so the team-settings page (which reads members
      // via useSupabaseOrganizationMembers) and the RBAC bridge (which
      // also reads team_memberships from Supabase) both see the new
      // membership. Without this, an invited admin/member has a row in
      // Convex teamMemberships but is invisible to the UI's permission
      // checks — UI shows empty / 403 on protected actions.
      await ctx.scheduler.runAfter(
        500, // delay so writeUserToSupabase lands first (avoids 23503 FK violation)
        internal.supabase.organizations.writeTeamMembershipToSupabase,
        {
          membershipId: String(membershipId),
          userId: String(user._id),
          organizationId: String(orgId),
          role: args.invitationRole,
          invitedBy: args.invitationInvitedBy,
          joinedAt,
        },
      );
    }

    // If the invitee just signed up via OTP and has no username yet, derive
    // one from the email local-part so they skip the /onboarding/username
    // screen entirely. The validator there is strict alphanumeric — an
    // address like "john.doe@x.com" would fail it, leaving the invitee
    // stuck. Slug derivation downstream tolerates anything (already strips
    // non-[a-z0-9-]). Collision check is omitted — the field is informational
    // and mutations cannot query Supabase (no HTTP in MutationCtx).
    let effectiveUsername = user.username;
    if (!user.username) {
      const local = (user.email ?? args.invitationEmail).split("@")[0] ?? "";
      const base = local.toLowerCase().replace(/[^a-z0-9]/g, "");
      const candidate = (base || "user").slice(0, 16);
      await ctx.db.patch(user._id, { username: candidate });
      effectiveUsername = candidate;
    }

    // Mirror the invitee's user row to Supabase. Without this, any
    // downstream FK reference (gabinet_employees.user_id, team_memberships
    // mirror that happens just above, etc.) hits `code=23503` on the first
    // assignment after signup.
    await ctx.scheduler.runAfter(0, internal.supabase.users.writeUserToSupabase, {
      userId: String(user._id),
      email: user.email,
      name: user.name,
      username: effectiveUsername,
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

    // Module provisioning: if the invite carried a module="gabinet" payload,
    // auto-create the gabinet_employees row using the data captured at invite
    // time. Runs AFTER the user mirror so the FK on gabinet_employees.user_id
    // resolves. Scheduled (not awaited) so any failure here doesn't roll back
    // the membership — the inviter can re-create the employee manually if
    // needed.
    if (args.invitationModule === "gabinet" && args.invitationModuleData) {
      await ctx.scheduler.runAfter(
        500, // small delay so the user mirror lands first
        internal.gabinet.employees._createFromInvitation,
        {
          organizationId: orgId,
          userId: String(user._id),
          invitedBy: args.invitationInvitedBy,
          data: args.invitationModuleData,
          email: args.invitationEmail,
        },
      );
    }

    const acceptedAt = Date.now();
    const updatedAt = acceptedAt;
    await ctx.db.patch(args.invitationId as Id<"invitations">, {
      status: "accepted",
      acceptedAt,
      updatedAt,
    });

    await logActivity(ctx, {
      organizationId: orgId,
      entityType: "organization",
      entityId: String(orgId),
      action: "assigned",
      description: `${user.email} accepted invitation and joined as "${args.invitationRole}"`,
      performedBy: user._id,
    });

    await logAudit(ctx, {
      organizationId: orgId,
      userId: user._id,
      action: "member_joined",
      entityType: "invitation",
      entityId: args.invitationId,
      details: JSON.stringify({ email: user.email }),
    });

    // Notify org owner using ownerId passed from the parent accept action (which read it from Supabase)
    if (args.orgOwnerId && args.orgOwnerId !== String(user._id)) {
      await createNotificationDirect(ctx, {
        organizationId: orgId,
        userId: args.orgOwnerId as Id<"users">,
        type: "member_joined",
        title: "New team member",
        message: `${user.name ?? user.email ?? "A user"} joined your organization as "${args.invitationRole}"`,
      });
    }

    return {
      organizationId: String(orgId),
      invitationId: args.invitationId,
      acceptedAt,
      updatedAt,
    };
  },
});

export const decline = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Validate invitation in Supabase so _declineInternal (an internalMutation)
    // doesn't need ctx.db.query on the invitations table.
    const invitation = await db.query("invitations").eq("token", args.token).unique();
    if (!invitation) throw new Error("Invitation not found");
    if (invitation.status !== "pending") throw new Error("Invitation is no longer pending");

    const updatedAt: number = await ctx.runMutation(
      internal.invitations._declineInternal,
      { invitationId: String(invitation._id) },
    );

    // Mirror status change to Supabase so any consumer reading invitations
    // from there sees the declined state.
    try {
      await db.patch("invitations", String(invitation._id), {
        status: "declined",
        updatedAt,
      });
    } catch (e) {
      console.error("[invitations.decline] Supabase mirror failed:", e);
    }
  },
});

export const _declineInternal = internalMutation({
  args: { invitationId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const updatedAt = Date.now();
    await ctx.db.patch(args.invitationId as Id<"invitations">, {
      status: "declined",
      updatedAt,
    });

    return updatedAt;
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
