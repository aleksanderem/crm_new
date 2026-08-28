/**
 * SP3 Task 1 — getUserDetail action tests.
 *
 * Harness mirrors tests/convex/adminOrganizations.test.ts:
 *   createTestCtx() + seedTestUser() + in-memory Supabase inserts.
 */
import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makePlatformAdmin(userId: string) {
  await createSupabaseDb().insert("users", {
    _id: userId,
    name: "Admin",
    email: `admin-${userId}@example.com`,
    isPlatformAdmin: true,
  });
}

// ---------------------------------------------------------------------------
// getUserDetail tests
// ---------------------------------------------------------------------------

describe("admin/users.getUserDetail", () => {
  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    // Insert users row without isPlatformAdmin flag (or explicitly false).
    await createSupabaseDb().insert("users", {
      _id: String(userId),
      name: "Nobody",
      email: "nobody@example.com",
      isPlatformAdmin: false,
    });

    await expect(
      t.withIdentity(identity).action(api.admin.users.getUserDetail, {
        userId,
      }),
    ).rejects.toThrow(/platform admin/i);
  });

  test("admin gets target user metadata and membership with org name and role", async () => {
    const t = createTestCtx();

    // Caller = platform admin (seeded org is also used as target's org).
    const { organizationId, userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    // Seed a TARGET user in Convex db.
    const targetUserId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Target User",
        email: "target@example.com",
      });
    });

    const db = createSupabaseDb();

    // Mirror target user to Supabase in-memory stub.
    await db.insert("users", {
      _id: String(targetUserId),
      name: "Target User",
      email: "target@example.com",
      isPlatformAdmin: false,
    });

    // Link target to the existing org via teamMemberships.
    await db.insert("teamMemberships", {
      _id: "m_target_1",
      userId: String(targetUserId),
      organizationId: String(organizationId),
      role: "member",
      joinedAt: 1700000000000,
    });

    const detail = await t
      .withIdentity(identity)
      .action(api.admin.users.getUserDetail, { userId: targetUserId });

    expect(detail.userId).toBe(String(targetUserId));
    expect(detail.name).toBe("Target User");
    expect(detail.email).toBe("target@example.com");
    expect(detail.isPlatformAdmin).toBe(false);
    expect(detail.isSuspended).toBe(false);
    expect(detail.memberships).toHaveLength(1);
    expect(detail.memberships[0].organizationId).toBe(String(organizationId));
    expect(detail.memberships[0].organizationName).toBe("Test Org");
    expect(detail.memberships[0].role).toBe("member");
    expect(detail.memberships[0].joinedAt).toBe(1700000000000);
  });

  test("returns empty memberships when target user belongs to no org", async () => {
    const t = createTestCtx();
    const { userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    // Seed a standalone target user with no memberships.
    const targetUserId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Lone User",
        email: "lone@example.com",
      });
    });

    await createSupabaseDb().insert("users", {
      _id: String(targetUserId),
      name: "Lone User",
      email: "lone@example.com",
    });

    const detail = await t
      .withIdentity(identity)
      .action(api.admin.users.getUserDetail, { userId: targetUserId });

    expect(detail.userId).toBe(String(targetUserId));
    expect(detail.memberships).toHaveLength(0);
  });

  test("throws when target user does not exist", async () => {
    const t = createTestCtx();
    const { userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    // Reuse callerUserId as a fake non-existent target — it exists in Convex
    // but we deliberately skip inserting it into the Supabase stub so the
    // Supabase get() returns null.
    // Insert a fresh Convex user so we have a valid Id<"users">.
    const missingId = await t.run(async (ctx) => {
      return ctx.db.insert("users", { name: "Ghost", email: "ghost@example.com" });
    });
    // Do NOT insert into Supabase stub — Supabase get() will return null.

    await expect(
      t.withIdentity(identity).action(api.admin.users.getUserDetail, { userId: missingId }),
    ).rejects.toThrow(/User not found/i);
  });
});
