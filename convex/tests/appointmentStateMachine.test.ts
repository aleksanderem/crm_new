import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../_test_helpers";

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
  return t.withIdentity(identity).mutation(api.gabinet.appointments.create, {
    organizationId: args.organizationId,
    patientId: args.patientId,
    treatmentId: args.treatmentId,
    employeeId: args.employeeId,
    date: args.date ?? "2026-03-15",
    startTime: args.startTime ?? "09:00",
    endTime: args.endTime ?? "09:30",
  });
}

describe("appointment state machine", () => {
  test("new appointment starts as scheduled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(appt?.status).toBe("scheduled");
  });

  test("scheduled -> confirmed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId: apptId,
      status: "confirmed",
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(appt?.status).toBe("confirmed");
  });

  test("confirmed -> in_progress", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(appt?.status).toBe("in_progress");
  });

  test("in_progress -> completed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "completed",
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(appt?.status).toBe("completed");
  });

  test("scheduled -> cancelled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "cancelled",
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(appt?.status).toBe("cancelled");
  });

  test("scheduled -> no_show", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "no_show",
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(appt?.status).toBe("no_show");
  });

  // Invalid transitions
  test("cannot go scheduled -> completed directly", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await expect(
      t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
        organizationId, appointmentId: apptId, status: "completed",
      }),
    ).rejects.toThrow("Cannot transition from scheduled to completed");
  });

  test("cannot go scheduled -> in_progress directly", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await expect(
      t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
        organizationId, appointmentId: apptId, status: "in_progress",
      }),
    ).rejects.toThrow("Cannot transition from scheduled to in_progress");
  });

  test("cannot transition from completed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    // Go through full lifecycle
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "completed",
    });

    // Try any further transition — should fail
    await expect(
      t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
        organizationId, appointmentId: apptId, status: "cancelled",
      }),
    ).rejects.toThrow("Cannot transition from completed to cancelled");
  });

  test("cannot transition from cancelled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "cancelled",
    });

    await expect(
      t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
        organizationId, appointmentId: apptId, status: "scheduled",
      }),
    ).rejects.toThrow("Cannot transition from cancelled to scheduled");
  });

  test("dual write: scheduledActivity created with appointment", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(appt?.scheduledActivityId).toBeTruthy();

    const activity = await t.run(async (ctx) =>
      ctx.db.get(appt!.scheduledActivityId!),
    );
    expect(activity).toBeTruthy();
    expect(activity?.moduleRef?.moduleId).toBe("gabinet");
    expect(activity?.moduleRef?.entityType).toBe("gabinetAppointment");
    expect(activity?.activityType).toBe("gabinet:appointment");
    expect(activity?.resourceId).toBe(userId);
  });

  test("completing appointment marks scheduledActivity as completed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const apptId = await createAppointment(t, identity, {
      organizationId, patientId, treatmentId, employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "confirmed",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "in_progress",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId, appointmentId: apptId, status: "completed",
    });

    const appt = await t.run(async (ctx) => ctx.db.get(apptId));
    const activity = await t.run(async (ctx) =>
      ctx.db.get(appt!.scheduledActivityId!),
    );
    expect(activity?.isCompleted).toBe(true);
  });
});
