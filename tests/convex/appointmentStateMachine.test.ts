import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// State-machine tests assert on appointment status only. The action handler
// writes the status synchronously, but it also `runAfter(0, …)` schedules
// side-effect jobs (SMS, automation events, reminder cancellation, …).
// convex-test runs those via `setTimeout(0, …)` against a `global.Convex`
// reference; once the next test creates a fresh test instance, the orphan
// callbacks from the previous test fire against the new `global.Convex` and
// surface as "Write outside of transaction" / null-state unhandled rejections
// that fail the suite (even though every assertion in the test passed).
//
// `finishAllScheduledFunctions` is not safe here either: under the in-memory
// Supabase mock some side-effect mutations throw (the gabinet completion path
// inserts into `loyaltyTransactions` with a non-Convex id, which the
// validator rejects), and the poller crashes on that null state.
//
// So we install a per-file unhandledRejection filter that silently consumes
// ONLY the two known convex-test scheduler error shapes. Unknown rejections
// fall through and are still surfaced by vitest's own listener.
const SCHEDULER_NOISE = [
  /Write outside of transaction \d+;_scheduled_functions/,
  /Cannot read properties of null \(reading 'state'\)/,
];

function onUnhandledRejection(reason: unknown) {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (SCHEDULER_NOISE.some((re) => re.test(msg))) return;
  // Other rejections are left to vitest's own listener.
}

beforeAll(() => {
  process.on("unhandledRejection", onUnhandledRejection);
});

afterAll(() => {
  process.off("unhandledRejection", onUnhandledRejection);
});

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
  // Anything still queued past this yield is handled by the swallower above.
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

  // Invalid transitions
  test("cannot transition from completed", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    // Go through full lifecycle
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "completed",
    });

    // Try any further transition — should fail
    await expect(
      t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
        organizationId, appointmentId: apptId, status: "cancelled",
      }),
    ).rejects.toThrow("Cannot transition from completed to cancelled");
  });

  test("cannot transition from cancelled", async () => {
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
        organizationId, appointmentId: apptId, status: "scheduled",
      }),
    ).rejects.toThrow("Cannot transition from cancelled to scheduled");
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
});
