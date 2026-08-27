/**
 * SP2 T2 — org suspension enforcement tests.
 *
 * Verifies that verifyOrgAccess (called by every action that uses it) throws
 * "Organization suspended" when the org's Supabase `status` is "suspended".
 * An org with no status (null/absent) must pass through normally.
 *
 * Test actions used:
 *   - api.organizations.getMembers  (action → calls verifyOrgAccess)
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("org suspension — verifyOrgAccess", () => {
  test("suspended org: member action rejects with 'Organization suspended'", async () => {
    const t = createTestCtx();
    // seedTestUser inserts org + membership into both Convex db and in-memory Supabase.
    const { organizationId, identity } = await seedTestUser(t);

    // Mark the org as suspended in the in-memory Supabase store.
    const db = createSupabaseDb();
    await db.patch("organizations", String(organizationId), { status: "suspended" });

    await expect(
      t.withIdentity(identity).action(api.organizations.getMembers, {
        organizationId,
      }),
    ).rejects.toThrow(/suspended/i);
  });

  test("active org (status null): member action succeeds", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // No status patch — status is absent (null/undefined), should be treated as active.
    await expect(
      t.withIdentity(identity).action(api.organizations.getMembers, {
        organizationId,
      }),
    ).resolves.toBeDefined();
  });

  test("active org (status explicitly 'active'): member action succeeds", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    await db.patch("organizations", String(organizationId), { status: "active" });

    await expect(
      t.withIdentity(identity).action(api.organizations.getMembers, {
        organizationId,
      }),
    ).resolves.toBeDefined();
  });
});
