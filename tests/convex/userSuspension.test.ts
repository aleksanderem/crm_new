/**
 * SP3 T2 — user suspension enforcement tests.
 *
 * Verifies that a user with `is_suspended = true` in Supabase is blocked by:
 *   (a) verifyOrgAccess  → api.organizations.getMembers
 *   (b) mintUserToken    → api.supabase.jwt.mintUserToken
 *   (c) verifyPlatformAdmin → api.platformAdmins.list
 *
 * Non-suspended control cases must continue to pass for each guard.
 *
 * NOTE: seedTestUser() does NOT insert into the Supabase `users` table
 * (only into Supabase organizations + teamMemberships). We must insert the
 * users row explicitly before patching it with isSuspended. This mirrors
 * the pattern in impersonation.test.ts.
 */

import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// SUPABASE_JWT_SECRET must be set for JWT signing in jwt.ts to run.
// A fixed test secret is enough — it just needs to be non-empty for jose.
beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET =
    process.env.SUPABASE_JWT_SECRET ?? "test-secret-for-vitest-only-not-used-in-prod";
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Insert a user row into in-memory Supabase and mark them as suspended. */
async function seedAndSuspendUser(userId: string) {
  const db = createSupabaseDb();
  await db.insert("users", {
    _id: userId,
    name: "Suspended User",
    email: `suspended-${userId}@example.com`,
    isPlatformAdmin: false,
    isSuspended: true,
  });
}

/** Insert a user row into in-memory Supabase as a non-suspended plain user. */
async function seedUserInSupabase(userId: string) {
  const db = createSupabaseDb();
  await db.insert("users", {
    _id: userId,
    name: "Active User",
    email: `active-${userId}@example.com`,
    isPlatformAdmin: false,
  });
}

/** Insert a user row into in-memory Supabase as a platform admin. */
async function seedAdminInSupabase(userId: string) {
  const db = createSupabaseDb();
  await db.insert("users", {
    _id: userId,
    name: "Platform Admin",
    email: `admin-${userId}@example.com`,
    isPlatformAdmin: true,
  });
}

/** Insert a user row into in-memory Supabase as a suspended platform admin. */
async function seedSuspendedAdminInSupabase(userId: string) {
  const db = createSupabaseDb();
  await db.insert("users", {
    _id: userId,
    name: "Suspended Admin",
    email: `suspended-admin-${userId}@example.com`,
    isPlatformAdmin: true,
    isSuspended: true,
  });
}

// ---------------------------------------------------------------------------
// (a) verifyOrgAccess — api.organizations.getMembers
// ---------------------------------------------------------------------------

describe("user suspension — verifyOrgAccess", () => {
  test("suspended user: org action rejects with 'User suspended'", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedAndSuspendUser(String(userId));

    await expect(
      t.withIdentity(identity).action(api.organizations.getMembers, {
        organizationId,
      }),
    ).rejects.toThrow(/suspended/i);
  });

  test("non-suspended user: org action succeeds", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedUserInSupabase(String(userId));

    await expect(
      t.withIdentity(identity).action(api.organizations.getMembers, {
        organizationId,
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// (b) mintUserToken — api.supabase.jwt.mintUserToken
// ---------------------------------------------------------------------------

describe("user suspension — mintUserToken", () => {
  test("suspended user: mintUserToken rejects with 'User suspended'", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    await seedAndSuspendUser(String(userId));

    await expect(
      t.withIdentity(identity).action(api.supabase.jwt.mintUserToken, {}),
    ).rejects.toThrow(/suspended/i);
  });

  test("non-suspended user: mintUserToken succeeds", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    await seedUserInSupabase(String(userId));

    await expect(
      t.withIdentity(identity).action(api.supabase.jwt.mintUserToken, {}),
    ).resolves.toHaveProperty("token");
  });
});

// ---------------------------------------------------------------------------
// (c) verifyPlatformAdmin — api.platformAdmins.list
// ---------------------------------------------------------------------------

describe("user suspension — verifyPlatformAdmin", () => {
  test("suspended platform admin: admin action rejects with 'User suspended'", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    await seedSuspendedAdminInSupabase(String(userId));

    await expect(
      t.withIdentity(identity).action(api.platformAdmins.list, {}),
    ).rejects.toThrow(/suspended/i);
  });

  test("non-suspended platform admin: admin action succeeds", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    await seedAdminInSupabase(String(userId));

    await expect(
      t.withIdentity(identity).action(api.platformAdmins.list, {}),
    ).resolves.toBeDefined();
  });
});
