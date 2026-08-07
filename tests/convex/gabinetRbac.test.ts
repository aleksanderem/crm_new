/**
 * Runtime RBAC enforcement for the Gabinet module.
 *
 * The permissionAlignment.test.ts only verifies statically that every backend
 * checkPermission() call has a corresponding UI gate. These tests verify that
 * the checks actually fire at runtime and block the right roles from mutating
 * data they're not allowed to touch.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedGabinetPrereqs,
  seedSecondUser,
  seedTestUser,
} from "../../convex/_test_helpers";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ sid: "SM_TEST_123" }),
    })) as unknown as typeof fetch,
  );
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

describe("gabinet_appointments RBAC", () => {
  test("viewer cannot create an appointment", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity: ownerIdentity } =
      await seedTestUser(t);
    const { identity: viewerIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "viewer" },
    );
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await expect(
      t.withIdentity(viewerIdentity).action(api.gabinet.appointments.create, {
        organizationId,
        patientId: String(patientId),
        treatmentId: String(treatmentId),
        employeeId: String(userId),
        date: "2026-03-16",
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      }),
    ).rejects.toThrow("Permission denied");
  });

  test("viewer cannot update appointment status (edit permission)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity: ownerIdentity } =
      await seedTestUser(t);
    const { identity: viewerIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "viewer" },
    );
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const apptId = await t
      .withIdentity(ownerIdentity)
      .action(api.gabinet.appointments.create, {
        organizationId,
        patientId: String(patientId),
        treatmentId: String(treatmentId),
        employeeId: String(userId),
        date: "2026-03-16",
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      });

    await expect(
      t.withIdentity(viewerIdentity).action(
        api.gabinet.appointments.updateStatus,
        {
          organizationId,
          appointmentId: apptId,
          status: "confirmed",
        },
      ),
    ).rejects.toThrow("Permission denied");
  });

  test("member can create an appointment (create:all by default)", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { identity: memberIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "member" },
    );
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const apptId = await t
      .withIdentity(memberIdentity)
      .action(api.gabinet.appointments.create, {
        organizationId,
        patientId: String(patientId),
        treatmentId: String(treatmentId),
        employeeId: String(userId),
        date: "2026-03-16",
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      });

    expect(apptId).toBeTruthy();
  });
});

describe("gabinet_packages RBAC", () => {
  test("viewer cannot create a package", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { identity: viewerIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "viewer" },
    );
    const { treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    await expect(
      t.withIdentity(viewerIdentity).action(api.gabinet.packages.create, {
        organizationId,
        name: "Test Package",
        treatments: [{ treatmentId: String(treatmentId), quantity: 4 }],
        totalPrice: 400,
      }),
    ).rejects.toThrow("Permission denied");
  });

  test("viewer cannot purchase a package for a patient", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity: ownerIdentity } =
      await seedTestUser(t);
    const { identity: viewerIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "viewer" },
    );
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const packageId = await t
      .withIdentity(ownerIdentity)
      .action(api.gabinet.packages.create, {
        organizationId,
        name: "Test Package",
        treatments: [{ treatmentId: String(treatmentId), quantity: 4 }],
        totalPrice: 400,
      });

    await expect(
      t
        .withIdentity(viewerIdentity)
        .action(api.gabinet.packages.purchasePackage, {
          organizationId,
          patientId: String(patientId),
          packageId,
          paidAmount: 400,
          paymentMethod: "cash",
        }),
    ).rejects.toThrow("Permission denied");
  });

  test("viewer cannot use a package treatment session", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity: ownerIdentity } =
      await seedTestUser(t);
    const { identity: viewerIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "viewer" },
    );
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const packageId = await t
      .withIdentity(ownerIdentity)
      .action(api.gabinet.packages.create, {
        organizationId,
        name: "Test Package",
        treatments: [{ treatmentId: String(treatmentId), quantity: 4 }],
        totalPrice: 400,
      });

    const usageId = await t
      .withIdentity(ownerIdentity)
      .action(api.gabinet.packages.purchasePackage, {
        organizationId,
        patientId: String(patientId),
        packageId,
        paidAmount: 400,
        paymentMethod: "cash",
      });

    await expect(
      t
        .withIdentity(viewerIdentity)
        .action(api.gabinet.packages.usePackageTreatment, {
          organizationId,
          usageId,
          treatmentId: String(treatmentId),
        }),
    ).rejects.toThrow("Permission denied");
  });

  test("member can create a package (create:all by default)", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { identity: memberIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "member" },
    );
    const { treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const packageId = await t
      .withIdentity(memberIdentity)
      .action(api.gabinet.packages.create, {
        organizationId,
        name: "Member Package",
        treatments: [{ treatmentId: String(treatmentId), quantity: 2 }],
        totalPrice: 200,
      });

    expect(packageId).toBeTruthy();
  });
});
