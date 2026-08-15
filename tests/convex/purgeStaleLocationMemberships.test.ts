import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function makePlatformAdmin(userId: string) {
  await createSupabaseDb().insert("users", {
    _id: userId,
    name: "Admin",
    email: `admin-${userId}@example.com`,
    isPlatformAdmin: true,
  });
}

describe("admin/cleanup.purgeStaleConvexIdLocationMemberships", () => {
  test("deletes rows with Convex IDs and keeps rows with UUID locationIds", async () => {
    const t = createTestCtx();
    const { userId, organizationId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    // Seed one stale row (Convex-style ID, no hyphens) and one valid row (UUID).
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("gabinetLocationMemberships", {
        organizationId: String(organizationId),
        userId,
        locationId: "k57abcdefghijklmnopqrstu",
        updatedAt: now,
      });
      await ctx.db.insert("gabinetLocationMemberships", {
        organizationId: String(organizationId),
        userId,
        locationId: "550e8400-e29b-41d4-a716-446655440000",
        updatedAt: now,
      });
    });

    const result = await t
      .withIdentity(identity)
      .action(api.admin.cleanup.purgeStaleConvexIdLocationMemberships, {});

    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(1);

    const remaining = await t.run((ctx) =>
      ctx.db.query("gabinetLocationMemberships").collect(),
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].locationId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  test("is idempotent — second call finds nothing to delete", async () => {
    const t = createTestCtx();
    const { userId, organizationId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetLocationMemberships", {
        organizationId: String(organizationId),
        userId,
        locationId: "j97staleconvexxidxnohuph",
        updatedAt: Date.now(),
      });
    });

    const first = await t
      .withIdentity(identity)
      .action(api.admin.cleanup.purgeStaleConvexIdLocationMemberships, {});
    expect(first.deleted).toBe(1);

    const second = await t
      .withIdentity(identity)
      .action(api.admin.cleanup.purgeStaleConvexIdLocationMemberships, {});
    expect(second.deleted).toBe(0);
    expect(second.scanned).toBe(0);
  });

  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { identity } = await seedTestUser(t);
    // NOT calling makePlatformAdmin — user is a regular org member

    await expect(
      t
        .withIdentity(identity)
        .action(api.admin.cleanup.purgeStaleConvexIdLocationMemberships, {}),
    ).rejects.toThrow(/platform admin/i);
  });
});
