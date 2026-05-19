import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedGabinetPrereqs, seedTestUser } from "../../convex/_test_helpers";

afterEach(async () => {
  // Let any pending setTimeout(0) side-effect callbacks from the test fire
  // against the *current* instance before the next test creates a new one.
  // The process-wide scheduler-noise filter in tests/convex/_setup.ts swallows
  // any orphan-write rejections that still escape.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("package activities", () => {
  test("purchasePackage publishes semantic package_assigned envelope", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const packageId = await t.withIdentity(identity).action(api.gabinet.packages.create, {
      organizationId,
      name: "Starter package",
      treatments: [
        {
          treatmentId,
          quantity: 4,
        },
      ],
      totalPrice: 400,
    });

    const usageId = await t.withIdentity(identity).action(
      api.gabinet.packages.purchasePackage,
      {
        organizationId,
        patientId,
        packageId,
        paidAmount: 350,
        paymentMethod: "cash",
      },
    );

    const rows = await t.run(async (ctx) => {
      const all = await ctx.db.query("activities").collect();
      return all.filter(
        (row) => row.organizationId === organizationId && row.action === "package_assigned",
      );
    });

    expect(usageId).toBeTruthy();
    expect(rows).toHaveLength(2);

    const eventKeys = new Set(
      rows.map((row) => row.metadata?.activityEnvelope?.eventKey).filter(Boolean),
    );
    expect(eventKeys.size).toBe(1);

    const entityTypes = new Set(rows.map((row) => row.entityType));
    expect(entityTypes).toEqual(new Set(["gabinetPackage", "gabinetPatient"]));

    for (const row of rows) {
      const envelope = row.metadata?.activityEnvelope;
      expect(envelope).toBeTruthy();
      expect(envelope).toMatchObject({
        schemaVersion: 1,
        module: "gabinet",
        payload: {
          usageId,
          packageId,
          patientId,
          paidAmount: 350,
          paymentMethod: "cash",
        },
      });
      expect(envelope.eventKey).toBe(`gabinet:package:${usageId}:package_assigned`);
    }
  });
});
