/**
 * SP2 Task 1 — Data model foundation for org admin fields.
 *
 * Proves that the in-memory Supabase stub accepts the three new columns
 * (status, suspended_reason, seat_limit_override) on an organizations row
 * and that values round-trip correctly.
 */
import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Task 1 tests (data model)
// ---------------------------------------------------------------------------

test("organizations accepts admin fields (status/reason/override)", async () => {
  const db = createSupabaseDb();
  const id = "org_test_sp2";
  await db.insert("organizations", {
    id,
    name: "T",
    slug: "t",
    ownerId: "u1",
    createdAt: 1,
    updatedAt: 1,
    status: "suspended",
    suspendedReason: "abuse",
    seatLimitOverride: 50,
  });
  const row = await db.get("organizations", id);
  expect(row?.status).toBe("suspended");
  expect(row?.suspendedReason).toBe("abuse");
  expect(row?.seatLimitOverride).toBe(50);
});

test("organizations admin fields default to undefined when not provided", async () => {
  const db = createSupabaseDb();
  const id = "org_test_sp2_defaults";
  await db.insert("organizations", {
    id,
    name: "Minimal",
    slug: "minimal",
    ownerId: "u2",
    createdAt: 1,
    updatedAt: 1,
  });
  const row = await db.get("organizations", id);
  expect(row?.status).toBeUndefined();
  expect(row?.suspendedReason).toBeUndefined();
  expect(row?.seatLimitOverride).toBeUndefined();
});

test("organizations admin fields can be patched independently", async () => {
  const db = createSupabaseDb();
  const id = "org_test_sp2_patch";
  await db.insert("organizations", {
    id,
    name: "PatchTest",
    slug: "patch-test",
    ownerId: "u3",
    createdAt: 1,
    updatedAt: 1,
  });
  await db.patch("organizations", id, { status: "suspended", suspendedReason: "test", seatLimitOverride: 10 });
  const row = await db.get("organizations", id);
  expect(row?.status).toBe("suspended");
  expect(row?.suspendedReason).toBe("test");
  expect(row?.seatLimitOverride).toBe(10);
});

// ---------------------------------------------------------------------------
// Task 3 tests — listOrganizations + getOrganizationDetail
// ---------------------------------------------------------------------------

async function makePlatformAdmin(userId: string) {
  await createSupabaseDb().insert("users", {
    _id: userId,
    name: "Admin",
    email: `admin-${userId}@example.com`,
    isPlatformAdmin: true,
  });
}

describe("admin/organizations.listOrganizations", () => {
  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(userId),
      name: "Nobody",
      email: "nobody@example.com",
      isPlatformAdmin: false,
    });
    await expect(
      t.withIdentity(identity).action(api.admin.organizations.listOrganizations, {}),
    ).rejects.toThrow(/platform admin/i);
  });

  test("admin gets a row for the seeded org with correct memberCount and entitlements", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    // Seed a CRM entitlement for this org.
    await createSupabaseDb().insert("productSubscriptions", {
      _id: "ps-crm-1",
      organizationId: String(organizationId),
      productId: "crm",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const rows = await t
      .withIdentity(identity)
      .action(api.admin.organizations.listOrganizations, {});

    const org = rows.find((r) => r.organizationId === String(organizationId));
    expect(org).toBeTruthy();
    expect(org?.name).toBe("Test Org");
    expect(org?.memberCount).toBe(1);
    expect(org?.crm).toBe("active");
    expect(org?.gabinet).toBe("none");
    expect(org?.status).toBe("active");
  });

  test("crm and gabinet reflect multiple active entitlements", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    const db = createSupabaseDb();
    await db.insert("productSubscriptions", {
      _id: "ps-crm-2",
      organizationId: String(organizationId),
      productId: "crm",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert("productSubscriptions", {
      _id: "ps-gab-2",
      organizationId: String(organizationId),
      productId: "gabinet",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const rows = await t
      .withIdentity(identity)
      .action(api.admin.organizations.listOrganizations, {});

    const org = rows.find((r) => r.organizationId === String(organizationId));
    expect(org?.crm).toBe("active");
    expect(org?.gabinet).toBe("active");
  });
});

describe("admin/organizations.getOrganizationDetail", () => {
  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(userId),
      name: "Nobody",
      email: "nobody@example.com",
      isPlatformAdmin: false,
    });
    await expect(
      t
        .withIdentity(identity)
        .action(api.admin.organizations.getOrganizationDetail, {
          organizationId: String(organizationId),
        }),
    ).rejects.toThrow(/platform admin/i);
  });

  test("returns org detail with members and entitlements", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity, membershipId } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    // The owner user is already in the in-memory Supabase stub from seedTestUser,
    // but not in the users table (only organizations + teamMemberships are seeded).
    // Insert the user row so getOrganizationDetail can look up member names.
    const db = createSupabaseDb();
    await db.insert("users", {
      _id: String(userId),
      name: "Admin",
      email: `admin-${String(userId)}@example.com`,
      isPlatformAdmin: true,
    });

    await db.insert("productSubscriptions", {
      _id: "ps-crm-detail",
      organizationId: String(organizationId),
      productId: "crm",
      status: "active",
      cancelAtPeriodEnd: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const detail = await t
      .withIdentity(identity)
      .action(api.admin.organizations.getOrganizationDetail, {
        organizationId: String(organizationId),
      });

    expect(detail.organizationId).toBe(String(organizationId));
    expect(detail.name).toBe("Test Org");
    expect(detail.members).toHaveLength(1);
    expect(detail.members[0].role).toBe("owner");
    expect(detail.entitlements.crm).toBe("active");
    expect(detail.entitlements.gabinet).toBe("none");
    expect(detail.seatUsage).toBeDefined();
    expect(detail.seatUsage.currentSeats).toBeGreaterThanOrEqual(1);
  });
});
