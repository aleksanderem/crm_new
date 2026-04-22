/**
 * Convex → Supabase Organization & TeamMembership Dual-Write Actions
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
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

    const data = await upsertWithFkRetry(client, "organizations", row);

    console.info(`Organization written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateOrganizationInSupabase = internalAction({
  args: {
    organizationId: v.string(),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row: Record<string, unknown> = { updated_at: args.updatedAt };
    if (args.name !== undefined) row.name = args.name;
    if (args.slug !== undefined) row.slug = args.slug;
    if (args.logo !== undefined) row.logo = args.logo;
    if (args.website !== undefined) row.website = args.website;

    const { data, error } = await client
      .from("organizations")
      .update(row)
      .eq("id", args.organizationId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for organization ${args.organizationId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`Organization updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

// ── Team Membership ───────────────────────────────────────────────────────────

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

    const data = await upsertWithFkRetry(client, "team_memberships", row);

    console.info(`TeamMembership written to Supabase id=${data.id}`);
    return { success: true, id: data.id };
  },
});

export const updateTeamMembershipInSupabase = internalAction({
  args: {
    membershipId: v.string(),
    role: v.optional(v.string()),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();
    const row: Record<string, unknown> = {};
    if (args.role !== undefined) row.role = args.role;

    const { data, error } = await client
      .from("team_memberships")
      .update(row)
      .eq("id", args.membershipId)
      .select("id")
      .single();

    if (error) {
      const msg = `Supabase update failed for teamMembership ${args.membershipId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`TeamMembership updated in Supabase id=${data!.id}`);
    return { success: true, id: data!.id };
  },
});

export const deleteTeamMembershipFromSupabase = internalAction({
  args: {
    membershipId: v.string(),
    organizationId: v.string(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const client = createServiceRoleClient();

    const { error } = await client
      .from("team_memberships")
      .delete()
      .eq("id", args.membershipId);

    if (error) {
      const msg = `Supabase delete failed for teamMembership ${args.membershipId}: ${error.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.info(`TeamMembership deleted from Supabase id=${args.membershipId}`);
    return { success: true, id: args.membershipId };
  },
});
