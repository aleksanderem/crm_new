import { v } from "convex/values";
import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

// UUID v4 pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Deletes gabinetLocationMemberships rows whose locationId is a Convex ID
// (not a UUID). These orphan rows were inserted during the dual-write era and
// are unreachable by permission lookups after the Supabase migration.
export const _purgeStaleConvexIdLocationMemberships = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ deleted: number; scanned: number }> => {
    const all = await ctx.db.query("gabinetLocationMemberships").collect();
    const stale = all.filter((row) => !UUID_REGEX.test(row.locationId));
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length, scanned: all.length };
  },
});

// Platform-admin action to purge stale Convex-ID rows from
// gabinetLocationMemberships. Safe to call multiple times (idempotent).
export const purgeStaleConvexIdLocationMemberships = action({
  args: {},
  returns: v.object({ deleted: v.number(), scanned: v.number() }),
  handler: async (ctx): Promise<{ deleted: number; scanned: number }> => {
    await ctx.runAction(internal._helpers.authAction.verifyPlatformAdmin, {});
    return ctx.runMutation(
      internal.admin.cleanup._purgeStaleConvexIdLocationMemberships,
      {},
    );
  },
});
