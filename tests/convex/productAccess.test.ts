import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

describe("getActiveProducts", () => {
  test("returns empty array when org has no subscriptions", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).toEqual([]);
  });

  test("active subscription grants access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // Create an active subscription for CRM
    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "crm",
        status: "active",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).toContain("crm");
    expect(products).not.toContain("gabinet");
  });

  test("trialing subscription grants access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "gabinet",
        status: "trialing",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).toContain("gabinet");
  });

  test("canceled subscription does not grant access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "crm",
        status: "canceled",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).not.toContain("crm");
  });

  test("past_due subscription does not grant access", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId,
        productId: "crm",
        status: "past_due",
        cancelAtPeriodEnd: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const products = await t.withIdentity(identity).query(
      api.productSubscriptions.getActiveProducts,
      { organizationId },
    );

    expect(products).not.toContain("crm");
  });
});
