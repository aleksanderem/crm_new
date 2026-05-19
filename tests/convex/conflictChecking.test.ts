import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../../convex/_test_helpers";

// Conflict-checking tests assert on the create action's reject/resolve
// behavior. The action also `runAfter(0, …)` schedules side-effect jobs
// (SMS, automation events, reminders). convex-test runs those via
// `setTimeout(0, …)` against a `global.Convex` reference; once the next
// test creates a fresh test instance, the orphan callbacks from the
// previous test fire against the new `global.Convex` and surface as
// "Write outside of transaction" / null-state unhandled rejections that
// fail the suite (even though every assertion in the test passed).
//
// Same pattern as appointmentStateMachine.test.ts: install a per-file
// unhandledRejection filter that silently consumes ONLY the two known
// convex-test scheduler error shapes. Unknown rejections fall through.
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
      },
    );

    expect(newApptId).toBeTruthy();
  });
});
