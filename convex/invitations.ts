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
  args: { organizationId: v.string() },
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

export const create = action({
  args: {
    organizationId: v.string(),
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

    // Write invitation to Supabase (primary store — Convex no longer holds a copy).
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
      console.error("[invitations.create] Supabase write failed:", e);
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
    organizationId: v.string(),
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
    organizationId: v.string(),
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
    // Generate UUID here — invitation is written to Supabase by the parent
    // create action (primary store). ctx.db no longer holds a copy.
    const invitationId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000;

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
      invitationId,
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
      membershipId: string;
      membershipUserId: string;
      membershipJoinedAt: number;
      userEmail: string | undefined;
      userName: string | undefined;
      userUsername: string | undefined;
      userImage: string | undefined;
      userImageId: string | undefined;
      userPhone: string | undefined;
      userIsAnonymous: boolean | undefined;
      userCustomerId: string | undefined;
      userLanguage: string | undefined;
      userTheme: string | undefined;
      userTimezone: string | undefined;
      userCreatedAt: number;
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

    // Write invitation status to Supabase.
    try {
      await db.patch("invitations", result.invitationId, {
        status: "accepted",
        acceptedAt: result.acceptedAt,
        updatedAt: result.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.accept] Supabase invitation patch failed:", e);
    }

    // Write teamMembership to Supabase directly (primary store).
    // _acceptInternal already inserted to Convex for auth (requireOrgAdmin) compat.
    try {
      await db.insert("teamMemberships", {
        _id: result.membershipId,
        userId: result.membershipUserId,
        organizationId: String(invitation.organizationId),
        role: invitation.role,
        invitedBy: String(invitation.invitedBy),
        joinedAt: result.membershipJoinedAt,
      });
    } catch (e) {
      console.error("[invitations.accept] Supabase teamMembership write failed:", e);
    }

    // Mirror the invitee's user row to Supabase. Without this, downstream FK
    // references (gabinet_employees.user_id, team_memberships, etc.) hit code=23503.
    try {
      await ctx.runAction(internal.supabase.users.writeUserToSupabase, {
        userId: result.membershipUserId,
        email: result.userEmail,
        name: result.userName,
        username: result.userUsername,
        image: result.userImage,
        imageStorageId: result.userImageId,
        phone: result.userPhone,
        isAnonymous: result.userIsAnonymous,
        customerId: result.userCustomerId,
        language: result.userLanguage,
        theme: result.userTheme,
        timezone: result.userTimezone,
        createdAt: result.userCreatedAt,
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error("[invitations.accept] Supabase user write failed:", e);
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

    // Duplicate membership was already checked in the parent accept action
    // (Supabase read). Insert directly to Convex — required for requireOrgAdmin
    // (QueryCtx / MutationCtx cannot make HTTP calls, so teamMemberships must
    // exist in Convex for auth checks to pass in subsequent mutations).
    const membershipId = await ctx.db.insert("teamMemberships", {
      userId: user._id,
      organizationId: orgId,
      role: args.invitationRole,
      invitedBy: invitedById,
      joinedAt,
    });

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

    // User row is mirrored to Supabase by the parent accept action after this
    // mutation returns, so downstream FKs (gabinet_employees.user_id, etc.) resolve.

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
    // Invitation status is patched in Supabase by the parent accept action.
    // No ctx.db.patch needed — invitation is no longer stored in Convex.

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
      membershipId: String(membershipId),
      membershipUserId: String(user._id),
      membershipJoinedAt: joinedAt,
      userEmail: user.email,
      userName: user.name,
      userUsername: effectiveUsername,
      userImage: user.image,
      userImageId: user.imageId ? String(user.imageId) : undefined,
      userPhone: user.phone,
      userIsAnonymous: user.isAnonymous,
      userCustomerId: user.customerId,
      userLanguage: user.language,
      userTheme: user.theme,
      userTimezone: user.timezone,
      userCreatedAt: Math.floor(user._creationTime),
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
      {},
    );

    // Patch invitation status in Supabase (primary store).
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
  args: {},
  handler: async (ctx, _args) => {
    await requireUser(ctx);
    // Invitation status is patched in Supabase by the parent decline action.
    // No ctx.db.patch needed — invitation is no longer stored in Convex.
    return Date.now();
  },
});

export const cancel = action({
  args: {
    organizationId: v.string(),
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Read and validate invitation from Supabase (primary store).
    const invitation = await db.get("invitations", args.invitationId);
    if (!invitation || String(invitation.organizationId) !== String(args.organizationId)) {
      throw new Error("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending");
    }

    // Auth check via internalMutation (requires MutationCtx for requireOrgAdmin).
    await ctx.runMutation(internal.invitations._cancelInternal, {
      organizationId: args.organizationId,
    });

    // Patch invitation status in Supabase (primary store).
    try {
      await db.patch("invitations", args.invitationId, {
        status: "expired",
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.error("[invitations.cancel] Supabase patch failed:", e);
    }
  },
});

export const _cancelInternal = internalMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    // Invitation read and status patch are handled by the parent cancel action
    // via Supabase. Invitation is no longer stored in Convex.
  },
});

export const resend = action({
  args: {
    organizationId: v.string(),
    invitationId: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Read and validate invitation from Supabase (primary store).
    const invitation = await db.get("invitations", args.invitationId);
    if (!invitation || String(invitation.organizationId) !== String(args.organizationId)) {
      throw new Error("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new Error("Invitation is no longer pending");
    }

    // Auth check + generate new expiry via internalMutation.
    const updated: { expiresAt: number; updatedAt: number } = await ctx.runMutation(
      internal.invitations._resendInternal,
      { organizationId: args.organizationId },
    );

    // Patch invitation with new expiry in Supabase (primary store).
    try {
      await db.patch("invitations", args.invitationId, {
        expiresAt: updated.expiresAt,
        updatedAt: updated.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.resend] Supabase patch failed:", e);
    }

    // Re-send the invitation email with the refreshed expiry.
    await ctx.scheduler.runAfter(0, internal.invitations._sendInvitationEmail, {
      invitationId: args.invitationId,
      email: String(invitation.email),
      role: String(invitation.role),
      token: String(invitation.token),
      organizationId: args.organizationId,
      inviterUserId: String(invitation.invitedBy),
    });

    return args.invitationId;
  },
});

export const _resendInternal = internalMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    // Invitation read and expiry patch are handled by the parent resend action
    // via Supabase. Invitation is no longer stored in Convex.
    return {
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      updatedAt: Date.now(),
    };
  },
});

// Update the role of a PENDING invitation in place. Org-admin only. Useful
// when the inviter picked the wrong role and doesn't want to cancel +
// re-send (which would invalidate the link the invitee already received).
export const updatePendingRole = action({
  args: {
    organizationId: v.string(),
    invitationId: v.string(),
    role: orgRoleValidator,
  },
  handler: async (ctx, args): Promise<string> => {
    const db = createSupabaseDb();

    // Read and validate invitation from Supabase (primary store).
    const invitation = await db.get("invitations", args.invitationId);
    if (!invitation || String(invitation.organizationId) !== String(args.organizationId)) {
      throw new Error("Invitation not found");
    }
    if (invitation.status !== "pending") {
      throw new Error("Only pending invitations can have their role changed");
    }
    if (args.role === "owner") {
      throw new Error("Cannot assign owner role via invitation");
    }

    // Auth check via internalMutation (requires MutationCtx for requireOrgAdmin).
    const updated: { updatedAt: number } = await ctx.runMutation(
      internal.invitations._updatePendingRoleInternal,
      {
        organizationId: args.organizationId,
      },
    );

    // Patch invitation with new role in Supabase (primary store).
    try {
      await db.patch("invitations", args.invitationId, {
        role: args.role,
        updatedAt: updated.updatedAt,
      });
    } catch (e) {
      console.error("[invitations.updatePendingRole] Supabase patch failed:", e);
    }

    return args.invitationId;
  },
});

export const _updatePendingRoleInternal = internalMutation({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    // Invitation read, validation, and role patch are handled by the parent
    // updatePendingRole action via Supabase. Invitation is no longer in Convex.
    return { updatedAt: Date.now() };
  },
});

// Admin tool — bumps expiry on a pending invitation and re-sends the email,
// bypassing the org-admin auth guard so it can be invoked from `npx convex run`.
// Useful when an env-level fix (e.g. broken SITE_URL) made an earlier email
// unusable and the invitation needs to go out fresh.
export const _adminResendAndSend = internalAction({
  args: { invitationId: v.id("invitations") },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Read invitation from Supabase (primary store — no longer in Convex).
    const inv = await db.get("invitations", String(args.invitationId));
    if (!inv) throw new Error("Invitation not found");

    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const updatedAt = Date.now();

    // Also flip back to pending in case it had been marked expired/declined
    await db.patch("invitations", String(args.invitationId), {
      status: "pending",
      expiresAt,
      updatedAt,
    });

    await ctx.scheduler.runAfter(0, internal.invitations._sendInvitationEmail, {
      invitationId: String(args.invitationId),
      email: String(inv.email),
      role: String(inv.role),
      token: String(inv.token),
      organizationId: inv.organizationId as Id<"organizations">,
      inviterUserId: String(inv.invitedBy),
    });

    return {
      ok: true as const,
      invitationId: String(args.invitationId),
      email: String(inv.email),
      role: String(inv.role),
      token: String(inv.token),
      organizationId: inv.organizationId as Id<"organizations">,
      invitedBy: String(inv.invitedBy),
      expiresAt,
      updatedAt,
    };
  },
});
