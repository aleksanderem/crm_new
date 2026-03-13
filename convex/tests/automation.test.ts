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

async function setPatientEmail(
  t: ReturnType<typeof import("convex-test").convexTest>,
  patientId: any,
  email: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.patch(patientId, {
      email,
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

  test("listEventCatalog returns registry-backed trigger metadata and payload variables", async () => {
    const t = createManagedTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const catalog = await t.withIdentity(identity).query(api.automation.listEventCatalog, {
      organizationId,
    });

    const appointmentCreated = catalog.find(
      (entry) => entry.eventType === "gabinet.appointment.created",
    );
    expect(appointmentCreated).toBeTruthy();
    expect(appointmentCreated?.source).toBe("domain_event");
    expect(appointmentCreated?.entityType).toBe("gabinetAppointment");
    expect(appointmentCreated?.samplePayload).toBeTruthy();
    expect(appointmentCreated?.variableCatalog.some((v) => v.path === "patientPhone")).toBe(
      true,
    );

    const smsReply = catalog.find(
      (entry) => entry.eventType === "gabinet.appointment.sms_reply_received",
    );
    expect(smsReply?.source).toBe("communication_reply");
    expect(smsReply?.variableCatalog.some((v) => v.path === "parsedIntent")).toBe(true);
  });

  test("listActionCapabilities exposes always-visible capability metadata and listActionTypes keeps compatible available actions", async () => {
    const t = createManagedTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    const baseCapabilities = await t
      .withIdentity(identity)
      .query(api.automation.listActionCapabilities, {
        organizationId,
      });
    expect(baseCapabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "send_email",
          available: false,
          availability: "config_required",
          contentModes: ["template", "manual"],
        }),
        expect.objectContaining({
          type: "send_sms",
          available: false,
          availability: "config_required",
        }),
        expect.objectContaining({
          type: "send_sms_request",
          available: false,
          availability: "config_required",
        }),
        expect.objectContaining({
          type: "update_field",
          available: true,
          availability: "available",
        }),
      ]),
    );

    const baseActions = await t.withIdentity(identity).query(api.automation.listActionTypes, {
      organizationId,
    });
    expect(baseActions).toEqual([
      "create_notification",
      "write_activity",
      "update_field",
    ]);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("emailAccounts", {
        organizationId,
        fromName: "Clinic",
        fromEmail: "clinic@example.com",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    const emailCapabilities = await t
      .withIdentity(identity)
      .query(api.automation.listActionCapabilities, {
        organizationId,
      });
    expect(
      emailCapabilities.find((capability) => capability.type === "send_email"),
    ).toEqual(
      expect.objectContaining({
        type: "send_email",
        available: true,
        availability: "available",
        recipientModes: ["patient_email"],
        contentModes: ["template", "manual"],
      }),
    );

    const emailActions = await t.withIdentity(identity).query(api.automation.listActionTypes, {
      organizationId,
    });
    expect(emailActions).toContain("send_email");
    expect(emailActions).not.toContain("send_sms");
    expect(emailActions).not.toContain("send_sms_request");

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("orgSmsConfig", {
        organizationId,
        provider: "twilio",
        apiToken: "test_sid",
        apiSecret: "test_secret",
        fromNumber: "+48111222333",
        senderId: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    const smsCapabilities = await t
      .withIdentity(identity)
      .query(api.automation.listActionCapabilities, {
        organizationId,
      });
    expect(
      smsCapabilities.find((capability) => capability.type === "send_sms_request"),
    ).toEqual(
      expect.objectContaining({
        type: "send_sms_request",
        available: true,
        availability: "available",
        recipientModes: ["patient_phone"],
      }),
    );

    const smsActions = await t.withIdentity(identity).query(api.automation.listActionTypes, {
      organizationId,
    });
    expect(smsActions).toEqual(
      expect.arrayContaining([
        "send_email",
        "send_sms",
        "send_sms_request",
        "create_notification",
        "write_activity",
        "update_field",
      ]),
    );
  });

  test("createRule accepts graph fields and listRules returns legacy-compatible trigger", async () => {
    const t = createManagedTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Graph rule",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      trigger: {
        module: "gabinet",
        eventType: "gabinet.appointment.created",
        entityType: "gabinetAppointment",
        source: "domain_event",
        label: "Appointment created",
      },
      graph: {
        nodes: [
          {
            id: "trigger-1",
            type: "trigger",
            positionX: 0,
            positionY: 0,
            trigger: {
              module: "gabinet",
              eventType: "gabinet.appointment.created",
              entityType: "gabinetAppointment",
              source: "domain_event",
              label: "Appointment created",
            },
          },
        ],
        edges: [],
      },
      definitionVersion: 2,
      conditions: [],
      actions: [
        {
          type: "create_notification",
          userIdPath: "employeeId",
          titleTemplate: "Created",
          messageTemplate: "Appointment created",
        },
      ],
      enabled: true,
    });

    await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Legacy triggerless rule",
      module: "gabinet",
      eventType: "gabinet.appointment.updated",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "create_notification",
          userIdPath: "employeeId",
          titleTemplate: "Updated",
          messageTemplate: "Appointment updated",
        },
      ],
      enabled: true,
    });

    const rules = await t.withIdentity(identity).query(api.automation.listRules, {
      organizationId,
      module: "gabinet",
    });

    const graphRule = rules.find((rule) => rule.name === "Graph rule");
    expect(graphRule?.definitionVersion).toBe(2);
    expect(graphRule?.trigger?.source).toBe("domain_event");
    expect(graphRule?.graph?.nodes).toHaveLength(1);

    const legacyRule = rules.find((rule) => rule.name === "Legacy triggerless rule");
    expect(legacyRule?.trigger).toBeTruthy();
    expect(legacyRule?.trigger?.eventType).toBe("gabinet.appointment.updated");
    expect(legacyRule?.trigger?.source).toBe("domain_event");
  });

  test("appointment created event processes manual email action and stores sent email record", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientEmail(t, patientId, "jan@example.com");
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("emailAccounts", {
        organizationId,
        fromName: "Clinic",
        fromEmail: "clinic@example.com",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Send manual email",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "send_email",
          mode: "manual",
          recipientEmailPath: "patientEmail",
          recipientNamePath: "patientName",
          subjectTemplate: "Wizyta dla {{patientName}}",
          bodyTemplate: "<p>{{patientName}} ma wizytę {{date}} o {{startTime}}.</p>",
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
    const emails = await t.run(async (ctx) =>
      ctx.db
        .query("emails")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect(),
    );

    expect(run?.status).toBe("processed");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe("processed");
    expect(steps[0]?.actionType).toBe("send_email");
    expect(steps[0]?.recipient).toBe("jan@example.com");
    expect(steps[0]?.linkedEntityType).toBe("email");
    expect(steps[0]?.renderedSubject).toBe("Wizyta dla Jan Kowalski");
    expect(steps[0]?.renderedBody).toContain("Jan Kowalski ma wizytę 2026-03-17 o 10:00.");
    expect(
      emails.some(
        (email) =>
          email.subject === "Wizyta dla Jan Kowalski" &&
          email.to.includes("jan@example.com") &&
          email.bodyHtml?.includes("2026-03-17 o 10:00"),
      ),
    ).toBe(true);
  });

  test("appointment created event processes template email action with gabinet source variables", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientEmail(t, patientId, "jan@example.com");
    const templateId = await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("emailAccounts", {
        organizationId,
        fromName: "Clinic",
        fromEmail: "clinic@example.com",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      return ctx.db.insert("emailTemplates", {
        organizationId,
        name: "Appointment follow-up",
        subject: "Szablon {{patient.fullName}}",
        body: "<p>{{patient.email}}</p>",
        variables: [],
        createdBy: userId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Send template email",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "send_email",
          mode: "template",
          templateId,
          recipientEmailPath: "patientEmail",
          recipientNamePath: "patientName",
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
    const emails = await t.run(async (ctx) =>
      ctx.db
        .query("emails")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect(),
    );

    expect(run?.status).toBe("processed");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe("processed");
    expect(steps[0]?.actionType).toBe("send_email");
    expect(steps[0]?.renderedSubject).toBe("Szablon Jan Kowalski");
    expect(steps[0]?.renderedBody).toContain("jan@example.com");
    expect(
      emails.some(
        (email) =>
          email.subject === "Szablon Jan Kowalski" &&
          email.to.includes("jan@example.com") &&
          email.bodyHtml?.includes("jan@example.com"),
      ),
    ).toBe(true);
  });

  test("appointment created event processes update_field action for patient custom fields", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await t.withIdentity(identity).mutation(api.automation.createRule, {
      organizationId,
      name: "Tag patient from automation",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "update_field",
          targetEntityType: "gabinetPatient",
          fieldKind: "custom",
          fieldKey: "automationTag",
          valueTemplate: "{{patientName}} {{date}}",
          valueType: "string",
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
    const patient = await t.run(async (ctx) => ctx.db.get(patientId));

    expect(run?.status).toBe("processed");
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe("processed");
    expect(steps[0]?.actionType).toBe("update_field");
    expect(steps[0]?.linkedEntityType).toBe("gabinetPatient");
    expect(steps[0]?.linkedEntityId).toBe(String(patientId));
    expect(steps[0]?.renderedBody).toBe("custom:automationTag=Jan Kowalski 2026-03-17");
    expect((patient?.customFields as Record<string, unknown> | undefined)?.automationTag).toBe(
      "Jan Kowalski 2026-03-17",
    );
  });

  test("send_sms_request action stays compatible with legacy SMS execution path", async () => {
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
      name: "Send request SMS",
      module: "gabinet",
      eventType: "gabinet.appointment.created",
      entityType: "gabinetAppointment",
      conditions: [],
      actions: [
        {
          type: "send_sms_request",
          phonePath: "patientPhone",
          messageTemplate: "{{patientName}}, potwierdź wizytę {{date}} {{startTime}}.",
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

    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe("processed");
    expect(steps[0]?.actionType).toBe("send_sms_request");
  });
});
