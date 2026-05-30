import { internalMutation, internalQuery, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { createSupabaseDb } from "../_helpers/supabaseDb";

const WORKFLOW_EVENT = "appointment_created" as const;

type WorkflowAction = {
  key: string;
  channel: "email" | "sms";
  enabled: boolean;
  eventType?: string;
  messageTemplate?: string;
};

type WorkflowConfig = {
  appointmentCreated: {
    enabled: boolean;
    actions: WorkflowAction[];
  };
};

const DEFAULT_CONFIG: WorkflowConfig = {
  appointmentCreated: {
    enabled: true,
    actions: [
      {
        key: "email_created",
        channel: "email",
        enabled: true,
        eventType: "appointment.created",
      },
      {
        key: "sms_created",
        channel: "sms",
        enabled: false,
        messageTemplate:
          "Twoja wizyta dnia {{appointmentDate}} o {{appointmentTime}} została potwierdzona.",
      },
    ],
  },
};

function parseConfig(raw: string | undefined): WorkflowConfig {
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkflowConfig>;
    return {
      appointmentCreated: {
        enabled: parsed.appointmentCreated?.enabled ?? true,
        actions:
          parsed.appointmentCreated?.actions?.map((action, index) => ({
            key: action.key ?? `action_${index}`,
            channel: action.channel === "sms" ? "sms" : "email",
            enabled: action.enabled ?? true,
            eventType: action.eventType,
            messageTemplate: action.messageTemplate,
          })) ?? DEFAULT_CONFIG.appointmentCreated.actions,
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function applyTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, rawKey: string) => {
    const key = rawKey.trim();
    return variables[key] ?? "";
  });
}

function buildIdempotencyKey(args: {
  organizationId: Id<"organizations">;
  appointmentId: Id<"gabinetAppointments">;
  workflowEvent: string;
  channel: "email" | "sms";
  actionKey: string;
}): string {
  return [
    "appointment-workflow",
    String(args.organizationId),
    String(args.appointmentId),
    args.workflowEvent,
    args.channel,
    args.actionKey,
  ].join(":");
}

async function upsertHistory(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    appointmentId: Id<"gabinetAppointments">;
    channel: "email" | "sms";
    recipient: string;
    recipientName?: string;
    status: "pending" | "sent" | "failed" | "skipped";
    renderedSubject?: string;
    renderedBody?: string;
    emailEventLogId?: Id<"emailEventLog">;
    errorMessage?: string;
    idempotencyKey: string;
    processedAt?: number;
  },
) {
  const existing = await ctx.db
    .query("appointmentWorkflowHistory")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();

  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: args.status,
      renderedSubject: args.renderedSubject,
      renderedBody: args.renderedBody,
      emailEventLogId: args.emailEventLogId,
      errorMessage: args.errorMessage,
      processedAt: args.processedAt,
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("appointmentWorkflowHistory", {
    organizationId: args.organizationId,
    appointmentId: args.appointmentId,
    workflowEvent: WORKFLOW_EVENT,
    channel: args.channel,
    direction: "outbound",
    source: "appointment_workflow",
    recipient: args.recipient,
    recipientName: args.recipientName,
    status: args.status,
    renderedSubject: args.renderedSubject,
    renderedBody: args.renderedBody,
    emailEventLogId: args.emailEventLogId,
    errorMessage: args.errorMessage,
    idempotencyKey: args.idempotencyKey,
    processedAt: args.processedAt,
    createdAt: now,
    updatedAt: now,
  });
}

export const getWorkflowConfigInternal = internalQuery({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("orgSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    return parseConfig(settings?.appointmentWorkflowConfig);
  },
});

export const dispatchAppointmentCreated = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
    patientId: v.string(),
    treatmentId: v.string(),
    employeeId: v.string(),
    appointmentDate: v.string(),
    appointmentTime: v.string(),
    triggeredBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const appointmentId = args.appointmentId as Id<"gabinetAppointments">;

    // Patient/treatment/employee live in Supabase (UUIDs) — ctx.db.get fails
    // with "Unable to decode ID". Read from Supabase instead; same fix
    // pattern as #1113 for the appointment cancellation path in
    // convex/gabinet/appointments.ts.
    const supabaseDb = createSupabaseDb();
    const [patient, treatment, employee, config] = await Promise.all([
      supabaseDb.get("gabinetPatients", String(args.patientId)),
      supabaseDb.get("gabinetTreatments", String(args.treatmentId)),
      supabaseDb.get<{ name?: string }>("users", String(args.employeeId)),
      ctx.runQuery(internal.gabinet.appointmentWorkflow.getWorkflowConfigInternal, {
        organizationId: args.organizationId,
      }),
    ]);

    if (!config.appointmentCreated.enabled || !patient) return;

    const patientName = `${patient.firstName}${patient.lastName ? ` ${patient.lastName}` : ""}`;
    const variables: Record<string, string> = {
      patientName,
      appointmentDate: args.appointmentDate,
      appointmentTime: args.appointmentTime,
      treatmentName: treatment?.name ?? "Treatment",
      employeeName: employee?.name ?? "Specjalista",
    };

    for (const action of config.appointmentCreated.actions) {
      if (!action.enabled) continue;

      const idempotencyKey = buildIdempotencyKey({
        organizationId: args.organizationId,
        appointmentId,
        workflowEvent: WORKFLOW_EVENT,
        channel: action.channel,
        actionKey: action.key,
      });

      const existing = await ctx.db
        .query("appointmentWorkflowHistory")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      if (existing) continue;

      if (action.channel === "email") {
        if (!patient.email) {
          await upsertHistory(ctx, {
            organizationId: args.organizationId,
            appointmentId,
            channel: "email",
            recipient: "",
            recipientName: patientName,
            status: "skipped",
            errorMessage: "Missing patient email",
            idempotencyKey,
            processedAt: Date.now(),
          });
          continue;
        }

        const payload = JSON.stringify(variables);
        const logId = await ctx.runMutation(internal.emailEventTrigger.triggerEmailEvent, {
          organizationId: args.organizationId,
          eventType: action.eventType ?? "appointment.created",
          recipientEmail: patient.email,
          recipientName: patientName,
          payload,
          triggeredBy: args.triggeredBy,
          source: "appointment_workflow",
          relatedEntityType: "gabinetAppointment",
          relatedEntityId: String(appointmentId),
          idempotencyKey,
        });

        await upsertHistory(ctx, {
          organizationId: args.organizationId,
          appointmentId,
          channel: "email",
          recipient: patient.email,
          recipientName: patientName,
          status: "pending",
          renderedBody: payload,
          emailEventLogId: logId,
          idempotencyKey,
        });
        continue;
      }

      if (!patient.phone) {
        await upsertHistory(ctx, {
          organizationId: args.organizationId,
          appointmentId,
          channel: "sms",
          recipient: "",
          recipientName: patientName,
          status: "skipped",
          errorMessage: "Missing patient phone",
          idempotencyKey,
          processedAt: Date.now(),
        });
        continue;
      }

      const message = applyTemplate(
        action.messageTemplate ??
          "Twoja wizyta dnia {{appointmentDate}} o {{appointmentTime}} została potwierdzona.",
        variables,
      );

      await ctx.scheduler.runAfter(0, internal.sms.sendAppointmentSms, {
        organizationId: args.organizationId,
        phone: patient.phone,
        message,
      });

      await upsertHistory(ctx, {
        organizationId: args.organizationId,
        appointmentId,
        channel: "sms",
        recipient: patient.phone,
        recipientName: patientName,
        status: "sent",
        renderedBody: message,
        idempotencyKey,
        processedAt: Date.now(),
      });
    }
  },
});
