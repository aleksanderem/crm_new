import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedGabinetPrereqs,
  seedSecondUser,
  seedTestUser,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

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

// `finishAllScheduledFunctions` is not safe under the in-memory Supabase mock:
// some side-effect mutations throw (the gabinet completion path inserts into
// `loyaltyTransactions` with a non-Convex id, which Convex's validator
// rejects), and the poller crashes on the resulting null state. Instead, let
// any pending setTimeout(0) callbacks scheduled by the action handler fire
// against the *current* instance before the next test creates a new one.
// Anything still queued past this yield is swallowed by the scheduler-noise
// filter in tests/convex/_setup.ts.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

async function getAppointment(appointmentId: any) {
  const db = createSupabaseDb();
  return (await db.get("gabinetAppointments", String(appointmentId))) as
    | (Record<string, unknown> & {
        status?: string;
        cancellationReason?: string;
      })
    | null;
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
  return t.withIdentity(identity).action(api.gabinet.appointments.create, {
    organizationId: args.organizationId,
    patientId: args.patientId,
    treatmentId: args.treatmentId,
    employeeId: args.employeeId,
    date: args.date ?? "2026-03-15",
    startTime: args.startTime ?? "09:00",
    endTime: args.endTime ?? "09:30",
    // Test fixtures use fixed dates that may already be in the past relative
    // to the test runner's clock — bypass the past-time guard (#1414).
    allowPast: true,
  });
}

async function setPatientPhone(
  t: ReturnType<typeof import("convex-test").convexTest>,
  patientId: any,
  phone: string,
) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.patch(patientId, {
      phone,
      updatedAt: now,
    });
  });
  // appointmentSms reads patient phone via createSupabaseDb (Supabase-primary).
  const db = createSupabaseDb();
  await db.patch("gabinetPatients", String(patientId), {
    phone,
    updatedAt: now,
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
  const now = Date.now();
  const contactId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("contacts", {
      organizationId: args.organizationId,
      firstName: "Jan",
      lastName: "Kowalski",
      email: "jan.contact@example.com",
      phone: "+48500600700",
      createdBy: args.userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(args.patientId, {
      contactId: id,
      updatedAt: now,
    });

    return id;
  });

  // appointmentSms reads patient.contactId via createSupabaseDb to fan out
  // sms_sent / sms_received activity to the linked contact target.
  const db = createSupabaseDb();
  await db.patch("gabinetPatients", String(args.patientId), {
    contactId: String(contactId),
    updatedAt: now,
  });

  return contactId;
}

async function listActivitiesForEntity(
  _t: ReturnType<typeof import("convex-test").convexTest>,
  entityType: string,
  entityId: string,
) {
  return createSupabaseDb()
    .query("activities")
    .eq("entityType", entityType)
    .eq("entityId", entityId)
    .collect();
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

  return await createSupabaseDb().insert("appointmentSmsEvents", {
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

    const event = await (eventId ? createSupabaseDb().get("appointmentSmsEvents", eventId) : null);

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

    const appointmentSent = appointmentActivities.find((a) => a.action === "sms_sent");
    const patientSent = patientActivities.find((a) => a.action === "sms_sent");
    const contactSent = contactActivities.find((a) => a.action === "sms_sent");

    expect(appointmentSent?.metadata?.activityEnvelope?.eventKey).toBeTruthy();
    expect(patientSent?.metadata?.activityEnvelope?.eventKey).toBe(
      appointmentSent?.metadata?.activityEnvelope?.eventKey,
    );
    expect(contactSent?.metadata?.activityEnvelope?.eventKey).toBe(
      appointmentSent?.metadata?.activityEnvelope?.eventKey,
    );
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

    {
      const db = createSupabaseDb();
      await db.patch("gabinetAppointments", String(appointmentId), {
        status: "pending_confirmation",
        updatedAt: Date.now(),
      });
    }

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

    const appointment = await getAppointment(appointmentId);
    const smsEvents = await createSupabaseDb()
      .query("appointmentSmsEvents")
      .eq("appointmentId", appointmentId)
      .collect();
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

    const appointmentReceived = appointmentActivities.find(
      (a) => a.action === "sms_received",
    );
    const patientReceived = patientActivities.find((a) => a.action === "sms_received");
    const contactReceived = contactActivities.find((a) => a.action === "sms_received");

    expect(appointmentReceived?.metadata?.activityEnvelope?.eventKey).toBeTruthy();
    expect(patientReceived?.metadata?.activityEnvelope?.eventKey).toBe(
      appointmentReceived?.metadata?.activityEnvelope?.eventKey,
    );
    expect(contactReceived?.metadata?.activityEnvelope?.eventKey).toBe(
      appointmentReceived?.metadata?.activityEnvelope?.eventKey,
    );
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

    {
      const db = createSupabaseDb();
      await db.patch("gabinetAppointments", String(appointmentId), {
        status: "pending_confirmation",
        createdBy: String(creatorId),
        updatedAt: Date.now(),
      });
    }

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

    const appointment = await getAppointment(appointmentId);
    const inboundEvent = await (result.eventId ? createSupabaseDb().get("appointmentSmsEvents", result.eventId) : null);
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

    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId,
      status: "confirmed",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
      organizationId,
      appointmentId,
      status: "in_progress",
    });
    await t.withIdentity(identity).action(api.gabinet.appointments.updateStatus, {
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

    const appointment = await getAppointment(appointmentId);
    const inboundEvent = await (result.eventId ? createSupabaseDb().get("appointmentSmsEvents", result.eventId) : null);

    expect(result.processingStatus).toBe("ignored");
    expect(result.reason).toBe("Cannot transition from completed to confirmed");
    expect(appointment?.status).toBe("completed");
    expect(inboundEvent?.processingStatus).toBe("ignored");
    expect(inboundEvent?.processingError).toBe(
      "Cannot transition from completed to confirmed",
    );
  });

  test("queueConfirmationRequest with booking trigger uses stable idempotency key", async () => {
    const t = createManagedTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await setPatientPhone(t, patientId, "500600700");
    await seedSmsConfig(t, organizationId);

    const appointmentId = await createAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    // First call with booking trigger
    const firstEventId = await t.mutation(
      internal.gabinet.appointmentSms.queueConfirmationRequest,
      {
        organizationId,
        appointmentId,
        trigger: "booking",
      },
    );

    // Second call with same booking trigger — must not create a duplicate
    const secondEventId = await t.mutation(
      internal.gabinet.appointmentSms.queueConfirmationRequest,
      {
        organizationId,
        appointmentId,
        trigger: "booking",
      },
    );

    const db = createSupabaseDb();
    const allEvents = await db
      .query("appointmentSmsEvents")
      .eq("appointmentId", appointmentId)
      .collect();
    const outboundEvents = allEvents.filter((e) => e.direction === "outbound");

    expect(firstEventId).toBeTruthy();
    expect(secondEventId).toBe(firstEventId);
    expect(outboundEvents).toHaveLength(1);
    expect(outboundEvents[0]?.idempotencyKey).toBe(
      `outbound:booking:${appointmentId}`,
    );
  });
});
