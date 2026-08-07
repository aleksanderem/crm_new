/**
 * Package deduction guard tests for the Gabinet module.
 *
 * The appointmentBillingFlow.test.ts covers the happy-path auto-deduction via
 * appointment completion. These tests cover edge cases in the manual deduction
 * path (usePackageTreatment) that the billing flow test cannot reach:
 * exhausted sessions, expired packages, treatment-not-in-package, and the
 * auto-complete transition when the last session is used.
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedGabinetPrereqs,
  seedTestUser,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function setupPackage(
  t: ReturnType<typeof import("convex-test").convexTest>,
  identity: { subject: string; issuer: string; tokenIdentifier: string },
  args: {
    organizationId: any;
    patientId: any;
    treatmentId: any;
    quantity?: number;
    totalPrice?: number;
    validityDays?: number;
  },
) {
  const packageId = await t.withIdentity(identity).action(
    api.gabinet.packages.create,
    {
      organizationId: args.organizationId,
      name: "Test Package",
      treatments: [
        {
          treatmentId: String(args.treatmentId),
          quantity: args.quantity ?? 2,
        },
      ],
      totalPrice: args.totalPrice ?? 200,
      validityDays: args.validityDays,
    },
  );

  const usageId = await t.withIdentity(identity).action(
    api.gabinet.packages.purchasePackage,
    {
      organizationId: args.organizationId,
      patientId: String(args.patientId),
      packageId,
      paidAmount: args.totalPrice ?? 200,
      paymentMethod: "cash",
    },
  );

  return { packageId, usageId };
}

describe("package session deduction guards", () => {
  test("usePackageTreatment deducts one session from the package", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const { usageId } = await setupPackage(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      quantity: 4,
    });

    const db = createSupabaseDb();
    const usageBefore = await db.get<{
      treatmentsUsed: Array<{ usedCount: number; totalCount: number }>;
      status: string;
    }>("gabinetPackageUsage", usageId);
    expect(usageBefore?.treatmentsUsed[0].usedCount).toBe(0);
    expect(usageBefore?.status).toBe("active");

    await t.withIdentity(identity).action(
      api.gabinet.packages.usePackageTreatment,
      {
        organizationId,
        usageId,
        treatmentId: String(treatmentId),
      },
    );

    const usageAfter = await db.get<{
      treatmentsUsed: Array<{ usedCount: number; totalCount: number }>;
      status: string;
    }>("gabinetPackageUsage", usageId);
    expect(usageAfter?.treatmentsUsed[0].usedCount).toBe(1);
    expect(usageAfter?.status).toBe("active");
  });

  test("using the last session auto-completes the package", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const { usageId } = await setupPackage(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      quantity: 1,
    });

    await t.withIdentity(identity).action(
      api.gabinet.packages.usePackageTreatment,
      {
        organizationId,
        usageId,
        treatmentId: String(treatmentId),
      },
    );

    const db = createSupabaseDb();
    const usage = await db.get<{
      treatmentsUsed: Array<{ usedCount: number; totalCount: number }>;
      status: string;
    }>("gabinetPackageUsage", usageId);
    expect(usage?.treatmentsUsed[0].usedCount).toBe(1);
    expect(usage?.status).toBe("completed");
  });

  test("completed package cannot be used (all sessions exhausted)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const { usageId } = await setupPackage(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      quantity: 1,
    });

    // Use the single session — package auto-completes after this call
    await t.withIdentity(identity).action(
      api.gabinet.packages.usePackageTreatment,
      {
        organizationId,
        usageId,
        treatmentId: String(treatmentId),
      },
    );

    const db = createSupabaseDb();
    const completed = await db.get<{ status: string }>(
      "gabinetPackageUsage",
      usageId,
    );
    expect(completed?.status).toBe("completed");

    // Second use is rejected: package is no longer active
    await expect(
      t.withIdentity(identity).action(api.gabinet.packages.usePackageTreatment, {
        organizationId,
        usageId,
        treatmentId: String(treatmentId),
      }),
    ).rejects.toThrow("Package is not active");
  });

  test("usePackageTreatment fails when package has expired", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // Purchase a package with 30-day validity
    const { usageId } = await setupPackage(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      quantity: 4,
      validityDays: 30,
    });

    // Manually patch expiresAt to the past to simulate expiry
    const db = createSupabaseDb();
    await db.patch("gabinetPackageUsage", usageId, {
      expiresAt: Date.now() - 1,
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identity).action(api.gabinet.packages.usePackageTreatment, {
        organizationId,
        usageId,
        treatmentId: String(treatmentId),
      }),
    ).rejects.toThrow("Package has expired");
  });

  test("usePackageTreatment fails for a treatment not in the package", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const { usageId } = await setupPackage(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      quantity: 4,
    });

    await expect(
      t.withIdentity(identity).action(api.gabinet.packages.usePackageTreatment, {
        organizationId,
        usageId,
        treatmentId: "non-existent-treatment-id",
      }),
    ).rejects.toThrow("Treatment not in package");
  });

  test("usePackageTreatment fails when package is cancelled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const { usageId } = await setupPackage(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      quantity: 4,
    });

    // Cancel the usage
    await t.withIdentity(identity).action(
      api.gabinet.packages.updatePackageUsage,
      {
        organizationId,
        usageId,
        status: "cancelled",
      },
    );

    await expect(
      t.withIdentity(identity).action(api.gabinet.packages.usePackageTreatment, {
        organizationId,
        usageId,
        treatmentId: String(treatmentId),
      }),
    ).rejects.toThrow("Package is not active");
  });

  test("cannot delete a package that has been purchased by a patient", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const { packageId } = await setupPackage(t, identity, {
      organizationId,
      patientId,
      treatmentId,
    });

    await expect(
      t.withIdentity(identity).action(api.gabinet.packages.remove, {
        organizationId,
        packageId,
      }),
    ).rejects.toThrow(
      "Cannot delete a package that has been purchased by patients",
    );
  });
});
