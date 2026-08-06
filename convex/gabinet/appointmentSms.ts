import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { action, internalMutation, MutationCtx } from "../_generated/server";
import { publishActivityEnvelope } from "../_helpers/activityEnvelope";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";

const CONFIRM_REPLY_KEYWORDS = new Set(["TAK", "T", "YES", "Y"]);
const CANCEL_REPLY_KEYWORDS = new Set(["NIE", "N", "NO"]);

export function normalizePhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  const withoutWhitespace = trimmed.replace(/\s+/g, "");
  const normalizedPrefix = withoutWhitespace.startsWith("00")
    ? `+${withoutWhitespace.slice(2)}`
    : withoutWhitespace;

  if (normalizedPrefix.startsWith("+")) {
    return `+${normalizedPrefix.slice(1).replace(/\D/g, "")}`;
  }

  const digits = normalizedPrefix.replace(/\D/g, "");
  if (!digits) return trimmed;
  if (digits.length === 9) return `+48${digits}`;
  if (digits.startsWith("48") && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

export function normalizeSmsBody(body: string): string {
  return body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function parseAppointmentSmsIntent(body: string) {
  const normalized = normalizeSmsBody(body);
  const [firstToken = ""] = normalized.split(" ");

  if (CONFIRM_REPLY_KEYWORDS.has(normalized) || CONFIRM_REPLY_KEYWORDS.has(firstToken)) {
    return "confirm" as const;
  }

  if (CANCEL_REPLY_KEYWORDS.has(normalized) || CANCEL_REPLY_KEYWORDS.has(firstToken)) {
    return "cancel" as const;
  }

  return "unknown" as const;
}

function buildConfirmationMessage(args: {
  date: string;
  startTime: string;
  organizationName?: string;
}) {
  const prefix = args.organizationName ? `${args.organizationName}: ` : "";
  return `${prefix}Prosimy potwierdzić wizytę ${args.date} o ${args.startTime}. Odpowiedz TAK aby potwierdzić, NIE aby odwołać.`;
}

async function logSmsSharedActivities(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    appointmentId?: Id<"gabinetAppointments">;
    patientId?: Id<"gabinetPatients">;
    action: "sms_sent" | "sms_received";
    description: string;
    performedBy: Id<"users">;
    metadata?: Record<string, unknown>;
  },
) {
  const entityTargets: Array<{ entityType: string; entityId: string }> = [];

  if (args.appointmentId) {
    entityTargets.push({
      entityType: "gabinetAppointment",
      entityId: args.appointmentId,
    });
  }

  let patientContactId: Id<"contacts"> | undefined;
  if (args.patientId) {
    entityTargets.push({
      entityType: "gabinetPatient",
      entityId: args.patientId,
    });

    const db = createSupabaseDb();
    const patient = await db.get<{
      organizationId?: string;
      contactId?: string | null;
    }>("gabinetPatients", String(args.patientId));
    if (
      patient &&
      String(patient.organizationId) === String(args.organizationId) &&
      patient.contactId
    ) {
      patientContactId = patient.contactId as Id<"contacts">;
    }
  }

  if (patientContactId) {
    entityTargets.push({
      entityType: "contact",
      entityId: patientContactId,
    });
  }

  const occurredAt = Date.now();
  const semanticEventId =
    typeof args.metadata?.appointmentSmsEventId === "string"
      ? args.metadata.appointmentSmsEventId
      : null;
  const eventKey = semanticEventId
    ? `gabinet:sms:${semanticEventId}:${args.action}`
    : `gabinet:sms:${args.organizationId}:${occurredAt}:${args.action}`;

  await publishActivityEnvelope(ctx, {
    organizationId: args.organizationId,
    action: args.action,
    performedBy: args.performedBy,
    module: "gabinet",
    summary: args.description,
    occurredAt,
    actor: {
      type: "user",
      userId: args.performedBy,
    },
    payload: {
      ...(args.metadata ?? {}),
      direction: args.action === "sms_sent" ? "outbound" : "inbound",
    },
    eventKey,
    targets: entityTargets,
    metadata: args.metadata,
  });
}

export const listByAppointment = action({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_appointments",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    return await db
      .query("appointmentSmsEvents")
      .eq("appointmentId", args.appointmentId)
      .order("createdAt", false)
      .collect();
  },
});

export const queueAutomationSms = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
    phone: v.string(),
    message: v.string(),
    eventType: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const appointment = await db.get("gabinetAppointments", args.appointmentId);
    if (
      !appointment ||
      String(appointment.organizationId) !== String(args.organizationId)
    ) {
      return null;
    }

    const appointmentId = args.appointmentId as Id<"gabinetAppointments">;
    const patientId = appointment.patientId as Id<"gabinetPatients">;
    const employeeId = appointment.employeeId as Id<"users">;

    const config = await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    const normalizedPhone = normalizePhoneNumber(args.phone);
    const now = Date.now();
    const correlationKey = `automation:${args.eventType}:${appointmentId}`;

    const existingEvent = await db
      .query("appointmentSmsEvents")
      .eq("idempotencyKey", args.idempotencyKey)
      .first();
    if (existingEvent) {
      return existingEvent._id;
    }

    const eventId = await db.insert("appointmentSmsEvents", {
      organizationId: args.organizationId,
      appointmentId,
      patientId,
      normalizedPhone,
      direction: "outbound",
      provider: config?.provider ?? "unconfigured",
      eventType: "appointment_confirmation_request",
      correlationKey,
      rawBody: args.message,
      normalizedBody: normalizeSmsBody(args.message),
      processingStatus: "pending",
      metadata: JSON.stringify({
        trigger: "automation",
        sourceEventType: args.eventType,
      }),
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });

    await logSmsSharedActivities(ctx, {
      organizationId: args.organizationId,
      appointmentId,
      patientId,
      action: "sms_sent",
      description: `Sent automated SMS for ${args.eventType}`,
      performedBy: employeeId,
      metadata: {
        appointmentSmsEventId: eventId,
        direction: "outbound",
        eventType: args.eventType,
        correlationKey,
      },
    });

    await ctx.scheduler.runAfter(0, internal.sms.sendAppointmentSms, {
      organizationId: args.organizationId,
      phone: args.phone,
      message: args.message,
      eventId,
    });

    return eventId;
  },
});

export const queueConfirmationRequest = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
    reminderId: v.optional(v.id("appointmentReminders")),
    trigger: v.optional(v.union(v.literal("reminder"), v.literal("manual"), v.literal("booking"))),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const appointment = await db.get("gabinetAppointments", args.appointmentId);
    if (
      !appointment ||
      String(appointment.organizationId) !== String(args.organizationId)
    ) {
      return null;
    }

    if (
      appointment.status === "confirmed" ||
      appointment.status === "cancelled" ||
      appointment.status === "completed" ||
      appointment.status === "no_show"
    ) {
      return null;
    }

    const appointmentId = args.appointmentId as Id<"gabinetAppointments">;
    const patientId = appointment.patientId as Id<"gabinetPatients">;
    const employeeId = appointment.employeeId as Id<"users">;

    const patient = await db.get("gabinetPatients", String(appointment.patientId));
    const patientPhone = patient?.phone as string | undefined;
    if (!patientPhone) {
      return null;
    }

    const org = await ctx.db.get(args.organizationId);
    const config = await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    const normalizedPhone = normalizePhoneNumber(patientPhone);
    const message = buildConfirmationMessage({
      date: appointment.date as string,
      startTime: appointment.startTime as string,
      organizationName: org?.name,
    });
    const now = Date.now();
    const correlationKey = `appointment-confirmation:${appointmentId}`;
    const idempotencyKey =
      args.trigger === "booking"
        ? `outbound:booking:${appointmentId}`
        : args.reminderId
          ? `outbound:${args.reminderId}`
          : `${correlationKey}:${now}`;

    const existingEvent = await db
      .query("appointmentSmsEvents")
      .eq("idempotencyKey", idempotencyKey)
      .first();
    if (existingEvent) {
      return existingEvent._id;
    }

    const eventMetadata = {
      trigger: args.trigger ?? "reminder",
      reminderId: args.reminderId ?? null,
    };

    const eventId = await db.insert("appointmentSmsEvents", {
      organizationId: args.organizationId,
      appointmentId,
      patientId,
      normalizedPhone,
      direction: "outbound",
      provider: config?.provider ?? "unconfigured",
      eventType: "appointment_confirmation_request",
      correlationKey,
      rawBody: message,
      normalizedBody: normalizeSmsBody(message),
      processingStatus: "pending",
      metadata: JSON.stringify(eventMetadata),
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });

    await logSmsSharedActivities(ctx, {
      organizationId: args.organizationId,
      appointmentId,
      patientId,
      action: "sms_sent",
      description: `Sent appointment confirmation SMS for ${appointment.date} at ${appointment.startTime}`,
      performedBy: employeeId,
      metadata: {
        appointmentSmsEventId: eventId,
        direction: "outbound",
        eventType: "appointment_confirmation_request",
        correlationKey,
        ...eventMetadata,
      },
    });

    await ctx.scheduler.runAfter(0, internal.sms.sendAppointmentSms, {
      organizationId: args.organizationId,
      phone: patientPhone,
      message,
      eventId,
    });

    return eventId;
  },
});

export const markEventProcessed = internalMutation({
  args: {
    eventId: v.string(),
    providerMessageId: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    await db.patch("appointmentSmsEvents", args.eventId, {
      providerMessageId: args.providerMessageId,
      metadata: args.metadata,
      processingStatus: "processed",
      processedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markEventFailed = internalMutation({
  args: {
    eventId: v.string(),
    error: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    await db.patch("appointmentSmsEvents", args.eventId, {
      processingStatus: "failed",
      processingError: args.error,
      metadata: args.metadata,
      processedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const processIncomingMessage = internalMutation({
  args: {
    provider: v.union(v.literal("twilio"), v.literal("smsapi")),
    to: v.string(),
    from: v.string(),
    body: v.string(),
    providerMessageId: v.optional(v.string()),
    webhookSignatureVerified: v.optional(v.boolean()),
    idempotencyKey: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    duplicate: boolean;
    eventId?: string;
    processingStatus: "pending" | "processed" | "ignored" | "failed";
    reason?: string;
    appointmentId?: Id<"gabinetAppointments">;
  }> => {
    const db = createSupabaseDb();
    const duplicate = await db
      .query("appointmentSmsEvents")
      .eq("idempotencyKey", args.idempotencyKey)
      .first() as Doc<"appointmentSmsEvents"> | null;

    if (duplicate) {
      return {
        duplicate: true,
        eventId: String(duplicate._id),
        processingStatus: duplicate.processingStatus,
      };
    }

    const config: Doc<"orgSmsConfig"> | null = await ctx.runQuery(
      internal.sms.getConfigForInbound,
      {
        provider: args.provider,
        recipient: args.to,
      },
    );

    if (!config) {
      return {
        duplicate: false,
        processingStatus: "ignored" as const,
        reason: "No matching SMS configuration for inbound recipient",
      };
    }

    const normalizedPhone = normalizePhoneNumber(args.from);
    const normalizedBody = normalizeSmsBody(args.body);
    const parsedIntent = parseAppointmentSmsIntent(args.body);
    const now = Date.now();

    const outboundEvents = (await db
      .query("appointmentSmsEvents")
      .eq("organizationId", String(config.organizationId))
      .eq("normalizedPhone", normalizedPhone)
      .order("createdAt", false)
      .collect()) as Array<Doc<"appointmentSmsEvents">>;

    const matchingOutbound = outboundEvents.find(
      (event) =>
        event.direction === "outbound" &&
        event.eventType === "appointment_confirmation_request" &&
        !!event.appointmentId,
    );

    const eventId: string = await db.insert("appointmentSmsEvents", {
      organizationId: config.organizationId,
      appointmentId: matchingOutbound?.appointmentId,
      patientId: matchingOutbound?.patientId,
      normalizedPhone,
      direction: "inbound",
      provider: args.provider,
      eventType: "appointment_confirmation_reply",
      providerMessageId: args.providerMessageId,
      correlationKey: matchingOutbound?.correlationKey,
      replyToEventId: matchingOutbound?._id,
      rawBody: args.body,
      normalizedBody,
      parsedIntent,
      processingStatus: "pending",
      webhookSignatureVerified: args.webhookSignatureVerified,
      metadata: args.metadata,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });

    const matchingAppointmentId = matchingOutbound?.appointmentId as
      | Id<"gabinetAppointments">
      | undefined;
    const matchingPatientId = matchingOutbound?.patientId as
      | Id<"gabinetPatients">
      | undefined;

    const matchingAppointment = matchingAppointmentId
      ? await db.get<{
          organizationId?: string;
          employeeId?: string;
        }>("gabinetAppointments", String(matchingAppointmentId))
      : null;
    const matchingAppointmentBelongsToOrg =
      !!matchingAppointment &&
      String(matchingAppointment.organizationId) === String(config.organizationId);
    const matchingAppointmentEmployeeId =
      matchingAppointmentBelongsToOrg && matchingAppointment?.employeeId
        ? (matchingAppointment.employeeId as Id<"users">)
        : undefined;

    if (
      matchingAppointmentBelongsToOrg &&
      matchingAppointmentEmployeeId &&
      (matchingAppointmentId || matchingPatientId)
    ) {
      await logSmsSharedActivities(ctx, {
        organizationId: config.organizationId,
        appointmentId: matchingAppointmentId,
        patientId: matchingPatientId,
        action: "sms_received",
        description: `Received appointment confirmation reply: ${normalizedBody}`,
        performedBy: matchingAppointmentEmployeeId,
        metadata: {
          appointmentSmsEventId: eventId,
          direction: "inbound",
          eventType: "appointment_confirmation_reply",
          parsedIntent,
          correlationKey: matchingOutbound?.correlationKey,
          replyToEventId: matchingOutbound?._id,
          providerMessageId: args.providerMessageId,
          webhookSignatureVerified: args.webhookSignatureVerified,
        },
      });
    }

    await ctx.runMutation(internal.automation.emitEvent, {
      organizationId: config.organizationId,
      module: "gabinet",
      eventType: "gabinet.appointment.sms_reply_received",
      entityType: matchingOutbound?.appointmentId ? "gabinetAppointment" : undefined,
      entityId: matchingOutbound?.appointmentId
        ? String(matchingOutbound.appointmentId)
        : undefined,
      actorUserId: matchingAppointmentEmployeeId,
      correlationKey: matchingOutbound?.correlationKey,
      eventIdempotencyKey: `automation-event:${config.organizationId}:${args.idempotencyKey}`,
      payload: JSON.stringify({
        organizationId: String(config.organizationId),
        appointmentId: matchingOutbound?.appointmentId
          ? String(matchingOutbound.appointmentId)
          : null,
        patientId: matchingOutbound?.patientId
          ? String(matchingOutbound.patientId)
          : null,
        provider: args.provider,
        providerMessageId: args.providerMessageId,
        normalizedPhone,
        body: args.body,
        normalizedBody,
        parsedIntent,
        webhookSignatureVerified: args.webhookSignatureVerified,
      }),
      occurredAt: now,
    });

    if (parsedIntent === "unknown") {
      await db.patch("appointmentSmsEvents", eventId, {
        processingStatus: "ignored",
        processingError: "Reply body did not match TAK/NIE contract",
        processedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { duplicate: false, eventId, processingStatus: "ignored" as const };
    }

    if (!matchingOutbound?.appointmentId) {
      await db.patch("appointmentSmsEvents", eventId, {
        processingStatus: "ignored",
        processingError: "No outbound appointment confirmation event found for this phone",
        processedAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { duplicate: false, eventId, processingStatus: "ignored" as const };
    }

    const transitionResult: {
      processingStatus: "processed" | "ignored";
      reason?: string;
    } = await ctx.runMutation(internal.gabinet.appointments.applySmsReplyTransition, {
      organizationId: config.organizationId,
      appointmentId: String(matchingOutbound.appointmentId),
      intent: parsedIntent,
      smsEventId: eventId,
    });

    await db.patch("appointmentSmsEvents", eventId, {
      processingStatus: transitionResult.processingStatus,
      processingError: transitionResult.reason,
      processedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      duplicate: false,
      eventId,
      processingStatus: transitionResult.processingStatus,
      reason: transitionResult.reason,
      appointmentId: matchingOutbound.appointmentId as Id<"gabinetAppointments">,
    };
  },
});

