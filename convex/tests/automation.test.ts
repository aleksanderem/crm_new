import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import {
  createTestCtx,
  seedGabinetPrereqs,
  seedSecondUser,
  seedTestUser,
} from "../_test_helpers";

const activeContexts = new Set<ReturnType<typeof createTestCtx>>();

function createManagedTestCtx() {
  const t = createTestCtx();
  activeContexts.add(t);
  return t;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ sid: "SM_TEST_AUTOMATION" }),
    })) as unknown as typeof fetch,
  );
});

afterEach(async () => {
  for (const t of activeContexts) {
    await t.finishAllScheduledFunctions(() => {
      vi.runAllTimers();
    });
  }
  activeContexts.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function flushScheduled(
  t: ReturnType<typeof import("convex-test").convexTest>,
) {
  await t.finishAllScheduledFunctions(() => {
    vi.runAllTimers();
  });
}

async function setPatientPhone(
  t: ReturnType<typeof import("convex-test").convexTest>,
  patientId: any,
  phone: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(patientId, {
      phone,
      updatedAt: Date.now(),
    });
  });
}

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
    date: args.date ?? "2026-03-17",
    startTime: args.startTime ?? "10:00",
    endTime: args.endTime ?? "10:30",
  });
}

describe("automation lifecycle", () => {
  test("createRule persists the expected rule shape", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const ruleId = await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Appointment SMS",
      description: "Send patient SMS after appointment creation",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "send_sms",
          phonePath: "patientPhone",
          messageTemplate: "{{patientName}} {{date}} {{startTime}}",
        },
      ],
      enabled: true,
    });

    const rule = await t.run(async (ctx) => ctx.db.get(ruleId));

    expect(rule?._id).toBe(ruleId);
    expect(rule?.organizationId).toBe(organizationId);
    expect(rule?.createdBy).toBe(userId);
    expect(rule?.module).toBe("gabinet");
    expect(rule?.eventType).toBe("gabinet.appointment.created");
    expect(rule?.entityType).toBe("gabinetAppointment");
    expect(rule?.conditions).toEqual([]);
    expect(rule?.actions).toEqual([
      {
        type: "send_sms",
        phonePath: "patientPhone",
        messageTemplate: "{{patientName}} {{date}} {{startTime}}",
      },
    ]);
    expect(rule?.enabled).toBe(true);
    expect(typeof rule?.createdAt).toBe("number");
    expect(typeof rule?.updatedAt).toBe("number");
  });

  test("updateRule changes enabled flag and editable fields", async () => {
    const t = createManagedTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const ruleId = await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Initial rule",
      description: "Before update",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "create_notification",
          userIdPath: "employeeId",
          titleTemplate: "Initial title",
          messageTemplate: "Initial message",
        },
      ],
      enabled: true,
    });

    await t.withIdentity(identity).mutation(api.automation.updateRule, {
      organizationId,
      ruleId,
      name: "Updated rule",
      description: "After update",
      enabled: false,
      eventType: "gabinet.appointment.status_changed",
      actions: [
        {
          type: "create_notification",
          userIdPath: "employeeId",
          titleTemplate: "Updated title",
          messageTemplate: "Updated message",
          linkTemplate: "/dashboard/gabinet/appointments/{{appointmentId}}",
        },
      ],
    });

    const rule = await t.run(async (ctx) => ctx.db.get(ruleId));

    expect(rule?.name).toBe("Updated rule");
    expect(rule?.description).toBe("After update");
    expect(rule?.enabled).toBe(false);
    expect(rule?.eventType).toBe("gabinet.appointment.status_changed");
    expect(rule?.actions).toEqual([
      {
        type: "create_notification",
        userIdPath: "employeeId",
        titleTemplate: "Updated title",
        messageTemplate: "Updated message",
        linkTemplate: "/dashboard/gabinet/appointments/{{appointmentId}}",
      },
    ]);
  });

  test("deleteRule removes only the targeted org-owned rule", async () => {
    const t = createManagedTestCtx();
    const firstUser = await seedTestUser(t);
    const secondUser = await seedSecondUser(t, firstUser.organizationId);
    const otherOrg = await seedTestUser(t);

    const keepRuleId = await t.withIdentity(firstUser.identity).mutation(api.automation.createRule, {
      organizationId: firstUser.organizationId,
      name: "Keep me",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "create_notification",
          userIdPath: "employeeId",
          titleTemplate: "Keep title",
          messageTemplate: "Keep message",
        },
      ],
      enabled: true,
    });

    const deleteRuleId = await t.withIdentity(secondUser.identity).mutation(api.automation.createRule, {
      organizationId: firstUser.organizationId,
      name: "Delete me",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "send_sms",
          phonePath: "patientPhone",
          messageTemplate: "Delete message",
        },
      ],
      enabled: true,
    });

    const otherOrgRuleId = await t.withIdentity(otherOrg.identity).mutation(api.automation.createRule, {
      organizationId: otherOrg.organizationId,
      name: "Other org",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "send_sms",
          phonePath: "patientPhone",
          messageTemplate: "Other org message",
        },
      ],
      enabled: true,
    });

    await expect(
      t.withIdentity(firstUser.identity).mutation(api.automation.deleteRule, {
        organizationId: firstUser.organizationId,
        ruleId: otherOrgRuleId,
      }),
    ).rejects.toThrow("Automation rule not found");

    await t.withIdentity(firstUser.identity).mutation(api.automation.deleteRule, {
      organizationId: firstUser.organizationId,
      ruleId: deleteRuleId,
    });

    const deletedRule = await t.run(async (ctx) => ctx.db.get(deleteRuleId));
    const keptRule = await t.run(async (ctx) => ctx.db.get(keepRuleId));
    const otherRule = await t.run(async (ctx) => ctx.db.get(otherOrgRuleId));

    expect(deletedRule).toBeNull();
    expect(keptRule?._id).toBe(keepRuleId);
    expect(otherRule?._id).toBe(otherOrgRuleId);
  });

  test("appointment created event processes notification preset and records a processed run", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Notify employee",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "create_notification",
          userIdPath: "employeeId",
          titleTemplate: "Nowa wizyta: {{patientName}}",
          messageTemplate: "{{patientName}} ma wizytę {{date}} o {{startTime}}.",
          linkTemplate: "/dashboard/gabinet/appointments/{{appointmentId}}",
        },
      ],
      enabled: true,
    });

    const appointmentId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    await flushScheduled(t);

    const runs = await t.withIdentity(identity).query(api.automation.listRuns, {
      organizationId,
      module: "gabinet",
      entityType: "gabinetAppointment",
      entityId: String(appointmentId),
      limit: 10,
    });
    const run = runs.find((item) => item.eventType === "gabinet.appointment.created");
    const steps = run
      ? await t.withIdentity(identity).query(api.automation.getRunSteps, {
          organizationId,
          runId: run._id,
        })
      : [];
    const notifications = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect(),
    );

    expect(run?.status).toBe("processed");
    expect(run?.ruleId).toBeTruthy();
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe("processed");
    expect(steps[0]?.actionType).toBe("create_notification");
    expect(notifications.some((notification) => notification.userId === userId)).toBe(true);
    expect(
      notifications.some((notification) =>
        notification.title.includes("Nowa wizyta: Jan Kowalski"),
      ),
    ).toBe(true);
  });

  test("appointment created event processes SMS preset and stores step outcome", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientPhone(t, patientId, "500600700");

    await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Send patient SMS",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "send_sms",
          phonePath: "patientPhone",
          messageTemplate:
            "{{patientName}}, masz wizytę {{date}} o {{startTime}}.",
        },
      ],
      enabled: true,
    });

    const appointmentId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    await flushScheduled(t);

    const runs = await t.withIdentity(identity).query(api.automation.listRuns, {
      organizationId,
      module: "gabinet",
      entityType: "gabinetAppointment",
      entityId: String(appointmentId),
      limit: 10,
    });
    const run = runs.find((item) => item.eventType === "gabinet.appointment.created");
    const steps = run
      ? await t.withIdentity(identity).query(api.automation.getRunSteps, {
          organizationId,
          runId: run._id,
        })
      : [];
    const smsEvents = await t.run(async (ctx) =>
      ctx.db
        .query("appointmentSmsEvents")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
        .collect(),
    );

    expect(run?.status).toBe("processed");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe("processed");
    expect(steps[0]?.actionType).toBe("send_sms");
    expect(steps[0]?.recipient).toBe("500600700");
    expect(
      smsEvents.some(
        (event) =>
          event.direction === "outbound" &&
          event.eventType === "appointment_confirmation_request" &&
          event.rawBody?.includes("Jan Kowalski"),
      ),
    ).toBe(true);
  });
});
