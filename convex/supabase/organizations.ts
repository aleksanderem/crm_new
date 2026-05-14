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

