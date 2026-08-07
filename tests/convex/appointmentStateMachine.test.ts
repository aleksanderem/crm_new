import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// `finishAllScheduledFunctions` is not safe under the in-memory Supabase mock:
// some side-effect mutations throw (the gabinet completion path inserts into
// `loyaltyTransactions` with a non-Convex id which the validator rejects), and
// the poller then crashes on a null `_scheduled_functions` row. Rely instead
// on the process-wide scheduler-noise filter installed in
// tests/convex/_setup.ts plus the setTimeout(0) yield below to drain the queue.

function createManagedTestCtx() {
  return createTestCtx();
}

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
  // Let any pending setTimeout(0) side-effect callbacks from the test fire
  // against the *current* instance before the next test creates a new one.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

async function createAppointment(
  t: ReturnType<typeof import("convex-test").convexTest>,
  identity: { subject: string; issuer: string; tokenIdentifier: string },
  args: {
    organizationId: any;
    patientId: any;
    treatmentId: any;
    employeeId: any;
    date?: string;
    startTime?: string;
    endTime?: string;
  },
) {
  return t.withIdentity(identity).action(api.gabinet.appointments.create, {
    organizationId: args.organizationId,
    patientId: args.patientId,
    treatmentId: args.treatmentId,
    employeeId: args.employeeId,
    date: args.date ?? "2026-03-16",
    startTime: args.startTime ?? "09:00",
    endTime: args.endTime ?? "09:30",
    // Test fixtures use fixed dates that may already be in the past relative
    // to the test runner's clock — bypass the past-time guard (#1414).
    allowPast: true,
  });
}

async function getAppointment(appointmentId: string) {
  const db = createSupabaseDb();
  return (await db.get("gabinetAppointments", appointmentId)) as
    | (Record<string, unknown> & { status?: string; scheduledActivityId?: string })
    | null;
}

describe("appointment state machine", () => {
  test("new appointment starts as scheduled", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("scheduled");
  });

  test("scheduled -> confirmed", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId: apptId,
      status: "confirmed",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("confirmed");
  });

  test("pending_confirmation -> confirmed", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    const db = createSupabaseDb();
    await db.patch("gabinetAppointments", apptId, {
      status: "pending_confirmation",
      updatedAt: Date.now(),
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId: apptId,
      status: "confirmed",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("confirmed");
  });

  test("confirmed -> in_progress", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("in_progress");
  });

  test("in_progress -> completed", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "completed",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("completed");
  });

  test("scheduled -> cancelled", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "cancelled",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("cancelled");
  });

  test("scheduled -> no_show", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "no_show",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("no_show");
  });

  test("dual write: scheduledActivity created with appointment", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    const appt = await getAppointment(apptId);
    expect(appt?.scheduledActivityId).toBeTruthy();

    const db = createSupabaseDb();
    const activity = (await db.get(
      "scheduledActivities",
      appt!.scheduledActivityId as string,
    )) as Record<string, any> | null;
    expect(activity).toBeTruthy();
    expect(activity?.moduleRef?.moduleId).toBe("gabinet");
    expect(activity?.moduleRef?.entityType).toBe("gabinetAppointment");
    expect(activity?.activityType).toBe("gabinet:appointment");
    expect(activity?.resourceId).toBe(userId);
  });

  test("completing appointment marks scheduledActivity as completed", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "completed",
    });

    const appt = await getAppointment(apptId);
    const db = createSupabaseDb();
    const activity = (await db.get(
      "scheduledActivities",
      appt!.scheduledActivityId as string,
    )) as Record<string, any> | null;
    expect(activity?.isCompleted).toBe(true);
  });

  test("cancellationReason can be edited on an already-cancelled appointment", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.update, {
      organizationId,
      appointmentId: apptId,
      status: "cancelled",
      cancellationReason: "initial reason",
    });
    expect((await getAppointment(apptId))?.cancellationReason).toBe("initial reason");

    await t.withIdentity(identity).action(api.gabinet.appointments.update, {
      organizationId,
      appointmentId: apptId,
      cancellationReason: "corrected reason",
    });
    expect((await getAppointment(apptId))?.cancellationReason).toBe("corrected reason");
  });

  test("cancellationReason can be cleared with null on a cancelled appointment", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.update, {
      organizationId,
      appointmentId: apptId,
      status: "cancelled",
      cancellationReason: "initial reason",
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.update, {
      organizationId,
      appointmentId: apptId,
      cancellationReason: null,
    });
    expect((await getAppointment(apptId))?.cancellationReason).toBeNull();
  });

  test("cancellationReason on a non-cancelled appointment is ignored", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.update, {
      organizationId,
      appointmentId: apptId,
      cancellationReason: "should not stick",
    });
    expect((await getAppointment(apptId))?.cancellationReason).toBeUndefined();
  });

  // --- invalid transitions (same-status) ---

  test("scheduled -> scheduled throws invalid transition error", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await expect(
      t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
        organizationId,
        appointmentId: apptId,
        status: "scheduled",
      }),
    ).rejects.toThrow("Cannot transition from scheduled to scheduled");
  });

  test("completed -> completed throws invalid transition error", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    const db = createSupabaseDb();
    await db.patch("gabinetAppointments", apptId, {
      status: "completed",
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
        organizationId,
        appointmentId: apptId,
        status: "completed",
      }),
    ).rejects.toThrow("Cannot transition from completed to completed");
  });

  test("cancelled -> cancelled throws invalid transition error", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "cancelled",
    });

    await expect(
      t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
        organizationId,
        appointmentId: apptId,
        status: "cancelled",
      }),
    ).rejects.toThrow("Cannot transition from cancelled to cancelled");
  });

  // --- cross-status reverts (manual corrections allowed by MANUAL_TRANSITIONS) ---

  test("completed -> scheduled reverts status (manual correction)", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    const db = createSupabaseDb();
    await db.patch("gabinetAppointments", apptId, {
      status: "completed",
      updatedAt: Date.now(),
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "scheduled",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("scheduled");
  });

  test("cancelled -> scheduled reverts status (manual correction)", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "cancelled",
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "scheduled",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("scheduled");
  });

  test("no_show -> scheduled reverts status (manual correction)", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "no_show",
    });

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "scheduled",
    });

    const appt = await getAppointment(apptId);
    expect(appt?.status).toBe("scheduled");
  });

  test("completed -> scheduled restores one package session", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const packageId = await t.withIdentity(identity).action(
      api.gabinet.packages.create,
      {
        organizationId,
        name: "Revert-to-scheduled test package",
        treatments: [{ treatmentId: String(treatmentId), quantity: 2 }],
        totalPrice: 200,
      },
    );
    const usageId = await t.withIdentity(identity).action(
      api.gabinet.packages.purchasePackage,
      {
        organizationId,
        patientId: String(patientId),
        packageId,
        paidAmount: 200,
        paymentMethod: "cash",
      },
    );

    const apptId = await t.withIdentity(identity).action(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId: String(patientId),
        treatmentId: String(treatmentId),
        employeeId: String(userId),
        date: "2026-03-16",
        startTime: "10:00",
        endTime: "10:30",
        packageUsageId: usageId,
        allowPast: true,
      },
    );

    const db = createSupabaseDb();

    // Drive the appointment to completed — deducts 1 session.
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "completed",
    });

    const usageAfterComplete = await db.get<{
      treatmentsUsed: Array<{ usedCount: number }>;
    }>("gabinetPackageUsage", usageId);
    expect(usageAfterComplete?.treatmentsUsed[0].usedCount).toBe(1);

    // Revert all the way back to scheduled — session should be restored.
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "scheduled",
    });

    expect((await getAppointment(apptId))?.status).toBe("scheduled");

    const usageAfterRevert = await db.get<{
      treatmentsUsed: Array<{ usedCount: number }>;
    }>("gabinetPackageUsage", usageId);
    expect(usageAfterRevert?.treatmentsUsed[0].usedCount).toBe(0);
  });
});
