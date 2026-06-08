import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../../convex/_test_helpers";

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
  // The process-wide scheduler-noise filter in tests/convex/_setup.ts swallows
  // any orphan-write/null-state rejections that still escape.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

describe("conflict checking", () => {
  test("cannot double-book same employee at same time", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Create first appointment 09:00-09:30
    await t.withIdentity(identity).action(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
      allowPast: true,
    });

    // Try to create overlapping appointment for same employee
    await expect(
      t.withIdentity(identity).action(api.gabinet.appointments.create, {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:15",
        endTime: "09:45",
        allowPast: true,
      }),
    ).rejects.toThrow();
  });

  test("adjacent appointments (no overlap) are allowed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // 09:00-09:30
    await t.withIdentity(identity).action(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
      allowPast: true,
    });

    // 09:30-10:00 — immediately after, should be fine
    const apptId = await t.withIdentity(identity).action(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:30",
        endTime: "10:00",
        allowPast: true,
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
    await t.withIdentity(identity).action(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
      allowPast: true,
    });

    // Employee 2: same time, should be allowed
    const apptId = await t.withIdentity(identity).action(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: secondEmployee,
        date: "2026-03-20",
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      },
    );

    expect(apptId).toBeTruthy();
  });

  test("different dates for same employee are allowed", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Day 1
    await t.withIdentity(identity).action(api.gabinet.appointments.create, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      date: "2026-03-20",
      startTime: "09:00",
      endTime: "09:30",
      allowPast: true,
    });

    // Day 2 — same time, different date
    const apptId = await t.withIdentity(identity).action(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-21",
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      },
    );

    expect(apptId).toBeTruthy();
  });

  test("cancelled appointment slot becomes available", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Create and cancel appointment
    const apptId = await t.withIdentity(identity).action(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      },
    );

    await t.withIdentity(identity).action(api.gabinet.appointments.cancel, {
      organizationId,
      appointmentId: apptId,
    });

    // Same slot should now be available
    const newApptId = await t.withIdentity(identity).action(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-03-20",
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      },
    );

    expect(newApptId).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Past-time guard (issue #1414)
  // ---------------------------------------------------------------------------

  test("rejects appointment whose start time is in the past", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Pick a date 1 day in the past relative to the test runner's clock so
    // the comparison is robust against timezone drift between the runtime's
    // local interpretation of `date+startTime` and `Date.now()`.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yyyy = yesterday.getUTCFullYear();
    const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getUTCDate()).padStart(2, "0");
    const pastDate = `${yyyy}-${mm}-${dd}`;

    await expect(
      t.withIdentity(identity).action(api.gabinet.appointments.create, {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: pastDate,
        startTime: "09:00",
        endTime: "09:30",
      }),
    ).rejects.toThrow(/past/i);
  });

  test("allowPast bypasses the past-time guard (walk-in flow)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yyyy = yesterday.getUTCFullYear();
    const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getUTCDate()).padStart(2, "0");
    const pastDate = `${yyyy}-${mm}-${dd}`;

    const apptId = await t.withIdentity(identity).action(
      api.gabinet.appointments.create,
      {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: pastDate,
        startTime: "09:00",
        endTime: "09:30",
        allowPast: true,
      },
    );

    expect(apptId).toBeTruthy();
  });
});
