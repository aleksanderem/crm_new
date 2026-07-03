/**
 * Convex → Supabase Organization & TeamMembership Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction, internalQuery } from "@cvx/_generated/server";
import { internal } from "@cvx/_generated/api";
import { createServiceRoleClient, upsertWithFkRetry } from "./client";

// ── Organization ──────────────────────────────────────────────────────────────

export const writeOrganizationToSupabase = internalAction({
  args: {
    organizationId: v.string(),
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    onboardingCompleted: v.optional(v.boolean()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (ctx, args) => {
    const client = createServiceRoleClient();

    // Self-heal: writeUserToSupabase and writeOrganizationToSupabase are both
    // scheduled with runAfter(0) from completeOnboarding. If the org action
    // fires first the owner_id FK doesn't exist yet, and the immediate 3-retry
    // loop in upsertWithFkRetry has no delay to let it appear. Ensure the owner
    // user row is present before attempting the org upsert.
    const { data: existingUser } = await client
      .from("users")
      .select("id")
      .eq("id", args.ownerId)
      .maybeSingle();
    if (!existingUser) {
      const user = await ctx.runQuery(internal.supabase.backfill._getUser, {
        userId: args.ownerId,
      });
      if (user) {
        await client.from("users").upsert(
          {
            id: user._id,
            name: user.name ?? null,
            username: user.username ?? null,
            image_storage_id: user.imageId ?? null,
            image: user.image ?? null,
            email: user.email ?? null,
            email_verification_time: user.emailVerificationTime ?? null,
            phone: user.phone ?? null,
            phone_verification_time: user.phoneVerificationTime ?? null,
            is_anonymous: user.isAnonymous ?? false,
            customer_id: user.customerId ?? null,
            language: user.language ?? null,
            theme: user.theme ?? null,
            timezone: user.timezone ?? null,
            created_at: Math.floor(user._creationTime),
            updated_at: Math.floor(user._creationTime),
          },
          { onConflict: "id" },
        );
      }
    }

    const row = {
      id: args.organizationId,
      name: args.name,
      slug: args.slug,
      owner_id: args.ownerId,
      logo: args.logo ?? null,
      website: args.website ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
      onboarding_completed: args.onboardingCompleted ?? null,
    };

    const data = await upsertWithFkRetry(client, "organizations", row)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`supabaseDb.insert(organizations): ${msg}`);
      });

    console.info(`Organization written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

// ── Team Membership ───────────────────────────────────────────────────────────

// One-shot backfill: mirrors EVERY Convex teamMemberships row into Supabase.
// Safe to re-run — upsert semantics in writeTeamMembershipToSupabase. Used to
// recover from the historical gap when org.create / invitations._acceptInternal
// / organizations.addMember wrote to Convex only.
export const _backfillAllTeamMembershipsToSupabase = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    mirrored: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx): Promise<{ scanned: number; mirrored: number; errors: number }> => {
    const rows: Array<{
      _id: string;
      userId: string;
      organizationId: string;
      role: string;
      invitedBy?: string;
      joinedAt: number;
    }> = await ctx.runQuery(
      internal.supabase.organizations._listAllTeamMemberships,
      {},
    );
    let mirrored = 0;
    let errors = 0;
    for (const r of rows) {
      try {
        await ctx.runAction(
          internal.supabase.organizations.writeTeamMembershipToSupabase,
          {
            membershipId: r._id,
            userId: r.userId,
            organizationId: r.organizationId,
            role: r.role,
            invitedBy: r.invitedBy,
            joinedAt: r.joinedAt,
          },
        );
        mirrored += 1;
      } catch (e) {
        console.error(`[backfill teamMemberships] ${r._id} failed:`, e);
        errors += 1;
      }
    }
    return { scanned: rows.length, mirrored, errors };
  },
});

export const _listAllTeamMemberships = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.string(),
      userId: v.string(),
      organizationId: v.string(),
      role: v.string(),
      invitedBy: v.optional(v.string()),
      joinedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const all = await ctx.db.query("teamMemberships").collect();
    return all.map((r) => ({
      _id: String(r._id),
      userId: String(r.userId),
      organizationId: String(r.organizationId),
      role: r.role,
      invitedBy: r.invitedBy ? String(r.invitedBy) : undefined,
      joinedAt: r.joinedAt,
    }));
  },
});

export const deleteTeamMembershipFromSupabase = internalAction({
  args: { membershipId: v.string() },
  returns: v.null_(),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const { error } = await client
      .from("team_memberships")
      .delete()
      .eq("id", args.membershipId);
    if (error) {
      throw new Error(`supabaseDb.delete(team_memberships, ${args.membershipId}): ${error.message}`);
    }
    console.info(`TeamMembership deleted from Supabase id=${args.membershipId}`);
    return null;
  },
});

export const writeTeamMembershipToSupabase = internalAction({
  args: {
    membershipId: v.string(),
    userId: v.string(),
    organizationId: v.string(),
    role: v.string(),
    invitedBy: v.optional(v.string()),
    joinedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (ctx, args) => {
    const client = createServiceRoleClient();

    // Self-heal: writeUserToSupabase, writeOrganizationToSupabase, and
    // writeTeamMembershipToSupabase are all scheduled with runAfter(0) from
    // org.create / completeOnboarding / invitations._acceptInternal. If this
    // action fires first, either FK may not exist yet. Ensure both parent rows
    // are present before attempting the team_memberships upsert.
    const { data: existingUser } = await client
      .from("users")
      .select("id")
      .eq("id", args.userId)
      .maybeSingle();
    if (!existingUser) {
      const user = await ctx.runQuery(internal.supabase.backfill._getUser, {
        userId: args.userId,
      });
      if (user) {
        await client.from("users").upsert(
          {
            id: user._id,
            name: user.name ?? null,
            username: user.username ?? null,
            image_storage_id: user.imageId ?? null,
            image: user.image ?? null,
            email: user.email ?? null,
            email_verification_time: user.emailVerificationTime ?? null,
            phone: user.phone ?? null,
            phone_verification_time: user.phoneVerificationTime ?? null,
            is_anonymous: user.isAnonymous ?? false,
            customer_id: user.customerId ?? null,
            language: user.language ?? null,
            theme: user.theme ?? null,
            timezone: user.timezone ?? null,
            created_at: Math.floor(user._creationTime),
            updated_at: Math.floor(user._creationTime),
          },
          { onConflict: "id" },
        );
      }
    }

    const { data: existingOrg } = await client
      .from("organizations")
      .select("id")
      .eq("id", args.organizationId)
      .maybeSingle();
    if (!existingOrg) {
      const org = await ctx.runQuery(
        internal.supabase.backfill._getOrganization,
        { organizationId: args.organizationId },
      );
      if (org) {
        await client.from("organizations").upsert(
          {
            id: String(org._id),
            name: org.name,
            slug: org.slug,
            owner_id: String(org.ownerId),
            logo: org.logo ?? null,
            website: org.website ?? null,
            created_at: org.createdAt ?? Date.now(),
            updated_at: org.updatedAt ?? Date.now(),
          },
          { onConflict: "id" },
        );
      }
    }

    const row = {
      id: args.membershipId,
      user_id: args.userId,
      organization_id: args.organizationId,
      role: args.role,
      invited_by: args.invitedBy ?? null,
      joined_at: args.joinedAt,
    };

    const data = await upsertWithFkRetry(client, "team_memberships", row)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`supabaseDb.insert(team_memberships): ${msg}`);
      });

    console.info(`TeamMembership written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

