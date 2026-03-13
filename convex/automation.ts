import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { createNotificationDirect } from "./notifications";
import { Id } from "./_generated/dataModel";
import {
  automationGraphValidator,
  automationRuleActionValidator,
  automationTriggerDefinitionValidator,
} from "./schema";
import { AUTH_EMAIL, AUTH_RESEND_KEY } from "@cvx/env";
import { renderTemplateString } from "./emailTemplates";
import { escapeHtml } from "./_helpers/html";
import { DEFAULT_PERMISSIONS } from "./_helpers/permissions";
import type { Feature, Scope } from "./_helpers/permissionTypes";

const automationModuleValidator = v.union(
  v.literal("crm"),
  v.literal("gabinet"),
  v.literal("platform"),
);


const automationConditionOperatorValidator = v.union(
  v.literal("equals"),
  v.literal("not_equals"),
  v.literal("contains"),
  v.literal("greater_than"),
  v.literal("less_than"),
  v.literal("is_truthy"),
  v.literal("is_falsy"),
);

const automationConditionValidator = v.object({
  path: v.string(),
  operator: automationConditionOperatorValidator,
  value: v.optional(v.union(v.string(), v.number(), v.boolean())),
});


const automationEventArgsValidator = {
  organizationId: v.id("organizations"),
  module: automationModuleValidator,
  eventType: v.string(),
  entityType: v.optional(v.string()),
  entityId: v.optional(v.string()),
  payload: v.string(),
  actorUserId: v.optional(v.id("users")),
  occurredAt: v.optional(v.number()),
  eventIdempotencyKey: v.string(),
  correlationKey: v.optional(v.string()),
};

type EventCatalogVariable = {
  key: string;
  path: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "id";
  group?: string;
};

type EventCatalogEntry = {
  module: "crm" | "gabinet" | "platform";
  eventType: string;
  label: string;
  entityType?: string;
  source: "domain_event" | "communication_reply";
  samplePayload: Record<string, unknown>;
  variables: EventCatalogVariable[];
};

const EVENT_REGISTRY: EventCatalogEntry[] = [
  {
    module: "gabinet",
    eventType: "gabinet.appointment.created",
    label: "Appointment created",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      treatmentId: "treatment_123",
      employeeId: "user_123",
      date: "2026-03-17",
      startTime: "10:00",
      endTime: "10:30",
      status: "scheduled",
      patientEmail: "jan@example.com",
      patientPhone: "500600700",
      patientName: "Jan Kowalski",
      treatmentName: "Consultation",
      employeeName: "Dr. Example",
      createdBy: "user_123",
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "patientName", path: "patientName", label: "Patient name", type: "string", group: "patient" },
      { key: "patientPhone", path: "patientPhone", label: "Patient phone", type: "string", group: "patient" },
      { key: "patientEmail", path: "patientEmail", label: "Patient email", type: "string", group: "patient" },
      { key: "employeeId", path: "employeeId", label: "Employee ID", type: "id", group: "appointment" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "endTime", path: "endTime", label: "End time", type: "string", group: "appointment" },
      { key: "status", path: "status", label: "Status", type: "string", group: "appointment" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.updated",
    label: "Appointment updated",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      treatmentId: "treatment_123",
      employeeId: "user_123",
      date: "2026-03-17",
      startTime: "11:00",
      endTime: "11:30",
      previousStatus: "scheduled",
      status: "scheduled",
      createdBy: "user_123",
      updatedFields: ["startTime", "endTime"],
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "employeeId", path: "employeeId", label: "Employee ID", type: "id", group: "appointment" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "endTime", path: "endTime", label: "End time", type: "string", group: "appointment" },
      { key: "status", path: "status", label: "Status", type: "string", group: "appointment" },
      { key: "previousStatus", path: "previousStatus", label: "Previous status", type: "string", group: "appointment" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.status_changed",
    label: "Appointment status changed",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      employeeId: "user_123",
      treatmentId: "treatment_123",
      status: "confirmed",
      previousStatus: "scheduled",
      date: "2026-03-17",
      startTime: "10:00",
      cancellationReason: null,
      createdBy: "user_123",
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "employeeId", path: "employeeId", label: "Employee ID", type: "id", group: "appointment" },
      { key: "status", path: "status", label: "Status", type: "string", group: "appointment" },
      { key: "previousStatus", path: "previousStatus", label: "Previous status", type: "string", group: "appointment" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "cancellationReason", path: "cancellationReason", label: "Cancellation reason", type: "string", group: "appointment" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.reminder_due",
    label: "Appointment reminder due",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      treatmentId: "treatment_123",
      employeeId: "user_123",
      date: "2026-03-17",
      startTime: "10:00",
      patientEmail: "jan@example.com",
      patientPhone: "500600700",
      patientName: "Jan Kowalski",
      treatmentName: "Consultation",
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "patientName", path: "patientName", label: "Patient name", type: "string", group: "patient" },
      { key: "patientPhone", path: "patientPhone", label: "Patient phone", type: "string", group: "patient" },
      { key: "patientEmail", path: "patientEmail", label: "Patient email", type: "string", group: "patient" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "treatmentName", path: "treatmentName", label: "Treatment name", type: "string", group: "appointment" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.sms_reply_received",
    label: "Appointment SMS reply received",
    entityType: "gabinetAppointment",
    source: "communication_reply",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      provider: "twilio",
      providerMessageId: "SM123",
      normalizedPhone: "+48500600700",
      body: "TAK",
      normalizedBody: "tak",
      parsedIntent: "confirm",
      webhookSignatureVerified: true,
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "provider", path: "provider", label: "SMS provider", type: "string", group: "message" },
      { key: "providerMessageId", path: "providerMessageId", label: "Provider message ID", type: "string", group: "message" },
      { key: "normalizedPhone", path: "normalizedPhone", label: "Sender phone", type: "string", group: "message" },
      { key: "body", path: "body", label: "Reply body", type: "string", group: "message" },
      { key: "parsedIntent", path: "parsedIntent", label: "Parsed intent", type: "string", group: "message" },
      { key: "webhookSignatureVerified", path: "webhookSignatureVerified", label: "Webhook signature verified", type: "boolean", group: "message" },
    ],
  },
  {
    module: "crm",
    eventType: "crm.lead.status_changed",
    label: "Lead status changed",
    entityType: "lead",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      leadId: "lead_123",
      title: "Enterprise Plan Deal",
      oldStatus: "new",
      newStatus: "won",
      assignedTo: "user_123",
      ownerId: "user_123",
      createdBy: "user_123",
    },
    variables: [
      { key: "leadId", path: "leadId", label: "Lead ID", type: "id", group: "lead" },
      { key: "title", path: "title", label: "Lead title", type: "string", group: "lead" },
      { key: "oldStatus", path: "oldStatus", label: "Previous status", type: "string", group: "lead" },
      { key: "newStatus", path: "newStatus", label: "New status", type: "string", group: "lead" },
      { key: "assignedTo", path: "assignedTo", label: "Assigned user", type: "id", group: "ownership" },
      { key: "ownerId", path: "ownerId", label: "Lead owner", type: "id", group: "ownership" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "crm",
    eventType: "crm.lead.stage_changed",
    label: "Lead stage changed",
    entityType: "lead",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      leadId: "lead_123",
      title: "Enterprise Plan Deal",
      fromStageId: "stage_1",
      toStageId: "stage_2",
      oldStatus: "new",
      newStatus: "qualified",
      ownerId: "user_123",
      createdBy: "user_123",
    },
    variables: [
      { key: "leadId", path: "leadId", label: "Lead ID", type: "id", group: "lead" },
      { key: "title", path: "title", label: "Lead title", type: "string", group: "lead" },
      { key: "fromStageId", path: "fromStageId", label: "From stage", type: "id", group: "pipeline" },
      { key: "toStageId", path: "toStageId", label: "To stage", type: "id", group: "pipeline" },
      { key: "oldStatus", path: "oldStatus", label: "Previous status", type: "string", group: "lead" },
      { key: "newStatus", path: "newStatus", label: "New status", type: "string", group: "lead" },
      { key: "ownerId", path: "ownerId", label: "Lead owner", type: "id", group: "ownership" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
];

function mapLegacyTriggerSource(eventType: string): "domain_event" | "communication_reply" {
  return eventType.endsWith("sms_reply_received") ? "communication_reply" : "domain_event";
}

function resolveRuleTrigger(rule: {
  module: "crm" | "gabinet" | "platform";
  eventType: string;
  entityType?: string;
  trigger?: {
    module: "crm" | "gabinet" | "platform";
    eventType: string;
    entityType?: string;
    source: "domain_event" | "communication_reply";
    label?: string;
  };
}) {
  return (
    rule.trigger ?? {
      module: rule.module,
      eventType: rule.eventType,
      entityType: rule.entityType,
      source: mapLegacyTriggerSource(rule.eventType),
    }
  );
}

function getPathValue(payload: Record<string, unknown>, path: string) {
  const normalized = path.replace(/^payload\./, "");
  return normalized.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, payload);
}

function stringifyValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function applyTemplate(template: string, payload: Record<string, unknown>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, rawKey: string) => {
    const value = getPathValue(payload, rawKey.trim());
    return stringifyValue(value);
  });
}

type AutomationActionType =
  | "send_email"
  | "send_sms"
  | "send_sms_request"
  | "create_notification"
  | "write_activity"
  | "update_field";

type AutomationActionCapability = {
  type: AutomationActionType;
  available: boolean;
  availability: "available" | "config_required";
  missingConfigReason?: string;
  recipientModes?: string[];
  contentModes?: string[];
};

type AutomationTargetEntityType =
  | "gabinetPatient"
  | "gabinetAppointment"
  | "gabinetEmployee";

type AutomationEditFeature =
  | "gabinet_patients"
  | "gabinet_appointments"
  | "gabinet_employees";

const AUTOMATION_ACTION_CAPABILITIES: Array<{
  type: AutomationActionType;
  needsEmail?: boolean;
  needsSms?: boolean;
  recipientModes?: string[];
  contentModes?: string[];
}> = [
  {
    type: "send_sms",
    needsSms: true,
    recipientModes: ["patient_phone"],
    contentModes: ["manual"],
  },
  {
    type: "send_sms_request",
    needsSms: true,
    recipientModes: ["patient_phone"],
    contentModes: ["manual"],
  },
  {
    type: "send_email",
    needsEmail: true,
    recipientModes: ["patient_email"],
    contentModes: ["template", "manual"],
  },
  {
    type: "create_notification",
    recipientModes: ["employee_user"],
    contentModes: ["manual"],
  },
  {
    type: "write_activity",
    recipientModes: ["entity_context"],
    contentModes: ["manual"],
  },
  {
    type: "update_field",
    recipientModes: ["entity_context"],
    contentModes: ["template_value"],
  },
];

const STANDARD_FIELD_ALLOWLIST: Record<AutomationTargetEntityType, Set<string>> = {
  gabinetPatient: new Set([
    "firstName",
    "lastName",
    "email",
    "phone",
    "dateOfBirth",
    "medicalNotes",
    "allergies",
    "bloodType",
    "emergencyContactName",
    "emergencyContactPhone",
    "referralSource",
  ]),
  gabinetAppointment: new Set([
    "date",
    "startTime",
    "endTime",
    "notes",
    "internalNotes",
    "color",
    "cancellationReason",
    "bodyChartData",
  ]),
  gabinetEmployee: new Set([
    "firstName",
    "lastName",
    "specialization",
    "licenseNumber",
    "hireDate",
    "isActive",
    "color",
    "notes",
  ]),
};

async function sendAutomationEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const from = AUTH_EMAIL ?? "Convex SaaS <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AUTH_RESEND_KEY ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send automation email (${response.status})`);
  }
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "");
}

function buildActionCapabilities(options: { hasEmail: boolean; hasSms: boolean }) {
  return AUTOMATION_ACTION_CAPABILITIES.map<AutomationActionCapability>((capability) => {
    const needsEmail = capability.needsEmail === true;
    const needsSms = capability.needsSms === true;
    const available = needsEmail
      ? options.hasEmail
      : needsSms
        ? options.hasSms
        : true;

    return {
      type: capability.type,
      available,
      availability: available ? "available" : "config_required",
      missingConfigReason: available
        ? undefined
        : needsEmail
          ? "Configure a default email account to enable email actions."
          : "Configure an active SMS provider to enable SMS actions.",
      recipientModes: capability.recipientModes,
      contentModes: capability.contentModes,
    };
  });
}

function buildEmailTemplateSourceInstances(
  payload: Record<string, unknown>,
  run: {
    entityType?: string;
    entityId?: string;
  },
) {
  const sourceInstances: Record<string, string | null> = {};

  if (run.entityType === "gabinetAppointment" && run.entityId) {
    sourceInstances.appointment = run.entityId;
  }
  if (run.entityType === "gabinetPatient" && run.entityId) {
    sourceInstances.patient = run.entityId;
  }
  if (run.entityType === "contact" && run.entityId) {
    sourceInstances.contact = run.entityId;
  }
  if (run.entityType === "company" && run.entityId) {
    sourceInstances.company = run.entityId;
  }
  if (run.entityType === "lead" && run.entityId) {
    sourceInstances.lead = run.entityId;
  }

  const payloadSourceKeys = [
    ["appointmentId", "appointment"],
    ["patientId", "patient"],
    ["contactId", "contact"],
    ["companyId", "company"],
    ["leadId", "lead"],
  ] as const;

  for (const [payloadKey, sourceKey] of payloadSourceKeys) {
    const value = getPathValue(payload, payloadKey);
    if (typeof value === "string" && value.length > 0) {
      sourceInstances[sourceKey] = value;
    }
  }

  return sourceInstances;
}

function coerceAutomationFieldValue(
  renderedValue: string,
  valueType: "string" | "number" | "boolean" | "date",
) {
  if (valueType === "number") {
    const numericValue = Number(renderedValue);
    if (Number.isNaN(numericValue)) {
      throw new Error(`Invalid numeric automation field value: ${renderedValue}`);
    }
    return numericValue;
  }

  if (valueType === "boolean") {
    const normalized = renderedValue.trim().toLowerCase();
    if (["true", "1", "yes", "tak"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "nie"].includes(normalized)) {
      return false;
    }
    throw new Error(`Invalid boolean automation field value: ${renderedValue}`);
  }

  return renderedValue;
}

function resolveAutomationTargetId(
  payload: Record<string, unknown>,
  run: {
    entityType?: string;
    entityId?: string;
  },
  targetEntityType: AutomationTargetEntityType,
  targetIdPath?: string,
) {
  if (targetIdPath) {
    const explicitId = stringifyValue(getPathValue(payload, targetIdPath));
    return explicitId || undefined;
  }

  if (targetEntityType === "gabinetAppointment") {
    if (run.entityType === "gabinetAppointment" && run.entityId) {
      return run.entityId;
    }
    const appointmentId = stringifyValue(getPathValue(payload, "appointmentId"));
    return appointmentId || undefined;
  }

  if (targetEntityType === "gabinetPatient") {
    if (run.entityType === "gabinetPatient" && run.entityId) {
      return run.entityId;
    }
    const patientId = stringifyValue(getPathValue(payload, "patientId"));
    return patientId || undefined;
  }

  if (run.entityType === "gabinetEmployee" && run.entityId) {
    return run.entityId;
  }

  return undefined;
}

async function getAutomationEditPermission(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  actorUserId: Id<"users"> | undefined,
  feature: AutomationEditFeature,
  options?: { requireAdmin?: boolean },
): Promise<{ allowed: boolean; scope: Scope; reason?: string }> {
  if (!actorUserId) {
    return {
      allowed: false,
      scope: "none",
      reason: "Missing automation actor",
    };
  }

  const membership = await ctx.db
    .query("teamMemberships")
    .withIndex("by_orgAndUser", (q) =>
      q.eq("organizationId", organizationId).eq("userId", actorUserId),
    )
    .unique();

  if (!membership) {
    return {
      allowed: false,
      scope: "none",
      reason: "Automation actor is not a member of this organization",
    };
  }

  const role = membership.role as keyof typeof DEFAULT_PERMISSIONS;
  if (options?.requireAdmin && role !== "owner" && role !== "admin") {
    return {
      allowed: false,
      scope: "none",
      reason: "Admin access required",
    };
  }

  if (role === "owner" || role === "admin") {
    return { allowed: true, scope: "all" };
  }

  const override = await ctx.db
    .query("orgPermissions")
    .withIndex("by_orgAndRole", (q) =>
      q.eq("organizationId", organizationId).eq("role", role),
    )
    .unique();

  const permissions = override?.permissions as
    | Partial<Record<Feature, Partial<Record<"view" | "create" | "edit" | "delete" | "approve" | "sign", Scope>>>>
    | undefined;
  const scope = permissions?.[feature]?.edit ?? DEFAULT_PERMISSIONS[role][feature].edit;

  return {
    allowed: scope !== "none",
    scope,
    reason: scope === "none" ? "Permission denied" : undefined,
  };
}

async function insertAutomationEmail(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    recipientEmail: string;
    subject: string;
    bodyHtml?: string;
    bodyText?: string;
    sentBy?: Id<"users">;
  },
) {
  const emailAccounts = await ctx.db
    .query("emailAccounts")
    .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
    .collect();
  const defaultAccount = emailAccounts.find((account) => account.isDefault);
  if (!defaultAccount) {
    throw new Error("No default email account configured");
  }

  const htmlBody = args.bodyHtml ?? escapeHtml(args.bodyText ?? "").replace(/\n/g, "<br />");
  await sendAutomationEmail({
    to: args.recipientEmail,
    subject: args.subject,
    html: htmlBody,
    text: args.bodyText,
  });

  const now = Date.now();
  const bodyText = args.bodyText ?? stripHtml(htmlBody);
  const emailId = await ctx.db.insert("emails", {
    organizationId: args.organizationId,
    threadId: `<${crypto.randomUUID()}@crm.app>`,
    messageId: `<${crypto.randomUUID()}@crm.app>`,
    direction: "outbound",
    from: defaultAccount.fromEmail,
    to: [args.recipientEmail],
    subject: args.subject,
    bodyHtml: htmlBody,
    bodyText,
    snippet: bodyText.slice(0, 200),
    isRead: true,
    isStarred: false,
    sentBy: args.sentBy,
    sentAt: now,
    createdAt: now,
    updatedAt: now,
  });

  if (args.sentBy) {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "email",
      entityId: emailId,
      action: "email_sent",
      description: `Sent email \"${args.subject}\" to ${args.recipientEmail}`,
      performedBy: args.sentBy,
    });
  }

  return emailId;
}

async function applyUpdateFieldAction(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    actorUserId?: Id<"users">;
    payload: Record<string, unknown>;
    run: {
      entityType?: string;
      entityId?: string;
      _id: Id<"automationRuns">;
      eventType: string;
    };
    action: {
      targetEntityType: AutomationTargetEntityType;
      targetIdPath?: string;
      fieldKind: "standard" | "custom";
      fieldKey: string;
      valueTemplate: string;
      valueType: "string" | "number" | "boolean" | "date";
    };
  },
) {
  const targetId = resolveAutomationTargetId(
    args.payload,
    args.run,
    args.action.targetEntityType,
    args.action.targetIdPath,
  );
  if (!targetId) {
    throw new Error("Missing field update target");
  }

  const renderedValue = applyTemplate(args.action.valueTemplate, args.payload);
  const coercedValue = coerceAutomationFieldValue(renderedValue, args.action.valueType);
  const now = Date.now();

  if (args.action.targetEntityType === "gabinetPatient") {
    const permission = await getAutomationEditPermission(
      ctx,
      args.organizationId,
      args.actorUserId,
      "gabinet_patients",
    );
    if (!permission.allowed) {
      throw new Error(permission.reason ?? "Permission denied");
    }

    const patientId = targetId as Id<"gabinetPatients">;
    const patient = await ctx.db.get(patientId);
    if (!patient || patient.organizationId !== args.organizationId) {
      throw new Error("Patient not found");
    }
    if (permission.scope === "own" && patient.createdBy !== args.actorUserId) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    if (args.action.fieldKind === "custom") {
      const existingCustomFields =
        patient.customFields && typeof patient.customFields === "object"
          ? (patient.customFields as Record<string, unknown>)
          : {};
      await ctx.db.patch(patientId, {
        customFields: {
          ...existingCustomFields,
          [args.action.fieldKey]: coercedValue,
        },
        updatedAt: now,
      });
    } else {
      if (!STANDARD_FIELD_ALLOWLIST.gabinetPatient.has(args.action.fieldKey)) {
        throw new Error("Unsupported patient field update target");
      }
      await ctx.db.patch(patientId, {
        [args.action.fieldKey]: coercedValue,
        updatedAt: now,
      } as never);
    }

    if (args.actorUserId) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "gabinetPatient",
        entityId: patientId,
        action: "updated",
        description: `Updated patient field ${args.action.fieldKey} via automation`,
        performedBy: args.actorUserId,
      });
    }

    return {
      linkedEntityType: "gabinetPatient",
      linkedEntityId: String(patientId),
      renderedBody: `${args.action.fieldKind}:${args.action.fieldKey}=${String(coercedValue)}`,
    };
  }

  if (args.action.targetEntityType === "gabinetAppointment") {
    const permission = await getAutomationEditPermission(
      ctx,
      args.organizationId,
      args.actorUserId,
      "gabinet_appointments",
    );
    if (!permission.allowed) {
      throw new Error(permission.reason ?? "Permission denied");
    }

    const appointmentId = targetId as Id<"gabinetAppointments">;
    const appointment = await ctx.db.get(appointmentId);
    if (!appointment || appointment.organizationId !== args.organizationId) {
      throw new Error("Appointment not found");
    }
    if (permission.scope === "own" && appointment.createdBy !== args.actorUserId) {
      throw new Error("Permission denied: you can only edit your own records");
    }
    if (args.action.fieldKind === "custom") {
      throw new Error("Custom appointment field updates are not supported");
    }
    if (!STANDARD_FIELD_ALLOWLIST.gabinetAppointment.has(args.action.fieldKey)) {
      throw new Error("Unsupported appointment field update target");
    }

    await ctx.db.patch(appointmentId, {
      [args.action.fieldKey]: coercedValue,
      updatedAt: now,
    } as never);

    if (args.actorUserId) {
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: "gabinetAppointment",
        entityId: appointmentId,
        action: "updated",
        description: `Updated appointment field ${args.action.fieldKey} via automation`,
        performedBy: args.actorUserId,
      });
    }

    return {
      linkedEntityType: "gabinetAppointment",
      linkedEntityId: String(appointmentId),
      renderedBody: `${args.action.fieldKind}:${args.action.fieldKey}=${String(coercedValue)}`,
    };
  }

  const permission = await getAutomationEditPermission(
    ctx,
    args.organizationId,
    args.actorUserId,
    "gabinet_employees",
    { requireAdmin: true },
  );
  if (!permission.allowed) {
    throw new Error(permission.reason ?? "Permission denied");
  }

  const employeeId = targetId as Id<"gabinetEmployees">;
  const employee = await ctx.db.get(employeeId);
  if (!employee || employee.organizationId !== args.organizationId) {
    throw new Error("Employee not found");
  }
  if (permission.scope === "own" && employee.createdBy !== args.actorUserId) {
    throw new Error("Permission denied: you can only edit your own records");
  }
  if (args.action.fieldKind === "custom") {
    throw new Error("Custom employee field updates are not supported");
  }
  if (!STANDARD_FIELD_ALLOWLIST.gabinetEmployee.has(args.action.fieldKey)) {
    throw new Error("Unsupported employee field update target");
  }

  await ctx.db.patch(employeeId, {
    [args.action.fieldKey]: coercedValue,
    updatedAt: now,
  } as never);

  if (args.actorUserId) {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployee",
      entityId: employeeId,
      action: "updated",
      description: `Updated employee field ${args.action.fieldKey} via automation`,
      performedBy: args.actorUserId,
    });
  }

  return {
    linkedEntityType: "gabinetEmployee",
    linkedEntityId: String(employeeId),
    renderedBody: `${args.action.fieldKind}:${args.action.fieldKey}=${String(coercedValue)}`,
  };
}

function evaluateCondition(
  payload: Record<string, unknown>,
  condition: {
    path: string;
    operator:
      | "equals"
      | "not_equals"
      | "contains"
      | "greater_than"
      | "less_than"
      | "is_truthy"
      | "is_falsy";
    value?: string | number | boolean;
  },
) {
  const actual = getPathValue(payload, condition.path);

  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "not_equals":
      return actual !== condition.value;
    case "contains":
      return stringifyValue(actual)
        .toLowerCase()
        .includes(stringifyValue(condition.value).toLowerCase());
    case "greater_than":
      return Number(actual ?? 0) > Number(condition.value ?? 0);
    case "less_than":
      return Number(actual ?? 0) < Number(condition.value ?? 0);
    case "is_truthy":
      return Boolean(actual);
    case "is_falsy":
      return !actual;
  }
}

async function patchLegacyAppointmentWorkflowHistory(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    appointmentId?: Id<"gabinetAppointments">;
    actionType: string;
    recipient?: string;
    recipientName?: string;
    renderedSubject?: string;
    renderedBody?: string;
    status: "pending" | "sent" | "failed" | "skipped";
    errorMessage?: string;
    idempotencyKey: string;
    processedAt?: number;
  },
) {
  if (!args.appointmentId) return;

  const existing = await ctx.db
    .query("appointmentWorkflowHistory")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();

  const channel = args.actionType === "send_email" ? "email" : "sms";
  const now = Date.now();

  if (existing) {
    await ctx.db.patch(existing._id, {
      recipient: args.recipient ?? existing.recipient,
      recipientName: args.recipientName ?? existing.recipientName,
      renderedSubject: args.renderedSubject ?? existing.renderedSubject,
      renderedBody: args.renderedBody ?? existing.renderedBody,
      status: args.status,
      errorMessage: args.errorMessage,
      processedAt: args.processedAt,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("appointmentWorkflowHistory", {
    organizationId: args.organizationId,
    appointmentId: args.appointmentId,
    workflowEvent: "appointment_created",
    channel,
    direction: "outbound",
    source: "platform_automation",
    recipient: args.recipient ?? "",
    recipientName: args.recipientName,
    status: args.status,
    renderedSubject: args.renderedSubject,
    renderedBody: args.renderedBody,
    errorMessage: args.errorMessage,
    idempotencyKey: args.idempotencyKey,
    processedAt: args.processedAt,
    createdAt: now,
    updatedAt: now,
  });
}

export const listRules = query({
  args: {
    organizationId: v.id("organizations"),
    module: v.optional(automationModuleValidator),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const rules = args.module
      ? await ctx.db
          .query("automationRules")
          .withIndex("by_orgAndModule", (q) =>
            q.eq("organizationId", args.organizationId).eq("module", args.module!),
          )
          .order("desc")
          .collect()
      : await ctx.db
          .query("automationRules")
          .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
          .order("desc")
          .collect();

    return await Promise.all(
      rules.map(async (rule) => {
        const recentRuns = await ctx.db
          .query("automationRuns")
          .withIndex("by_rule", (q) => q.eq("ruleId", rule._id))
          .order("desc")
          .take(1);

        return {
          ...rule,
          trigger: resolveRuleTrigger(rule),
          lastRun: recentRuns[0] ?? null,
        };
      }),
    );
  },
});

export const listRuns = query({
  args: {
    organizationId: v.id("organizations"),
    module: v.optional(automationModuleValidator),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const limit = args.limit ?? 100;

    let runs = await ctx.db
      .query("automationRuns")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(limit * 3);

    if (args.module) {
      runs = runs.filter((run) => run.module === args.module);
    }
    if (args.entityType) {
      runs = runs.filter((run) => run.entityType === args.entityType);
    }
    if (args.entityId) {
      runs = runs.filter((run) => run.entityId === args.entityId);
    }

    return runs.slice(0, limit);
  },
});

export const getRunSteps = query({
  args: {
    organizationId: v.id("organizations"),
    runId: v.id("automationRuns"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("automationRunSteps")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
  },
});

export const createRule = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    module: automationModuleValidator,
    eventType: v.string(),
    entityType: v.optional(v.string()),
    trigger: v.optional(automationTriggerDefinitionValidator),
    graph: v.optional(automationGraphValidator),
    definitionVersion: v.optional(v.number()),
    conditions: v.array(automationConditionValidator),
    actions: v.array(automationRuleActionValidator),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const now = Date.now();
    return await ctx.db.insert("automationRules", {
      ...args,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRule = mutation({
  args: {
    organizationId: v.id("organizations"),
    ruleId: v.id("automationRules"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    module: v.optional(automationModuleValidator),
    eventType: v.optional(v.string()),
    entityType: v.optional(v.string()),
    trigger: v.optional(automationTriggerDefinitionValidator),
    graph: v.optional(automationGraphValidator),
    definitionVersion: v.optional(v.number()),
    conditions: v.optional(v.array(automationConditionValidator)),
    actions: v.optional(v.array(automationRuleActionValidator)),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.organizationId !== args.organizationId) {
      throw new Error("Automation rule not found");
    }

    const { organizationId, ruleId, ...updates } = args;
    await ctx.db.patch(ruleId, {
      ...updates,
      updatedAt: Date.now(),
    });

    return ruleId;
  },
});

export const deleteRule = mutation({
  args: {
    organizationId: v.id("organizations"),
    ruleId: v.id("automationRules"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.organizationId !== args.organizationId) {
      throw new Error("Automation rule not found");
    }

    await ctx.db.delete(args.ruleId);
    return args.ruleId;
  },
});

export const listEventCatalog = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return EVENT_REGISTRY.map((event) => ({
      module: event.module,
      eventType: event.eventType,
      label: event.label,
      entityType: event.entityType,
      source: event.source,
      variableCatalog: event.variables,
      samplePayload: event.samplePayload,
    }));
  },
});

export const listActionCapabilities = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const emailAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const smsConfig = await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    return buildActionCapabilities({
      hasEmail: emailAccounts.length > 0,
      hasSms: smsConfig?.isActive === true,
    });
  },
});

export const listActionTypes = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const emailAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const smsConfig = await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    return buildActionCapabilities({
      hasEmail: emailAccounts.length > 0,
      hasSms: smsConfig?.isActive === true,
    })
      .filter((capability) => capability.available)
      .map((capability) => capability.type);
  },
});

export const listEntityRuns = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return await ctx.db
      .query("automationRuns")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .order("desc")
      .collect();
  },
});

export const emitEvent = internalMutation({
  args: automationEventArgsValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationRuns")
      .withIndex("by_eventIdempotencyKey", (q) =>
        q.eq("eventIdempotencyKey", args.eventIdempotencyKey),
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const runId = await ctx.db.insert("automationRuns", {
      organizationId: args.organizationId,
      module: args.module,
      eventType: args.eventType,
      entityType: args.entityType,
      entityId: args.entityId,
      eventIdempotencyKey: args.eventIdempotencyKey,
      correlationKey: args.correlationKey,
      payloadSnapshot: args.payload,
      actorUserId: args.actorUserId,
      status: "pending",
      occurredAt: args.occurredAt ?? now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.automation.processRun, { runId });
    return runId;
  },
});

export const processRun = internalMutation({
  args: { runId: v.id("automationRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "pending") return;

    const payload = JSON.parse(run.payloadSnapshot) as Record<string, unknown>;
    const rules = await ctx.db
      .query("automationRules")
      .withIndex("by_orgAndEventType", (q) =>
        q.eq("organizationId", run.organizationId).eq("eventType", run.eventType),
      )
      .collect();

    const enabledRules = rules.filter(
      (rule) =>
        rule.enabled &&
        (!rule.entityType || !run.entityType || rule.entityType === run.entityType),
    );

    let matchedRuleId: Id<"automationRules"> | undefined;
    let sawFailure = false;
    let processedAny = false;

    for (const rule of enabledRules) {
      const matches = rule.conditions.every((condition) =>
        evaluateCondition(payload, condition),
      );
      if (!matches) continue;

      matchedRuleId = rule._id;
      processedAny = true;

      for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex += 1) {
        const action = rule.actions[actionIndex];
        const stepIdempotencyKey = `${run.eventIdempotencyKey}:rule:${rule._id}:action:${actionIndex}`;
        const existingStep = await ctx.db
          .query("automationRunSteps")
          .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", stepIdempotencyKey))
          .unique();

        if (existingStep) continue;

        const now = Date.now();
        const baseStep = {
          organizationId: run.organizationId,
          runId: run._id,
          ruleId: rule._id,
          actionIndex,
          actionType: action.type,
          idempotencyKey: stepIdempotencyKey,
          status: "pending" as const,
          createdAt: now,
          updatedAt: now,
        };

        const stepId = await ctx.db.insert("automationRunSteps", baseStep);

        try {
          if (action.type === "send_email") {
            const recipientEmail = stringifyValue(
              getPathValue(payload, action.recipientEmailPath),
            );
            const recipientName = action.recipientNamePath
              ? stringifyValue(getPathValue(payload, action.recipientNamePath))
              : undefined;

            if (!recipientEmail) {
              await ctx.db.patch(stepId, {
                status: "skipped",
                errorMessage: "Missing email recipient",
                processedAt: now,
                updatedAt: now,
              });
              await patchLegacyAppointmentWorkflowHistory(ctx, {
                organizationId: run.organizationId,
                appointmentId:
                  run.entityType === "gabinetAppointment"
                    ? (run.entityId as Id<"gabinetAppointments">)
                    : undefined,
                actionType: action.type,
                recipient: recipientEmail,
                recipientName,
                status: "skipped",
                errorMessage: "Missing email recipient",
                idempotencyKey: stepIdempotencyKey,
                processedAt: now,
              });
              continue;
            }

            if (!("mode" in action)) {
              const logId = await ctx.runMutation(internal.emailEventTrigger.triggerEmailEvent, {
                organizationId: run.organizationId,
                eventType: action.templateEventType,
                recipientEmail,
                recipientName,
                payload: run.payloadSnapshot,
                relatedEntityType: run.entityType,
                relatedEntityId: run.entityId,
                idempotencyKey: stepIdempotencyKey,
                triggeredBy: run.actorUserId,
                source: "platform_automation",
              });

              await ctx.db.patch(stepId, {
                status: "processed",
                recipient: recipientEmail,
                recipientName,
                emailEventLogId: logId,
                processedAt: now,
                updatedAt: now,
              });
              await patchLegacyAppointmentWorkflowHistory(ctx, {
                organizationId: run.organizationId,
                appointmentId:
                  run.entityType === "gabinetAppointment"
                    ? (run.entityId as Id<"gabinetAppointments">)
                    : undefined,
                actionType: action.type,
                recipient: recipientEmail,
                recipientName,
                renderedBody: run.payloadSnapshot,
                status: "pending",
                idempotencyKey: stepIdempotencyKey,
              });
              continue;
            }

            let renderedSubject = "";
            let renderedBody = "";
            let linkedEntityType: string | undefined;
            let linkedEntityId: string | undefined;

            if (action.mode === "template") {
              const template = await ctx.db.get(action.templateId);
              if (!template || template.organizationId !== run.organizationId) {
                throw new Error("Email template not found");
              }

              const sourceInstances = buildEmailTemplateSourceInstances(payload, run);
              const resolverContext = {
                orgId: String(run.organizationId),
                userId: run.actorUserId ? String(run.actorUserId) : "",
              };

              renderedSubject = await renderTemplateString(
                ctx as never,
                template.subject,
                sourceInstances,
                resolverContext,
              );
              renderedBody = await renderTemplateString(
                ctx as never,
                template.body,
                sourceInstances,
                resolverContext,
              );
            } else {
              renderedSubject = applyTemplate(action.subjectTemplate, payload);
              renderedBody = applyTemplate(action.bodyTemplate, payload);
            }

            const emailId = await insertAutomationEmail(ctx, {
              organizationId: run.organizationId,
              recipientEmail,
              subject: renderedSubject,
              bodyHtml: renderedBody,
              bodyText: stripHtml(renderedBody),
              sentBy: run.actorUserId,
            });
            linkedEntityType = "email";
            linkedEntityId = String(emailId);

            await ctx.db.patch(stepId, {
              status: "processed",
              recipient: recipientEmail,
              recipientName,
              linkedEntityType,
              linkedEntityId,
              renderedSubject,
              renderedBody,
              processedAt: now,
              updatedAt: now,
            });
            await patchLegacyAppointmentWorkflowHistory(ctx, {
              organizationId: run.organizationId,
              appointmentId:
                run.entityType === "gabinetAppointment"
                  ? (run.entityId as Id<"gabinetAppointments">)
                  : undefined,
              actionType: action.type,
              recipient: recipientEmail,
              recipientName,
              renderedSubject,
              renderedBody,
              status: "sent",
              idempotencyKey: stepIdempotencyKey,
              processedAt: now,
            });
            continue;
          }

          if (action.type === "send_sms" || action.type === "send_sms_request") {
            const phone = stringifyValue(getPathValue(payload, action.phonePath));
            const renderedBody = applyTemplate(action.messageTemplate, payload);

            if (!phone) {
              await ctx.db.patch(stepId, {
                status: "skipped",
                errorMessage: "Missing SMS recipient",
                processedAt: now,
                updatedAt: now,
              });
              await patchLegacyAppointmentWorkflowHistory(ctx, {
                organizationId: run.organizationId,
                appointmentId:
                  run.entityType === "gabinetAppointment"
                    ? (run.entityId as Id<"gabinetAppointments">)
                    : undefined,
                actionType: action.type,
                recipient: phone,
                renderedBody,
                status: "skipped",
                errorMessage: "Missing SMS recipient",
                idempotencyKey: stepIdempotencyKey,
                processedAt: now,
              });
              continue;
            }

            const appointmentSmsEventId =
              run.entityType === "gabinetAppointment"
                ? await ctx.runMutation(internal.gabinet.appointmentSms.queueAutomationSms, {
                    organizationId: run.organizationId,
                    appointmentId: run.entityId as Id<"gabinetAppointments">,
                    phone,
                    message: renderedBody,
                    eventType: run.eventType,
                    idempotencyKey: stepIdempotencyKey,
                  })
                : null;

            if (!appointmentSmsEventId) {
              await ctx.scheduler.runAfter(0, internal.sms.sendAppointmentSms, {
                organizationId: run.organizationId,
                phone,
                message: renderedBody,
              });
            }

            await ctx.db.patch(stepId, {
              status: "processed",
              recipient: phone,
              renderedBody,
              appointmentSmsEventId: appointmentSmsEventId ?? undefined,
              processedAt: now,
              updatedAt: now,
            });
            await patchLegacyAppointmentWorkflowHistory(ctx, {
              organizationId: run.organizationId,
              appointmentId:
                run.entityType === "gabinetAppointment"
                  ? (run.entityId as Id<"gabinetAppointments">)
                  : undefined,
              actionType: action.type,
              recipient: phone,
              renderedBody,
              status: "sent",
              idempotencyKey: stepIdempotencyKey,
              processedAt: now,
            });
            continue;
          }

          if (action.type === "create_notification") {
            const userId = getPathValue(payload, action.userIdPath) as Id<"users"> | undefined;
            const title = applyTemplate(action.titleTemplate, payload);
            const message = applyTemplate(action.messageTemplate, payload);
            const link = action.linkTemplate
              ? applyTemplate(action.linkTemplate, payload)
              : undefined;

            if (!userId) {
              await ctx.db.patch(stepId, {
                status: "skipped",
                errorMessage: "Missing notification user",
                processedAt: now,
                updatedAt: now,
              });
              continue;
            }

            await createNotificationDirect(ctx, {
              organizationId: run.organizationId,
              userId,
              type: "automation_rule",
              title,
              message,
              link,
            });

            await ctx.db.patch(stepId, {
              status: "processed",
              linkedEntityType: "notification",
              linkedEntityId: String(userId),
              renderedSubject: title,
              renderedBody: message,
              processedAt: now,
              updatedAt: now,
            });
            continue;
          }

          if (action.type === "update_field") {
            const result = await applyUpdateFieldAction(ctx, {
              organizationId: run.organizationId,
              actorUserId: run.actorUserId,
              payload,
              run,
              action,
            });

            await ctx.db.patch(stepId, {
              status: "processed",
              linkedEntityType: result.linkedEntityType,
              linkedEntityId: result.linkedEntityId,
              renderedBody: result.renderedBody,
              processedAt: now,
              updatedAt: now,
            });
            continue;
          }

          const entityType = action.entityTypePath
            ? stringifyValue(getPathValue(payload, action.entityTypePath))
            : run.entityType ?? "activity";
          const entityId = action.entityIdPath
            ? stringifyValue(getPathValue(payload, action.entityIdPath))
            : run.entityId ?? "";
          const description = applyTemplate(action.descriptionTemplate, payload);

          if (!entityType || !entityId || !run.actorUserId) {
            await ctx.db.patch(stepId, {
              status: "skipped",
              errorMessage: "Missing activity target or actor",
              processedAt: now,
              updatedAt: now,
            });
            continue;
          }

          await logActivity(ctx, {
            organizationId: run.organizationId,
            entityType,
            entityId,
            action: action.activityAction,
            description,
            metadata: {
              automationRunId: run._id,
              automationRuleId: rule._id,
              sourceEventType: run.eventType,
            },
            performedBy: run.actorUserId,
          });

          await ctx.db.patch(stepId, {
            status: "processed",
            linkedEntityType: entityType,
            linkedEntityId: entityId,
            renderedBody: description,
            processedAt: now,
            updatedAt: now,
          });
        } catch (error) {
          sawFailure = true;
          await ctx.db.patch(stepId, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : String(error),
            processedAt: now,
            updatedAt: now,
          });
          await patchLegacyAppointmentWorkflowHistory(ctx, {
            organizationId: run.organizationId,
            appointmentId:
              run.entityType === "gabinetAppointment"
                ? (run.entityId as Id<"gabinetAppointments">)
                : undefined,
            actionType: action.type,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : String(error),
            idempotencyKey: stepIdempotencyKey,
            processedAt: now,
          });
        }
      }
    }

    const processedAt = Date.now();
    await ctx.db.patch(run._id, {
      ruleId: matchedRuleId,
      status: sawFailure ? "failed" : processedAny ? "processed" : "skipped",
      errorMessage: processedAny ? undefined : "No matching automation rules",
      processedAt,
      updatedAt: processedAt,
    });
  },
});

export const getEnabledRulesForEvent = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("automationRules")
      .withIndex("by_orgAndEventType", (q) =>
        q.eq("organizationId", args.organizationId).eq("eventType", args.eventType),
      )
      .collect();
  },
});
