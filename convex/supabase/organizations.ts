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
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
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
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
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

