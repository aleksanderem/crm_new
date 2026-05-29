/**
 * Convex → Supabase User Dual-Write Actions
 *
 * Users live in Convex `users` (Convex Auth source of truth), but many
 * Supabase tables FK-reference `users.id`. Without mirroring, every
 * downstream insert that touches users (gabinet_employees, team_memberships,
 * etc.) hits FK violation `code=23503`.
 *
 * Mirrored on:
 *   - app.completeOnboarding (first time a user signs up + picks a username)
 *   - invitations._acceptInternal (invitee gets a row before any side effects)
 *   - Plus the backfill helper below for one-shot recovery.
 *
 * IMPORTANT: this module talks to Supabase via raw fetch to PostgREST instead
 * of @supabase/supabase-js. The realtime client that supabase-js initializes
 * eagerly broke under Convex's V8 + Node 20 runtime (no native WebSocket).
 * The fetch path doesn't need WebSocket and runs in the default V8 runtime.
 */

import { v } from "convex/values";
import { internalAction } from "@cvx/_generated/server";
import { internal } from "@cvx/_generated/api";
import {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from "@cvx/env";

const SUPABASE_HEADERS = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  } as Record<string, string>;
};

async function postgrestUpsert(table: string, row: Record<string, unknown>) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`,
    {
      method: "POST",
      headers: SUPABASE_HEADERS(),
      body: JSON.stringify([row]),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PostgREST upsert ${table} failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as Array<{ id: string }>;
  return data[0];
}

export const writeUserToSupabase = internalAction({
  args: {
    userId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    image: v.optional(v.string()),
    imageStorageId: v.optional(v.string()),
    phone: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    customerId: v.optional(v.string()),
    language: v.optional(v.string()),
    theme: v.optional(v.string()),
    timezone: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  returns: v.object({ success: v.boolean(), id: v.string() }),
  handler: async (_ctx, args) => {
    const row = {
      id: args.userId,
      email: args.email ?? null,
      name: args.name ?? null,
      username: args.username ?? null,
      image: args.image ?? null,
      image_storage_id: args.imageStorageId ?? null,
      phone: args.phone ?? null,
      is_anonymous: args.isAnonymous ?? null,
      customer_id: args.customerId ?? null,
      language: args.language ?? null,
      theme: args.theme ?? null,
      timezone: args.timezone ?? null,
      created_at: args.createdAt,
      updated_at: args.updatedAt,
    };
    const data = await postgrestUpsert("users", row);
    return { success: true, id: data.id };
  },
});

// One-shot backfill: mirror every Convex user into Supabase. Safe to re-run
// (PostgREST upsert with merge-duplicates).
export const _backfillAllUsersToSupabase = internalAction({
  args: {},
  returns: v.object({
    scanned: v.number(),
    mirrored: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx): Promise<{ scanned: number; mirrored: number; errors: number }> => {
    const users: Array<{
      _id: string;
      _creationTime: number;
      email?: string;
      name?: string;
      username?: string;
      image?: string;
      imageStorageId?: string;
      phone?: string;
      isAnonymous?: boolean;
      customerId?: string;
      language?: string;
      theme?: string;
      timezone?: string;
    }> = await ctx.runQuery(internal.supabase.usersHelpers._listAllUsers, {});
    let mirrored = 0;
    let errors = 0;
    const now = Date.now();
    for (const u of users) {
      try {
        await ctx.runAction(internal.supabase.users.writeUserToSupabase, {
          userId: u._id,
          email: u.email,
          name: u.name,
          username: u.username,
          image: u.image,
          imageStorageId: u.imageStorageId,
          phone: u.phone,
          isAnonymous: u.isAnonymous,
          customerId: u.customerId,
          language: u.language,
          theme: u.theme,
          timezone: u.timezone,
          createdAt: Math.floor(u._creationTime),
          updatedAt: now,
        });
        mirrored += 1;
      } catch (e) {
        console.error(`[backfill users] ${u._id} failed:`, e);
        errors += 1;
      }
    }
    return { scanned: users.length, mirrored, errors };
  },
});
