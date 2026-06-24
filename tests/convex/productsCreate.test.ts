import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

describe("products.create — happy path (#2185)", () => {
  test("inserts a product with required fields and writes it to Supabase", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const productId = await t
      .withIdentity(identity)
      .action(api.products.create, {
        organizationId,
        name: "Test Product",
        sku: "PRD-001",
        unitPrice: 99.99,
        isActive: true,
      });

    expect(productId).toBeTruthy();

    const db = createSupabaseDb();
    const row = (await db.get("products", String(productId))) as
      | Record<string, unknown>
      | null;
    expect(row).not.toBeNull();
    expect(row?.name).toBe("Test Product");
    expect(row?.sku).toBe("PRD-001");
    expect(row?.unitPrice).toBe(99.99);
    expect(row?.isActive).toBe(true);
    expect(row?.organizationId).toBe(String(organizationId));
    expect(row?.createdBy).toBe(String(userId));
    expect(typeof row?.createdAt).toBe("number");
    expect(typeof row?.updatedAt).toBe("number");
  });

  test("optional migration-added columns default correctly when not supplied", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const productId = await t
      .withIdentity(identity)
      .action(api.products.create, {
        organizationId,
        name: "Minimal Product",
        sku: "PRD-002",
        unitPrice: 50,
        taxRate: 23,
        isActive: true,
      });

    const db = createSupabaseDb();
    const row = (await db.get("products", String(productId))) as
      | Record<string, unknown>
      | null;
    expect(row).not.toBeNull();
    // taxExempt only written when explicitly true (migration 00006).
    expect(row?.taxExempt).toBeUndefined();
    // trackStock is written explicitly (false by default) so the DB column
    // stores the user's intent. On pre-00013 environments the try/catch probe
    // strips it and retries without it (issue #2185, #2206).
    expect(row?.trackStock).toBe(false);
    // The remaining migration-added columns are omitted when not supplied.
    expect(row?.stockUnit).toBeUndefined();
    expect(row?.productSection).toBeUndefined();
    expect(row?.minStock).toBeUndefined();
    expect(row?.manufacturer).toBeUndefined();
    expect(row?.catalogNumber).toBeUndefined();
    expect(row?.stockNote).toBeUndefined();
  });

  test("sets taxExempt and clears taxRate when ZW is selected", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const productId = await t
      .withIdentity(identity)
      .action(api.products.create, {
        organizationId,
        name: "VAT-Exempt Product",
        sku: "PRD-003",
        unitPrice: 200,
        taxRate: null,
        taxExempt: true,
        isActive: true,
      });

    const db = createSupabaseDb();
    const row = (await db.get("products", String(productId))) as
      | Record<string, unknown>
      | null;
    expect(row).not.toBeNull();
    expect(row?.taxExempt).toBe(true);
    expect(row?.taxRate).toBeNull();
  });

  test("writes stock-tracking fields when trackStock is enabled", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const productId = await t
      .withIdentity(identity)
      .action(api.products.create, {
        organizationId,
        name: "Tracked Product",
        sku: "PRD-004",
        unitPrice: 30,
        isActive: true,
        trackStock: true,
        stockUnit: "szt.",
        productSection: "sale",
        minStock: 5,
        manufacturer: "Acme Corp",
        catalogNumber: "CAT-99",
        stockNote: "Keep dry",
      });

    const db = createSupabaseDb();
    const row = (await db.get("products", String(productId))) as
      | Record<string, unknown>
      | null;
    expect(row).not.toBeNull();
    expect(row?.trackStock).toBe(true);
    expect(row?.stockUnit).toBe("szt.");
    expect(row?.productSection).toBe("sale");
    expect(row?.minStock).toBe(5);
    expect(row?.manufacturer).toBe("Acme Corp");
    expect(row?.catalogNumber).toBe("CAT-99");
    expect(row?.stockNote).toBe("Keep dry");
  });
});
