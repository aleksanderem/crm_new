import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
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
      text: async () => JSON.stringify({ sid: "SM_TEST_123" }),
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

async function linkPatientToContact(
  t: ReturnType<typeof import("convex-test").convexTest>,
  args: {
    organizationId: any;
    patientId: any;
    userId: any;
  },
) {
  return await t.run(async (ctx) => {
    const contactId = await ctx.db.insert("contacts", {
      organizationId: args.organizationId,
      firstName: "Jan",
      lastName: "Kowalski",
      email: "jan.contact@example.com",
      phone: "+48500600700",
      createdBy: args.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.patch(args.patientId, {
      contactId,
      updatedAt: Date.now(),
    });

    return contactId;
  });
}

async function listActivitiesForEntity(
  t: ReturnType<typeof import("convex-test").convexTest>,
  entityType: string,
  entityId: string,
) {
  return await t.run(async (ctx) => {
    const activities = await ctx.db.query("activities").collect();
    return activities.filter(
      (activity) =>
        activity.entityType === entityType && activity.entityId === entityId,
    );
  });
}

async function createLead(
  t: ReturnType<typeof import("convex-test").convexTest>,
  args: {
    organizationId: any;
    userId: any;
  },
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("leads", {
      organizationId: args.organizationId,
      title: "SMS lead should stay untouched",
      status: "open",
      createdBy: args.userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

async function seedSmsConfig(
  t: ReturnType<typeof import("convex-test").convexTest>,
  organizationId: any,
) {
  const fromNumber = "+48111222333";

  await t.run(async (ctx) => {
    await ctx.db.insert("orgSmsConfig", {
      organizationId,
      provider: "twilio",
      apiToken: "test-account-sid",
      apiSecret: "test-auth-token",
      fromNumber,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  return { fromNumber };
}

async function seedOutboundConfirmationEvent(
  t: ReturnType<typeof import("convex-test").convexTest>,
  args: {
    organizationId: any;
    appointmentId: any;
    patientId: any;
    normalizedPhone: string;
  },
) {
  const createdAt = Date.now() - 1_000;

  return await t.run(async (ctx) => {
    return await ctx.db.insert("appointmentSmsEvents", {
      organizationId: args.organizationId,
      appointmentId: args.appointmentId,
      patientId: args.patientId,
      normalizedPhone: args.normalizedPhone,
      direction: "outbound",
      provider: "twilio",
      eventType: "appointment_confirmation_request",
      providerMessageId: "outbound-message-1",
      correlationKey: `appointment-confirmation:${args.appointmentId}`,
      rawBody:
        "Prosimy potwierdzić wizytę. Odpowiedz TAK aby potwierdzić, NIE aby odwołać.",
      normalizedBody:
        "PROSIMY POTWIERDZIC WIZYTE. ODPOWIEDZ TAK ABY POTWIERDZIC, NIE ABY ODWOLAC.",
      processingStatus: "processed",
      idempotencyKey: `outbound:${args.appointmentId}`,
      processedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    });
  });
}

describe("appointment SMS flow", () => {
  test("queueConfirmationRequest persists outbound confirmation event", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientPhone(t, patientId, "500 600 700");
    const contactId = await linkPatientToContact(t, {
      organizationId,
      patientId,
      userId,
    });
    const leadId = await createLead(t, { organizationId, userId });
    await seedSmsConfig(t, organizationId);

    const appointmentId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    const eventId = await t.mutation(
      internal.gabinet.appointmentSms.queueConfirmationRequest,
      {
        organizationId,
        appointmentId,
        trigger: "manual",
      },
    );

    const event = await t.run(async (ctx) =>
      eventId ? ctx.db.get(eventId) : null,
    );

    expect(eventId).toBeTruthy();
    expect(event?.appointmentId).toBe(appointmentId);
    expect(event?.direction).toBe("outbound");
    expect(event?.eventType).toBe("appointment_confirmation_request");
    expect(event?.normalizedPhone).toBe("+48500600700");
    expect(event?.provider).toBe("twilio");
    expect(event?.correlationKey).toBe(`appointment-confirmation:${appointmentId}`);
    expect(event?.rawBody).toContain("TAK");
    expect(event?.rawBody).toContain("NIE");

    const appointmentActivities = await listActivitiesForEntity(
      t,
      "gabinetAppointment",
      appointmentId,
    );
    const patientActivities = await listActivitiesForEntity(
      t,
      "gabinetPatient",
      patientId,
    );
    const contactActivities = await listActivitiesForEntity(t, "contact", contactId);
    const leadActivities = await listActivitiesForEntity(t, "lead", leadId);

    expect(appointmentActivities.some((a) => a.action === "sms_sent")).toBe(true);
    expect(patientActivities.some((a) => a.action === "sms_sent")).toBe(true);
    expect(contactActivities.some((a) => a.action === "sms_sent")).toBe(true);
    expect(leadActivities).toHaveLength(0);
  });

  test("inbound TAK confirms appointment exactly once for duplicate webhook retries", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientPhone(t, patientId, "500600700");
    const contactId = await linkPatientToContact(t, {
      organizationId,
      patientId,
      userId,
    });
    const { fromNumber } = await seedSmsConfig(t, organizationId);

    const appointmentId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(appointmentId, {
        status: "pending_confirmation",
        updatedAt: Date.now(),
      });
    });

    const outboundEventId = await seedOutboundConfirmationEvent(t, {
      organizationId,
      appointmentId,
      patientId,
      normalizedPhone: "+48500600700",
    });

    const firstResult = await t.mutation(
      internal.gabinet.appointmentSms.processIncomingMessage,
      {
        provider: "twilio",
        to: "+48 111 222 333",
        from: "500 600 700",
        body: "tak",
        providerMessageId: "inbound-message-1",
        webhookSignatureVerified: true,
        idempotencyKey: "twilio:webhook:1",
      },
    );

    const secondResult = await t.mutation(
      internal.gabinet.appointmentSms.processIncomingMessage,
      {
        provider: "twilio",
        to: fromNumber,
        from: "+48 500 600 700",
        body: "TAK",
        providerMessageId: "inbound-message-1-retry",
        webhookSignatureVerified: true,
        idempotencyKey: "twilio:webhook:1",
      },
    );

    const appointment = await t.run(async (ctx) => ctx.db.get(appointmentId));
    const smsEvents = await t.run(async (ctx) =>
      ctx.db
        .query("appointmentSmsEvents")
        .withIndex("by_appointment", (q) => q.eq("appointmentId", appointmentId))
        .collect(),
    );
    const inboundEvent = smsEvents.find((event) => event.direction === "inbound");

    expect(firstResult.duplicate).toBe(false);
    expect(firstResult.processingStatus).toBe("processed");
    expect(firstResult.appointmentId).toBe(appointmentId);
    expect(secondResult.duplicate).toBe(true);
    expect(secondResult.eventId).toBe(firstResult.eventId);
    expect(appointment?.status).toBe("confirmed");
    expect(smsEvents).toHaveLength(2);
    expect(inboundEvent?.replyToEventId).toBe(outboundEventId);
    expect(inboundEvent?.parsedIntent).toBe("confirm");
    expect(inboundEvent?.processingStatus).toBe("processed");

    const appointmentActivities = await listActivitiesForEntity(
      t,
      "gabinetAppointment",
      appointmentId,
    );
    const patientActivities = await listActivitiesForEntity(
      t,
      "gabinetPatient",
      patientId,
    );
    const contactActivities = await listActivitiesForEntity(t, "contact", contactId);

    expect(appointmentActivities.filter((a) => a.action === "sms_received")).toHaveLength(1);
    expect(patientActivities.filter((a) => a.action === "sms_received")).toHaveLength(1);
    expect(contactActivities.filter((a) => a.action === "sms_received")).toHaveLength(1);
    expect(appointmentActivities.some((a) => a.action === "status_changed")).toBe(true);
  });

  test("inbound NIE cancels appointment and records audit plus notification side effects", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { userId: creatorId } = await seedSecondUser(t, organizationId);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientPhone(t, patientId, "500600700");
    const { fromNumber } = await seedSmsConfig(t, organizationId);

    const appointmentId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(appointmentId, {
        status: "pending_confirmation",
        createdBy: creatorId,
        updatedAt: Date.now(),
      });
    });

    await seedOutboundConfirmationEvent(t, {
      organizationId,
      appointmentId,
      patientId,
      normalizedPhone: "+48500600700",
    });

    const result = await t.mutation(
      internal.gabinet.appointmentSms.processIncomingMessage,
      {
        provider: "twilio",
        to: fromNumber,
        from: "500600700",
        body: "NIE",
        providerMessageId: "inbound-message-2",
        webhookSignatureVerified: true,
        idempotencyKey: "twilio:webhook:2",
      },
    );

    const appointment = await t.run(async (ctx) => ctx.db.get(appointmentId));
    const inboundEvent = await t.run(async (ctx) =>
      result.eventId ? ctx.db.get(result.eventId) : null,
    );
    const auditEntries = await t.run(async (ctx) => ctx.db.query("auditLog").collect());
    const notifications = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect(),
    );

    expect(result.processingStatus).toBe("processed");
    expect(appointment?.status).toBe("cancelled");
    expect(appointment?.cancellationReason).toBe("Cancelled by patient SMS reply");
    expect(inboundEvent?.processingStatus).toBe("processed");
    expect(
      auditEntries.some((entry) => entry.action === "status_changed_via_sms"),
    ).toBe(true);
    expect(
      notifications.some(
        (notification) =>
          notification.userId === creatorId &&
          notification.title.includes("Appointment cancelled via SMS"),
      ),
    ).toBe(true);
  });

  test("terminal-state replies are recorded but do not mutate appointment state", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientPhone(t, patientId, "500600700");
    const { fromNumber } = await seedSmsConfig(t, organizationId);

    const appointmentId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId,
      status: "confirmed",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId,
      status: "in_progress",
    });
    await t.withIdentity(identity).mutation(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId,
      status: "completed",
    });

    await seedOutboundConfirmationEvent(t, {
      organizationId,
      appointmentId,
      patientId,
      normalizedPhone: "+48500600700",
    });

    const result = await t.mutation(
      internal.gabinet.appointmentSms.processIncomingMessage,
      {
        provider: "twilio",
        to: fromNumber,
        from: "500600700",
        body: "TAK",
        providerMessageId: "inbound-message-3",
        webhookSignatureVerified: true,
        idempotencyKey: "twilio:webhook:3",
      },
    );

    const appointment = await t.run(async (ctx) => ctx.db.get(appointmentId));
    const inboundEvent = await t.run(async (ctx) =>
      result.eventId ? ctx.db.get(result.eventId) : null,
    );

    expect(result.processingStatus).toBe("ignored");
    expect(result.reason).toBe("Cannot transition from completed to confirmed");
    expect(appointment?.status).toBe("completed");
    expect(inboundEvent?.processingStatus).toBe("ignored");
    expect(inboundEvent?.processingError).toBe(
      "Cannot transition from completed to confirmed",
    );
  });
});
