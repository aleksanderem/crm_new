import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  // Let pending setTimeout(0) side-effect callbacks fire against the current
  // instance; the process-wide scheduler-noise filter (tests/convex/_setup.ts)
  // swallows orphan-write rejections that still escape this yield.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("gabinet/treatments.create — happy path", () => {
  test("inserts a treatment with required fields and writes it to Supabase", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId, productId: "gabinet", status: "active",
        cancelAtPeriodEnd: false, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });

    const treatmentId = await t
      .withIdentity(identity)
      .action(api.gabinet.treatments.create, {
        organizationId,
        name: "Botox forehead",
        duration: 45,
        price: 800,
      });

    expect(treatmentId).toBeTruthy();

    const db = createSupabaseDb();
    const row = (await db.get("gabinetTreatments", String(treatmentId))) as
      | Record<string, unknown>
      | null;
    expect(row).not.toBeNull();
    expect(row?.name).toBe("Botox forehead");
    expect(row?.duration).toBe(45);
    expect(row?.price).toBe(800);
    expect(row?.organizationId).toBe(String(organizationId));
    expect(row?.createdBy).toBe(String(userId));
    expect(row?.isActive).toBe(true);
    expect(typeof row?.createdAt).toBe("number");
    expect(typeof row?.updatedAt).toBe("number");
  });

  test("persists all optional columns when supplied", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId, productId: "gabinet", status: "active",
        cancelAtPeriodEnd: false, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });

    const treatmentId = await t
      .withIdentity(identity)
      .action(api.gabinet.treatments.create, {
        organizationId,
        name: "Laser hair removal",
        description: "Full-leg laser session",
        duration: 60,
        price: 1200,
        currency: "PLN",
        taxRate: 23,
        requiredEquipment: ["Laser machine"],
        requiredEquipmentIds: ["eq_123"],
        contraindications: "Pregnancy, sunburn",
        preparationInstructions: "Shave 24h before",
        aftercareInstructions: "Avoid sun for 7 days",
        requiresApproval: true,
        color: "#ff00aa",
        sortOrder: 5,
        treatmentCount: 1,
        tagIds: ["tag_a", "tag_b"],
        categoryId: "cat_1",
      });

    const db = createSupabaseDb();
    const row = (await db.get("gabinetTreatments", String(treatmentId))) as
      | Record<string, unknown>
      | null;
    expect(row).not.toBeNull();
    expect(row?.description).toBe("Full-leg laser session");
    expect(row?.currency).toBe("PLN");
    expect(row?.taxRate).toBe(23);
    expect(row?.requiredEquipment).toEqual(["Laser machine"]);
    expect(row?.requiredEquipmentIds).toEqual(["eq_123"]);
    expect(row?.contraindications).toBe("Pregnancy, sunburn");
    expect(row?.preparationInstructions).toBe("Shave 24h before");
    expect(row?.aftercareInstructions).toBe("Avoid sun for 7 days");
    expect(row?.requiresApproval).toBe(true);
    expect(row?.color).toBe("#ff00aa");
    expect(row?.sortOrder).toBe(5);
    expect(row?.treatmentCount).toBe(1);
    expect(row?.tagIds).toEqual(["tag_a", "tag_b"]);
    expect(row?.categoryId).toBe("cat_1");
  });

  test("clears taxRate when taxExempt is true", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("productSubscriptions", {
        organizationId, productId: "gabinet", status: "active",
        cancelAtPeriodEnd: false, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });

    const treatmentId = await t
      .withIdentity(identity)
      .action(api.gabinet.treatments.create, {
        organizationId,
        name: "Consultation",
        duration: 30,
        price: 100,
        taxRate: 23,
        taxExempt: true,
      });

    const db = createSupabaseDb();
    const row = (await db.get("gabinetTreatments", String(treatmentId))) as
      | Record<string, unknown>
      | null;
    expect(row?.taxExempt).toBe(true);
    expect(row?.taxRate).toBeNull();
  });

  test("rejects callers without org membership", async () => {
    const t = createTestCtx();
    // Build an identity for a user who is NOT a member of any org.
    const strangerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        name: "Stranger",
        email: "stranger@example.com",
      });
    });
    // Seed an org owned by someone else.
    const { organizationId } = await seedTestUser(t);

    const strangerIdentity = {
      subject: `${strangerUserId}|fake-session-id`,
      issuer: "test",
      tokenIdentifier: `test|${strangerUserId}`,
    };

    await expect(
      t
        .withIdentity(strangerIdentity)
        .action(api.gabinet.treatments.create, {
          organizationId,
          name: "Sneaky treatment",
          duration: 15,
          price: 10,
        }),
    ).rejects.toThrow();
  });
});
