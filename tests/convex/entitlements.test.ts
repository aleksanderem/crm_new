import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// Make the seeded user a platform admin by inserting them into the in-memory
// Supabase users table with is_platform_admin=true (verifyPlatformAdmin reads
// the Supabase users row, which seedTestUser does not create).
async function makePlatformAdmin(userId: string) {
  await createSupabaseDb().insert("users", {
    _id: userId,
    name: "Admin",
    email: `admin-${userId}@example.com`,
    isPlatformAdmin: true,
  });
}

describe("admin/entitlements.setEntitlement", () => {
  test("grant creates an active manual entitlement with audit", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    const res = await t
      .withIdentity(identity)
      .action(api.admin.entitlements.setEntitlement, {
        organizationId,
        productId: "gabinet",
        grant: true,
      });
    expect(res.status).toBe("active");

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("productSubscriptions")
        .withIndex("by_orgAndProduct", (q) =>
          q.eq("organizationId", organizationId).eq("productId", "gabinet"),
        )
        .unique(),
    );
    expect(row?.status).toBe("active");
    expect(row?.source).toBe("manual");
    expect(String(row?.grantedByUserId)).toBe(String(userId));

    const audit = await t.run(async (ctx) =>
      ctx.db.query("auditLog").collect(),
    );
    expect(audit.some((a) => a.action === "product_access_granted")).toBe(true);
  });

  test("revoke flips an existing entitlement to canceled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await makePlatformAdmin(String(userId));

    await t.withIdentity(identity).action(api.admin.entitlements.setEntitlement, {
      organizationId, productId: "gabinet", grant: true,
    });
    const res = await t
      .withIdentity(identity)
      .action(api.admin.entitlements.setEntitlement, {
        organizationId, productId: "gabinet", grant: false,
      });
    expect(res.status).toBe("canceled");

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("productSubscriptions")
        .withIndex("by_orgAndProduct", (q) =>
          q.eq("organizationId", organizationId).eq("productId", "gabinet"),
        )
        .unique(),
    );
    expect(row?.status).toBe("canceled");
  });

  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    // Insert Supabase user WITHOUT platform admin.
    await createSupabaseDb().insert("users", {
      _id: String(userId), name: "Nobody", email: "nobody@example.com",
      isPlatformAdmin: false,
    });
    await expect(
      t.withIdentity(identity).action(api.admin.entitlements.setEntitlement, {
        organizationId, productId: "gabinet", grant: true,
      }),
    ).rejects.toThrow();
  });
});

describe("admin/entitlements.listOrgEntitlements", () => {
  test("merges orgs with their entitlement status", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(userId), name: "Admin", email: "a@example.com",
      isPlatformAdmin: true,
    });
    await t.withIdentity(identity).action(api.admin.entitlements.setEntitlement, {
      organizationId, productId: "gabinet", grant: true,
    });

    const rows = await t
      .withIdentity(identity)
      .action(api.admin.entitlements.listOrgEntitlements, {});
    const org = rows.find((r) => r.organizationId === String(organizationId));
    expect(org).toBeTruthy();
    expect(org?.name).toBe("Test Org");
    expect(org?.gabinet).toBe("active");
    expect(org?.crm).toBe("none");
    expect(org?.memberCount).toBe(1);
  });

  test("rejects non-platform-admin callers", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);
    await createSupabaseDb().insert("users", {
      _id: String(userId), name: "N", email: "n@example.com", isPlatformAdmin: false,
    });
    await expect(
      t.withIdentity(identity).action(api.admin.entitlements.listOrgEntitlements, {}),
    ).rejects.toThrow();
  });
});
