import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

describe("batchCreateProducts — tags import (#5169)", () => {
  test("resolves tag names to tagIds when tags exist", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();
    const tagId = await db.insert("tagDefinitions", {
      organizationId: String(organizationId),
      name: "Bestseller",
      color: "#ff0000",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, tags: ["Bestseller"] }],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);

    const inserted = await db.query("products").eq("organizationId", String(organizationId)).collect() as any[];
    expect(inserted[0].tagIds).toEqual([tagId]);
  });

  test("returns error and skips product when tag name is unknown", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [
          { name: "Good", sku: "S-OK", unitPrice: 10 },
          { name: "Bad", sku: "S-BAD", unitPrice: 10, tags: ["NonExistentTag"] },
        ],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].error).toMatch(/Unknown tag: "NonExistentTag"/);
  });

  test("empty tags field creates product with no tagIds", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, tags: [] }],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("does not create new tagDefinitions", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const before = await db.query("tagDefinitions").eq("organizationId", String(organizationId)).collect();

    await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, tags: ["Phantom"] }],
      });

    const after = await db.query("tagDefinitions").eq("organizationId", String(organizationId)).collect();
    expect(after.length).toBe(before.length);
  });
});
