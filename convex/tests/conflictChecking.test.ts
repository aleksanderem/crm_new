import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../_test_helpers";

describe("conflict checking", () => {
  test("cannot double-book same employee at same time", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Create first appointment 09:00-09:30
    await t.withIdentity(identity).mutation(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
    });

    // Try to create overlapping appointment for same employee
    await expect(
      t.withIdentity(identity).mutation(api.gabinet.appointments.create, {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:15",
        endTime: "09:45",
      }),
    ).rejects.toThrow();
  });

  test("adjacent appointments (no overlap) are allowed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // 09:00-09:30
    await t.withIdentity(identity).mutation(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
    });

    // 09:30-10:00 — immediately after, should be fine
    const apptId = await t.withIdentity(identity).mutation(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:30",
        endTime: "10:00",
      },
    );

    expect(apptId).toBeTruthy();
  });

  test("different employees can have overlapping appointments", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Create a second employee
    const secondEmployee = await t.run(async (ctx) => {
      const secondUserId = await ctx.db.insert("users", {
        name: "Second Doctor",
        email: "doc2@example.com",
      });

      await ctx.db.insert("teamMemberships", {
        organizationId,
        userId: secondUserId,
        role: "member" as const,
        joinedAt: Date.now(),
      });

      await ctx.db.insert("gabinetEmployees", {
        organizationId,
        userId: secondUserId,
        role: "doctor",
        qualifiedTreatmentIds: [treatmentId],
        isActive: true,
        createdBy: userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return secondUserId;
    });

    // Employee 1: 09:00-09:30
    await t.withIdentity(identity).mutation(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
    });

    // Employee 2: same time, should be allowed
    const apptId = await t.withIdentity(identity).mutation(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: secondEmployee,
        date: "2026-03-20",
        startTime: "09:00",
        endTime: "09:30",
      },
    );

    expect(apptId).toBeTruthy();
  });

  test("different dates for same employee are allowed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Day 1
    await t.withIdentity(identity).mutation(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
    });

    // Day 2 — same time, different date
    const apptId = await t.withIdentity(identity).mutation(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-21",
        startTime: "09:00",
        endTime: "09:30",
      },
    );

    expect(apptId).toBeTruthy();
  });

  test("cancelled appointment slot becomes available", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Create and cancel appointment
    const apptId = await t.withIdentity(identity).mutation(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:00",
        endTime: "09:30",
      },
    );

    await t.withIdentity(identity).mutation(api.gabinet.appointments.cancel, {
      organizationId,
      appointmentId: apptId,
    });

    // Same slot should now be available
    const newApptId = await t.withIdentity(identity).mutation(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:00",
        endTime: "09:30",
      },
    );

    expect(newApptId).toBeTruthy();
  });
});
