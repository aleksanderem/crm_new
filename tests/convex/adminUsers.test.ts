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

// ---------------------------------------------------------------------------
// setUserSuspended tests (SP3 T2)
// ---------------------------------------------------------------------------

describe("admin/users.setUserSuspended", () => {
  test("(d) admin can suspend a target user — round-trips to Supabase is_suspended=true", async () => {
    const t = createTestCtx();

    // Caller = platform admin.
    const { userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    // Target user — distinct from the caller.
    const targetUserId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Target",
        email: "target-suspend@example.com",
      });
    });
    await createSupabaseDb().insert("users", {
      _id: String(targetUserId),
      name: "Target",
      email: "target-suspend@example.com",
      isPlatformAdmin: false,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.admin.users.setUserSuspended, {
        userId: targetUserId,
        suspended: true,
      });

    expect(result.userId).toBe(String(targetUserId));
    expect(result.suspended).toBe(true);

    // Verify the flag was written into the in-memory Supabase store.
    const row = await createSupabaseDb().get("users", String(targetUserId));
    expect((row as { isSuspended?: boolean } | null)?.isSuspended).toBe(true);
  });

  test("(e) non-platform-admin caller: setUserSuspended rejects with platform admin message", async () => {
    const t = createTestCtx();

    // Caller is a plain member, NOT a platform admin.
    const { userId: callerUserId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(callerUserId),
      name: "Plain",
      email: "plain@example.com",
      isPlatformAdmin: false,
    });

    const targetUserId = await t.run(async (ctx) => {
      return ctx.db.insert("users", { name: "Target2", email: "t2@example.com" });
    });

    await expect(
      t.withIdentity(identity).action(api.admin.users.setUserSuspended, {
        userId: targetUserId,
        suspended: true,
      }),
    ).rejects.toThrow(/platform admin/i);
  });

  test("(f) self-suspend: setUserSuspended on own userId rejects", async () => {
    const t = createTestCtx();

    const { userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    await expect(
      t.withIdentity(identity).action(api.admin.users.setUserSuspended, {
        userId: callerUserId,
        suspended: true,
      }),
    ).rejects.toThrow(/suspend your own/i);
  });

  // ---------------------------------------------------------------------------
  // Last-admin guard tests
  //
  // The guard throws "Cannot suspend the last platform admin" when suspending a
  // platform-admin target would leave zero non-suspended platform admins.
  //
  // NOTE: The pure-lockout rejection case (0 remaining admins) is
  // unconstructible in a single-caller test. The caller must pass
  // verifyPlatformAdmin, which requires them to be a non-suspended platform
  // admin. Since the caller != target (self-suspend is already blocked), the
  // caller is always counted as a remaining non-suspended admin — so the count
  // is always ≥1. The guard exists as defense-in-depth against concurrent
  // races (two admins mutually suspending). The tests below verify the guard
  // does NOT break normal flows and that the guard logic is exercised for
  // admin targets.
  // ---------------------------------------------------------------------------

  test("(g) last-admin guard: suspending a platform-admin target succeeds when another non-suspended admin (the actor) remains", async () => {
    const t = createTestCtx();

    // Actor = platform admin (non-suspended, counted as remaining after target suspended).
    const { userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    // Target = a second platform admin.
    const targetUserId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Second Admin",
        email: "second-admin@example.com",
      });
    });
    await createSupabaseDb().insert("users", {
      _id: String(targetUserId),
      name: "Second Admin",
      email: "second-admin@example.com",
      isPlatformAdmin: true,
      isSuspended: false,
    });

    // Guard should pass: actor (non-suspended admin) remains after target suspended.
    const result = await t
      .withIdentity(identity)
      .action(api.admin.users.setUserSuspended, {
        userId: targetUserId,
        suspended: true,
      });

    expect(result.suspended).toBe(true);

    // Verify Supabase row updated.
    const row = await createSupabaseDb().get("users", String(targetUserId));
    expect((row as { isSuspended?: boolean } | null)?.isSuspended).toBe(true);
  });

  test("(h) last-admin guard: suspending a NON-admin target always succeeds regardless of admin count", async () => {
    const t = createTestCtx();

    const { userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    // Target is NOT a platform admin — guard should not fire.
    const targetUserId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Regular User",
        email: "regular@example.com",
      });
    });
    await createSupabaseDb().insert("users", {
      _id: String(targetUserId),
      name: "Regular User",
      email: "regular@example.com",
      isPlatformAdmin: false,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.admin.users.setUserSuspended, {
        userId: targetUserId,
        suspended: true,
      });

    expect(result.suspended).toBe(true);
  });

  test("(i) last-admin guard: unsuspending a platform-admin target always succeeds", async () => {
    const t = createTestCtx();

    const { userId: callerUserId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(callerUserId));

    // Target = already-suspended platform admin.
    const targetUserId = await t.run(async (ctx) => {
      return ctx.db.insert("users", {
        name: "Suspended Admin",
        email: "suspended-admin@example.com",
      });
    });
    await createSupabaseDb().insert("users", {
      _id: String(targetUserId),
      name: "Suspended Admin",
      email: "suspended-admin@example.com",
      isPlatformAdmin: true,
      isSuspended: true,
    });

    // Unsuspend — guard only runs on suspended:true, should be a no-op here.
    const result = await t
      .withIdentity(identity)
      .action(api.admin.users.setUserSuspended, {
        userId: targetUserId,
        suspended: false,
      });

    expect(result.suspended).toBe(false);
  });
});
