/**
 * Verifies that every gift package assignment emits a `gift_package_assigned`
 * audit log entry, regardless of whether loyalty points were awarded.
 *
 * Regression test for #5221.
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedGabinetPrereqs, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("assignGiftPackage audit trail", () => {
  test("emits gift_package_assigned audit entry even when loyaltyPointsAwarded is 0", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // Create a package with no loyalty points
    const packageId = await t.withIdentity(identity).action(api.gabinet.packages.create, {
      organizationId,
      name: "Gift Package No Points",
      treatments: [{ treatmentId: String(treatmentId), quantity: 2 }],
      totalPrice: 300,
    });

    // Purchase as gift (no patientId)
    const usageId = await t.withIdentity(identity).action(
      api.gabinet.packages.purchasePackage,
      {
        organizationId,
        packageId,
        paidAmount: 300,
        paymentMethod: "cash",
        isGift: true,
      },
    );

    // Assign the gift to the patient
    await t.withIdentity(identity).action(api.gabinet.packages.assignGiftPackage, {
      organizationId,
      usageId,
      patientId: String(patientId),
    });

    const db = createSupabaseDb();
    const auditEntries = await db
      .query("auditLog")
      .eq("organizationId", String(organizationId))
      .collect();

    const assignmentEntry = auditEntries.find(
      (e) => e.action === "gift_package_assigned",
    );
    expect(assignmentEntry).toBeTruthy();
    expect(assignmentEntry?.entityType).toBe("gabinetPatient");
    expect(assignmentEntry?.entityId).toBe(String(patientId));

    // No loyalty points awarded, so loyalty_points_earned should NOT be present
    const loyaltyEntry = auditEntries.find(
      (e) => e.action === "loyalty_points_earned",
    );
    expect(loyaltyEntry).toBeUndefined();
  });

  test("emits both gift_package_assigned and loyalty_points_earned when points > 0", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // Create a package with loyalty points
    const packageId = await t.withIdentity(identity).action(api.gabinet.packages.create, {
      organizationId,
      name: "Gift Package With Points",
      treatments: [{ treatmentId: String(treatmentId), quantity: 2 }],
      totalPrice: 300,
      loyaltyPointsAwarded: 50,
    });

    // Purchase as gift
    const usageId = await t.withIdentity(identity).action(
      api.gabinet.packages.purchasePackage,
      {
        organizationId,
        packageId,
        paidAmount: 300,
        paymentMethod: "cash",
        isGift: true,
      },
    );

    // Assign the gift to the patient
    await t.withIdentity(identity).action(api.gabinet.packages.assignGiftPackage, {
      organizationId,
      usageId,
      patientId: String(patientId),
    });

    const db = createSupabaseDb();
    const auditEntries = await db
      .query("auditLog")
      .eq("organizationId", String(organizationId))
      .collect();

    const assignmentEntry = auditEntries.find(
      (e) => e.action === "gift_package_assigned",
    );
    expect(assignmentEntry).toBeTruthy();

    const loyaltyEntry = auditEntries.find(
      (e) => e.action === "loyalty_points_earned",
    );
    expect(loyaltyEntry).toBeTruthy();
  });
});
