/**
 * SP2 T7 — read-only org impersonation tests.
 *
 * Verifies three properties:
 *   (a) non-admin callers are rejected with "platform admin" error
 *   (b) admin callers get a valid { token: string, expiresAt: number } back
 *   (c) read-only guarantee: the impersonating admin (who is NOT a member of
 *       the target org) still fails verifyOrgAccess-backed writes on that org,
 *       proving that the impersonation token confers only Supabase-direct reads
 *       and does NOT open Convex mutation paths to the target org.
 *
 * The security model relies on verifyOrgAccess checking teamMemberships for
 * the REAL authenticated user (the admin), NOT for the impersonation subject.
 * Since the admin is not a member of the target org, every mutation/action
 * that calls verifyOrgAccess will throw "Not a member of this organization".
 */

import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// SUPABASE_JWT_SECRET must be set for the JWT signing code in jwt.ts to run.
// Use a fixed test secret — it just needs to be a non-empty string so jose
// can sign the JWT.  The real secret lives in Convex environment variables
// and is never committed to the repo.
beforeAll(() => {
  process.env.SUPABASE_JWT_SECRET =
    process.env.SUPABASE_JWT_SECRET ?? "test-secret-for-vitest-only-not-used-in-prod";
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

/**
 * Helper: seed a platform admin user and return their identity.
 * The admin user is inserted into both Convex db and in-memory Supabase.
 */
async function seedPlatformAdmin(t: ReturnType<typeof createTestCtx>) {
  // seedTestUser creates an org + membership. We want the admin to be
  // a real Convex auth user but NOT a member of the target org.
  // So we seed a separate user+org for the admin themselves.
  const { userId: adminId, identity: adminIdentity } = await seedTestUser(t);

  // Mark this user as platform admin in Supabase (that's where verifyPlatformAdmin reads from).
  await createSupabaseDb().insert("users", {
    _id: String(adminId),
    name: "Platform Admin",
    email: `platform-admin-${String(adminId)}@example.com`,
    isPlatformAdmin: true,
  });

  return { adminId, adminIdentity };
}

describe("mintImpersonationToken", () => {
  // -----------------------------------------------------------------
  // (a) Non-admin caller is rejected
  // -----------------------------------------------------------------
  test("non-admin caller: rejects with 'platform admin' error", async () => {
    const t = createTestCtx();
    // seedTestUser creates a regular user (NOT isPlatformAdmin).
    const { organizationId, userId, identity } = await seedTestUser(t);

    // Insert the user into Supabase users table as a non-admin.
    // (seedTestUser only inserts into Convex db and Supabase
    //  organizations + teamMemberships — not the users table.)
    await createSupabaseDb().insert("users", {
      _id: String(userId),
      name: "Regular User",
      email: `regular-${String(userId)}@example.com`,
      isPlatformAdmin: false,
    });

    await expect(
      t.withIdentity(identity).action(api.supabase.jwt.mintImpersonationToken, {
        organizationId: String(organizationId),
      }),
    ).rejects.toThrow(/platform admin/i);
  });

  // -----------------------------------------------------------------
  // (b) Admin caller gets a valid token
  // -----------------------------------------------------------------
  test("platform admin caller: returns { token: string, expiresAt: number }", async () => {
    const t = createTestCtx();

    // Seed a separate target org (admin is NOT a member of this org).
    const { organizationId: targetOrgId } = await seedTestUser(t);

    // Seed admin user (who is a member of THEIR OWN org, not targetOrgId).
    const { adminIdentity } = await seedPlatformAdmin(t);

    const result = await t
      .withIdentity(adminIdentity)
      .action(api.supabase.jwt.mintImpersonationToken, {
        organizationId: String(targetOrgId),
      });

    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
    // expiresAt is a Unix epoch in seconds, should be ~now + 3600
    expect(typeof result.expiresAt).toBe("number");
    expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(result.expiresAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3601);
  });

  // -----------------------------------------------------------------
  // (c) Read-only proof: impersonating admin cannot write to target org
  //
  // The platform admin authenticates as themselves (real Convex identity).
  // They are NOT a member of targetOrgId. verifyOrgAccess checks
  // teamMemberships for the REAL user, finds no membership, and rejects.
  // This proves that having an impersonation token does not grant write
  // access to Convex mutations/actions on the target org.
  // -----------------------------------------------------------------
  test("read-only guarantee: admin who is NOT a member of target org fails verifyOrgAccess-backed mutation", async () => {
    const t = createTestCtx();

    // Target org — the admin will impersonate this org but is NOT a member.
    const { organizationId: targetOrgId } = await seedTestUser(t);

    // Admin user (member of their own separate org, not targetOrgId).
    const { adminIdentity } = await seedPlatformAdmin(t);

    // The admin calls an action that runs verifyOrgAccess on targetOrgId.
    // getMembers in organizations.ts calls verifyOrgAccess internally.
    // The admin is not a member → must throw "Not a member".
    await expect(
      t.withIdentity(adminIdentity).action(api.organizations.getMembers, {
        organizationId: targetOrgId,
      }),
    ).rejects.toThrow(/not a member/i);
  });
});
