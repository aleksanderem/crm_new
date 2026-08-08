import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("migrations/backfillEntitlements.run", () => {
  test("grants CRM to all orgs and Gabinet only to orgs with gabinet data; idempotent", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    // Give this org gabinet data (a patient row in Supabase).
    await createSupabaseDb().insert("gabinetPatients", {
      _id: "pat_1",
      organizationId: String(organizationId),
      firstName: "Jan", lastName: "Kowalski",
      createdBy: String(userId), createdAt: Date.now(), updatedAt: Date.now(),
    });

    const res = await t.run(async () => null).then(() =>
      t.action(internal.migrations.backfillEntitlements.run, { dryRun: false }),
    );
    expect(res.crmGranted).toBeGreaterThanOrEqual(1);
    expect(res.gabinetGranted).toBeGreaterThanOrEqual(1);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("productSubscriptions").collect(),
    );
    const crm = rows.find(
      (r) => String(r.organizationId) === String(organizationId) && r.productId === "crm",
    );
    const gab = rows.find(
      (r) => String(r.organizationId) === String(organizationId) && r.productId === "gabinet",
    );
    expect(crm?.status).toBe("active");
    expect(gab?.status).toBe("active");

    // Idempotent: second run grants nothing new.
    const res2 = await t.action(internal.migrations.backfillEntitlements.run, {
      dryRun: false,
    });
    expect(res2.crmGranted).toBe(0);
    expect(res2.gabinetGranted).toBe(0);
  });

  test("dryRun writes nothing", async () => {
    const t = createTestCtx();
    await seedTestUser(t);
    const res = await t.action(internal.migrations.backfillEntitlements.run, {
      dryRun: true,
    });
    expect(res.dryRun).toBe(true);
    const rows = await t.run(async (ctx) =>
      ctx.db.query("productSubscriptions").collect(),
    );
    expect(rows.length).toBe(0);
  });
});
