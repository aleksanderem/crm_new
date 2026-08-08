import { afterEach, describe, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("enforcement after flip", () => {
  test("getActiveProducts returns only granted products (no catalog fallback)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    // Grant only CRM.
    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId, productId: "crm", status: "active",
        cancelAtPeriodEnd: false, source: "manual", grantedByUserId: userId,
        createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const products = await t
      .withIdentity(identity)
      .query(api.productSubscriptions.getActiveProducts, { organizationId });
    expect(products).toEqual(["crm"]);
  });

  test("verifyGabinetAccess throws when gabinet not granted", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    await expect(
      t.run(async (ctx) =>
        ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
          organizationId,
        }),
      ),
    ).rejects.toThrow(/No active subscription/);
  });
});
