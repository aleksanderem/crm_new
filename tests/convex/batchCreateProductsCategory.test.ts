import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

describe("batchCreateProducts — category import (#5171)", () => {
  test("resolves category name to categoryId when category exists", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();
    const categoryId = await db.insert("categoryDefinitions", {
      organizationId: String(organizationId),
      entityType: "product",
      name: "Electronics",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, category: "Electronics" }],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);

    const inserted = await db.query("products").eq("organizationId", String(organizationId)).collect() as any[];
    expect(inserted[0].categoryId).toEqual(categoryId);
  });

  test("trims whitespace from category name before lookup", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();
    await db.insert("categoryDefinitions", {
      organizationId: String(organizationId),
      entityType: "product",
      name: "Clothing",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, category: "  Clothing  " }],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  test("returns error and skips product when category name is unknown", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [
          { name: "Good", sku: "S-OK", unitPrice: 10 },
          { name: "Bad", sku: "S-BAD", unitPrice: 10, category: "NonExistent" },
        ],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].error).toMatch(/Unknown category: "NonExistent"/);
  });

  test("empty category field creates product with null categoryId", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, category: "" }],
      });

    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(0);

    const db = createSupabaseDb();
    const inserted = await db.query("products").eq("organizationId", String(organizationId)).collect() as any[];
    expect(inserted[0].categoryId).toBeNull();
  });

  test("does not create new categoryDefinitions", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const before = await db.query("categoryDefinitions").eq("organizationId", String(organizationId)).collect();

    await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, category: "PhantomCategory" }],
      });

    const after = await db.query("categoryDefinitions").eq("organizationId", String(organizationId)).collect();
    expect(after.length).toBe(before.length);
  });

  test("ignores categories from other organizations", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const { organizationId: otherOrg } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();
    // Category only exists in the other org
    await db.insert("categoryDefinitions", {
      organizationId: String(otherOrg),
      entityType: "product",
      name: "SharedName",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, category: "SharedName" }],
      });

    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/Unknown category: "SharedName"/);
  });

  test("ignores soft-deleted categories", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();
    await db.insert("categoryDefinitions", {
      organizationId: String(organizationId),
      entityType: "product",
      name: "Deleted",
      sortOrder: 0,
      isDeleted: true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.crm.csvImport.batchCreateProducts, {
        organizationId,
        records: [{ name: "P1", sku: "S1", unitPrice: 10, category: "Deleted" }],
      });

    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/Unknown category: "Deleted"/);
  });
});
