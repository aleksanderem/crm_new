import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

describe("batchCreateProducts — taxRate validation (#5164)", () => {
  test("accepts valid tax rates 0, 5, 8, 23", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [
          { name: "P1", sku: "S1", unitPrice: 10, taxRate: 0 },
          { name: "P2", sku: "S2", unitPrice: 20, taxRate: 5 },
          { name: "P3", sku: "S3", unitPrice: 30, taxRate: 8 },
          { name: "P4", sku: "S4", unitPrice: 40, taxRate: 23 },
        ],
      });

    expect(result.created).toBe(4);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects out-of-range taxRate and reports a row error", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [
          { name: "Good", sku: "S-OK", unitPrice: 10, taxRate: 23 },
          { name: "Bad", sku: "S-BAD", unitPrice: 10, taxRate: 15 },
        ],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].error).toMatch(/Invalid taxRate 15/);
  });

  test("skips taxRate validation when taxExempt is true", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [
          { name: "Exempt", sku: "S-ZW", unitPrice: 100, taxExempt: true },
        ],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });
});
