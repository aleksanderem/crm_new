import {
  internalAction,
  internalMutation,
  action,
  query,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { createNotificationDirect } from "./notifications";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { Id } from "./_generated/dataModel";
import {
  automationGraphValidator,
  automationRuleActionValidator,
  automationTriggerDefinitionValidator,
} from "./schema";
import { AUTH_EMAIL, AUTH_RESEND_KEY } from "@cvx/env";
import { renderTemplateString } from "./emailTemplates";
import { DEFAULT_PERMISSIONS } from "./_helpers/permissions";
import type { Feature, Scope } from "./_helpers/permissionTypes";
import type { OrgRole } from "./schema";
import { defaultGabinetScope, maxScope } from "./_helpers/gabinetRolePermissions";
import {
  buildActionCapabilities,
  listEventCatalogEntries,
  resolveRuleTrigger,
} from "./automationRegistry";

// @ts-ignore
const patchLegacyRef = internal.automation._patchLegacyAppointmentWorkflowHistory;

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

type AutomationTargetEntityType =
  | "gabinetPatient"
  | "gabinetAppointment"
  | "gabinetEmployee"
  | "lead";

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
  lead: new Set([
    "title",
    "value",
    "currency",
    "status",
    "priority",
    "expectedCloseDate",
    "source",
    "companyId",
    "assignedTo",
    "notes",
    "tags",
    "lostReason",
  ]),
};

type AutomationUpdateFieldDescriptor = {
  table: "gabinetPatients" | "gabinetAppointments" | "gabinetEmployees" | "leads";
  linkedEntityType: AutomationTargetEntityType;
  permissionFeature: Feature;
  requireAdmin?: boolean;
  notFoundMessage: string;
  unsupportedStandardFieldMessage: string;
  unsupportedCustomFieldMessage: string;
  supportsCustom: boolean;
  resolveTargetId: (payload: Record<string, unknown>, run: { entityType?: string; entityId?: string }) =>
    | string
    | undefined;
  canEditOwn: (
    entity: Record<string, unknown>,
    actorUserId: Id<"users"> | undefined,
  ) => boolean;
};

const AUTOMATION_UPDATE_FIELD_DESCRIPTORS: Record<
  AutomationTargetEntityType,
  AutomationUpdateFieldDescriptor
> = {
  gabinetPatient: {
    table: "gabinetPatients",
    linkedEntityType: "gabinetPatient",
    permissionFeature: "gabinet_patients",
    notFoundMessage: "Patient not found",
    unsupportedStandardFieldMessage: "Unsupported patient field update target",
    unsupportedCustomFieldMessage: "Custom patient field updates are not supported",
    supportsCustom: true,
    resolveTargetId: (payload, run) => {
      if (run.entityType === "gabinetPatient" && run.entityId) {
        return run.entityId;
      }
      const patientId = stringifyValue(getPathValue(payload, "patientId"));
      return patientId || undefined;
    },
    canEditOwn: (entity, actorUserId) => entity.createdBy === actorUserId,
  },
  gabinetAppointment: {
    table: "gabinetAppointments",
    linkedEntityType: "gabinetAppointment",
    permissionFeature: "gabinet_appointments",
    notFoundMessage: "Appointment not found",
    unsupportedStandardFieldMessage: "Unsupported appointment field update target",
    unsupportedCustomFieldMessage: "Custom appointment field updates are not supported",
    supportsCustom: false,
    resolveTargetId: (payload, run) => {
      if (run.entityType === "gabinetAppointment" && run.entityId) {
        return run.entityId;
      }
      const appointmentId = stringifyValue(getPathValue(payload, "appointmentId"));
      return appointmentId || undefined;
    },
    canEditOwn: (entity, actorUserId) => entity.createdBy === actorUserId,
  },
  gabinetEmployee: {
    table: "gabinetEmployees",
    linkedEntityType: "gabinetEmployee",
    permissionFeature: "gabinet_employees",
    requireAdmin: true,
    notFoundMessage: "Employee not found",
    unsupportedStandardFieldMessage: "Unsupported employee field update target",
    unsupportedCustomFieldMessage: "Custom employee field updates are not supported",
    supportsCustom: false,
    resolveTargetId: (_payload, run) => {
      if (run.entityType === "gabinetEmployee" && run.entityId) {
        return run.entityId;
      }
      return undefined;
    },
    canEditOwn: (entity, actorUserId) => entity.createdBy === actorUserId,
  },
  lead: {
    table: "leads",
    linkedEntityType: "lead",
    permissionFeature: "leads",
    notFoundMessage: "Lead not found",
    unsupportedStandardFieldMessage: "Unsupported lead field update target",
    unsupportedCustomFieldMessage: "Custom lead field updates are not supported",
    supportsCustom: false,
    resolveTargetId: (payload, run) => {
      if (run.entityType === "lead" && run.entityId) {
        return run.entityId;
      }
      const leadId = stringifyValue(getPathValue(payload, "leadId"));
      return leadId || undefined;
    },
    canEditOwn: (entity, actorUserId) =>
      entity.createdBy === actorUserId || entity.assignedTo === actorUserId,
  },
};

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "");
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
  descriptor: AutomationUpdateFieldDescriptor,
  targetIdPath?: string,
) {
  if (targetIdPath) {
    const explicitId = stringifyValue(getPathValue(payload, targetIdPath));
    return explicitId || undefined;
  }

  return descriptor.resolveTargetId(payload, run);
}

async function getAutomationEditPermission(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  actorUserId: Id<"users"> | undefined,
  feature: Feature,
  options?: { requireAdmin?: boolean },
): Promise<{ allowed: boolean; scope: Scope; reason?: string }> {
  if (!actorUserId) {
    return {
      allowed: false,
      scope: "none",
      reason: "Missing automation actor",
    };
  }

  // teamMemberships and orgPermissions are dual-written to Convex
  // (_writeOrgPermissionsToConvex, ctx.db.insert in teams/invitations).
  // ctx.db reads are the permanent pattern for mutation callers — identical
  // to checkPermission in _helpers/permissions.ts. Do NOT replace with
  // createSupabaseDb(): mutations cannot use fetch in the Convex runtime.
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

  const role = membership.role as OrgRole;

  if (role === "owner" || role === "admin") {
    return { allowed: true, scope: "all" };
  }

  if (options?.requireAdmin) {
    return {
      allowed: false,
      scope: "none",
      reason: "Admin access required",
    };
  }

  // orgPermissions is kept in sync via dual-write; ctx.db is permanent here.
  const override = await ctx.db
    .query("orgPermissions")
    .withIndex("by_orgAndRole", (q) =>
      q.eq("organizationId", organizationId).eq("role", role),
    )
    .unique();

  let orgScope: Scope;
  if (override) {
    const perms = override.permissions as Record<string, Record<string, string>>;
    orgScope = (perms?.[feature]?.edit ?? DEFAULT_PERMISSIONS[role]?.[feature]?.edit ?? "none") as Scope;
  } else {
    orgScope = DEFAULT_PERMISSIONS[role]?.[feature]?.edit ?? "none";
  }

  // Gabinet-role scope (MAX-merge for gabinet_* features). gabinetMemberships,
  // gabinetRolePermissions, and gabinetMembershipPermissions are Convex-only
  // mirrors (not in TABLE_MAP) so they must be read via ctx.runQuery.
  let effectiveScope: Scope = orgScope;
  if (feature.startsWith("gabinet_")) {
    const gabinetData = await ctx.runQuery(
      internal._helpers.authAction._getGabinetPermissionData,
      { organizationId, userId: actorUserId },
    );
    if (gabinetData.membership) {
      const gRole = gabinetData.membership.gabinetRole;
      const gabinetScope: Scope = gabinetData.rolePermissions
        ? ((gabinetData.rolePermissions[feature]?.edit ?? defaultGabinetScope(gRole, feature, "edit")) as Scope)
        : defaultGabinetScope(gRole, feature, "edit");
      effectiveScope = maxScope(orgScope, gabinetScope);

      if (gabinetData.membershipPermissions) {
        const membershipScope = gabinetData.membershipPermissions[feature]?.edit;
        if (membershipScope !== undefined) {
          effectiveScope = membershipScope as Scope;
        }
      }
    }
  }

  if (effectiveScope === "none") {
    return {
      allowed: false,
      scope: effectiveScope,
      reason: "Permission denied",
    };
  }

  return {
    allowed: true,
    scope: effectiveScope,
  };
}

// Thin internalMutation wrappers called via ctx.runMutation from processRun
// (now an internalAction). These keep the mutation context for Convex writes.

export const _getAutomationPermission = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    actorUserId: v.optional(v.id("users")),
    feature: v.string(),
    requireAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await getAutomationEditPermission(
      ctx,
      args.organizationId,
      args.actorUserId,
      args.feature as Feature,
      args.requireAdmin ? { requireAdmin: true } : undefined,
    );
  },
});

export const _createNotificationForRun = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await createNotificationDirect(ctx, args);
  },
});

export const _logActivityForRun = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    activityAction: v.string(),
    description: v.string(),
    automationRunId: v.string(),
    automationRuleId: v.string(),
    sourceEventType: v.string(),
    performedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: args.entityType,
      entityId: args.entityId,
      action: args.activityAction as import("@cvx/schema").ActivityAction,
      description: args.description,
      metadata: {
        automationRunId: args.automationRunId,
        automationRuleId: args.automationRuleId,
        sourceEventType: args.sourceEventType,
      },
      performedBy: args.performedBy,
    });
  },
});

// Resend send call extracted to an internalAction so processRun does not
// perform network I/O as a mutation. Now that processRun is an internalAction,
// this remains a separate action to keep the email-sending logic isolated.
// The default email account is looked up from Supabase (the email_accounts
// source of truth, see convex/emailAccounts.ts header); reading via ctx.db
// in production returns the empty Convex mirror and would always fail with
// "No default email account configured".
export const _sendAutomationEmail = internalAction({
  args: {
    organizationId: v.id("organizations"),
    stepId: v.string(),
    recipient: v.string(),
    recipientName: v.optional(v.string()),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    sentBy: v.optional(v.id("users")),
    // Supabase UUID; gabinet appointments moved off Convex ids in #353.
    appointmentId: v.optional(v.string()),
    actionType: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const emailAccounts = await db
      .query("emailAccounts")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const defaultAccount = emailAccounts.find((account) => account.isDefault);
    if (!defaultAccount) {
      await ctx.runMutation(internal.emailSendLog.record, {
        organizationId: args.organizationId,
        source: "automation",
        provider: "resend",
        status: "skipped",
        errorMessage: "No default email account configured",
        recipientEmail: args.recipient,
        recipientName: args.recipientName,
        subject: args.subject,
        relatedEntityType: args.appointmentId ? "gabinetAppointment" : undefined,
        relatedEntityId: args.appointmentId,
        idempotencyKey: args.idempotencyKey,
        triggeredBy: args.sentBy,
      });
      await ctx.runMutation(internal.automation._recordAutomationEmailResult, {
        organizationId: args.organizationId,
        stepId: args.stepId,
        success: false,
        errorMessage: "No default email account configured",
        fromEmail: "",
        recipient: args.recipient,
        recipientName: args.recipientName,
        subject: args.subject,
        bodyHtml: args.bodyHtml,
        bodyText: args.bodyText,
        sentBy: args.sentBy,
        appointmentId: args.appointmentId,
        actionType: args.actionType,
        idempotencyKey: args.idempotencyKey,
      });
      return;
    }

    const from = AUTH_EMAIL ?? "Convex SaaS <onboarding@resend.dev>";
    const logBase = {
      organizationId: args.organizationId,
      source: "automation" as const,
      provider: "resend" as const,
      recipientEmail: args.recipient,
      recipientName: args.recipientName,
      fromEmail: from,
      subject: args.subject,
      relatedEntityType: args.appointmentId ? "gabinetAppointment" : undefined,
      relatedEntityId: args.appointmentId,
      idempotencyKey: args.idempotencyKey,
      triggeredBy: args.sentBy,
    };
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${AUTH_RESEND_KEY ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: args.recipient,
          subject: args.subject,
          html: args.bodyHtml,
          text: args.bodyText,
        }),
      });
      if (!response.ok) {
        throw new Error(`Failed to send automation email (${response.status})`);
      }
      await ctx.runMutation(internal.emailSendLog.record, {
        ...logBase,
        status: "sent",
      });
      await ctx.runMutation(internal.automation._recordAutomationEmailResult, {
        organizationId: args.organizationId,
        stepId: args.stepId,
        success: true,
        fromEmail: defaultAccount.fromEmail,
        recipient: args.recipient,
        recipientName: args.recipientName,
        subject: args.subject,
        bodyHtml: args.bodyHtml,
        bodyText: args.bodyText,
        sentBy: args.sentBy,
        appointmentId: args.appointmentId,
        actionType: args.actionType,
        idempotencyKey: args.idempotencyKey,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.emailSendLog.record, {
        ...logBase,
        status: "failed",
        errorMessage,
      });
      await ctx.runMutation(internal.automation._recordAutomationEmailResult, {
        organizationId: args.organizationId,
        stepId: args.stepId,
        success: false,
        errorMessage,
        fromEmail: defaultAccount.fromEmail,
        recipient: args.recipient,
        recipientName: args.recipientName,
        subject: args.subject,
        bodyHtml: args.bodyHtml,
        bodyText: args.bodyText,
        sentBy: args.sentBy,
        appointmentId: args.appointmentId,
        actionType: args.actionType,
        idempotencyKey: args.idempotencyKey,
      });
    }
  },
});

export const _patchAutomationRun = internalAction({
  args: {
    runId: v.string(),
    status: v.string(),
    updatedAt: v.number(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    await db.patch("automationRuns", args.runId, {
      status: args.status,
      updatedAt: args.updatedAt,
    });
  },
});

export const _patchAutomationRunStep = internalAction({
  args: {
    stepId: v.string(),
    status: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    recipient: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    updatedAt: v.number(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const updates: Record<string, unknown> = { updatedAt: args.updatedAt };
    if (args.status !== undefined) updates.status = args.status;
    if (args.errorMessage !== undefined) updates.errorMessage = args.errorMessage;
    if (args.recipient !== undefined) updates.recipient = args.recipient;
    if (args.recipientName !== undefined) updates.recipientName = args.recipientName;
    if (args.linkedEntityType !== undefined) updates.linkedEntityType = args.linkedEntityType;
    if (args.linkedEntityId !== undefined) updates.linkedEntityId = args.linkedEntityId;
    if (args.renderedSubject !== undefined) updates.renderedSubject = args.renderedSubject;
    if (args.renderedBody !== undefined) updates.renderedBody = args.renderedBody;
    if (args.processedAt !== undefined) updates.processedAt = args.processedAt;
    await db.patch("automationRunSteps", args.stepId, updates);
  },
});

export const _recordAutomationEmailResult = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    stepId: v.string(),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    fromEmail: v.string(),
    recipient: v.string(),
    recipientName: v.optional(v.string()),
    subject: v.string(),
    bodyHtml: v.string(),
    bodyText: v.string(),
    sentBy: v.optional(v.id("users")),
    // Supabase UUID; gabinet appointments moved off Convex ids in #353.
    appointmentId: v.optional(v.string()),
    actionType: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (!args.success) {
      await ctx.scheduler.runAfter(0, internal.automation._patchAutomationRunStep, {
        stepId: args.stepId,
        status: "failed",
        errorMessage: args.errorMessage,
        processedAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, patchLegacyRef, {
        organizationId: args.organizationId,
        appointmentId: args.appointmentId,
        actionType: args.actionType,
        recipient: args.recipient,
        recipientName: args.recipientName,
        renderedSubject: args.subject,
        renderedBody: args.bodyHtml,
        status: "failed",
        errorMessage: args.errorMessage,
        idempotencyKey: args.idempotencyKey,
        processedAt: now,
      });
      return;
    }

    const emailId = await ctx.db.insert("emails", {
      organizationId: args.organizationId,
      threadId: `<${crypto.randomUUID()}@crm.app>`,
      messageId: `<${crypto.randomUUID()}@crm.app>`,
      direction: "outbound",
      from: args.fromEmail,
      to: [args.recipient],
      subject: args.subject,
      bodyHtml: args.bodyHtml,
      bodyText: args.bodyText,
      snippet: args.bodyText.slice(0, 200),
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
        description: `Sent email \"${args.subject}\" to ${args.recipient}`,
        performedBy: args.sentBy,
      });
    }

    await ctx.scheduler.runAfter(0, internal.automation._patchAutomationRunStep, {
      stepId: args.stepId,
      status: "processed",
      recipient: args.recipient,
      recipientName: args.recipientName,
      linkedEntityType: "email",
      linkedEntityId: String(emailId),
      renderedSubject: args.subject,
      renderedBody: args.bodyHtml,
      processedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, patchLegacyRef, {
      organizationId: args.organizationId,
      appointmentId: args.appointmentId,
      actionType: args.actionType,
      recipient: args.recipient,
      recipientName: args.recipientName,
      renderedSubject: args.subject,
      renderedBody: args.bodyHtml,
      status: "sent",
      idempotencyKey: args.idempotencyKey,
      processedAt: now,
    });
  },
});

// Entity read + Supabase write extracted to an internalAction — mutations
// cannot use fetch(), and createSupabaseDb() makes HTTP calls to Supabase.
// Permission check (ctx.db reads) stays in the mutation caller; scope and
// targetId are passed as arguments so the action can finish the "own" check
// against the entity it reads. The action chains into _recordUpdateFieldResult
// which does the Convex mirror write, activity log, and step status patch.
export const _applyUpdateFieldAction = internalAction({
  args: {
    organizationId: v.id("organizations"),
    runId: v.string(),
    stepId: v.string(),
    actorUserId: v.optional(v.id("users")),
    targetEntityType: v.union(
      v.literal("gabinetPatient"),
      v.literal("gabinetAppointment"),
      v.literal("gabinetEmployee"),
      v.literal("lead"),
    ),
    targetId: v.string(),
    permissionScope: v.union(v.literal("none"), v.literal("own"), v.literal("all")),
    fieldKind: v.union(v.literal("standard"), v.literal("custom")),
    fieldKey: v.string(),
    valueTemplate: v.string(),
    valueType: v.union(v.literal("string"), v.literal("number"), v.literal("boolean"), v.literal("date")),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const descriptor = AUTOMATION_UPDATE_FIELD_DESCRIPTORS[args.targetEntityType];
    let errorMessage: string | undefined;
    let resultUpdates: Record<string, unknown> | undefined;
    let renderedBody: string | undefined;

    try {
      const db = createSupabaseDb();
      const entity = (await db.get(descriptor.table, args.targetId)) as
        | ({ organizationId?: string; customFields?: unknown } & Record<string, unknown>)
        | null;
      if (!entity || String(entity.organizationId) !== String(args.organizationId)) {
        throw new Error(descriptor.notFoundMessage);
      }
      if (args.permissionScope === "own" && !descriptor.canEditOwn(entity, args.actorUserId)) {
        throw new Error("Permission denied: you can only edit your own records");
      }

      const renderedValue = applyTemplate(args.valueTemplate, args.payload as Record<string, unknown>);
      const coercedValue = coerceAutomationFieldValue(renderedValue, args.valueType);
      const now = Date.now();

      let updates: Record<string, unknown>;
      if (args.fieldKind === "custom") {
        if (!descriptor.supportsCustom) {
          throw new Error(descriptor.unsupportedCustomFieldMessage);
        }
        const existingCustomFields =
          entity.customFields && typeof entity.customFields === "object"
            ? (entity.customFields as Record<string, unknown>)
            : {};
        updates = {
          customFields: { ...existingCustomFields, [args.fieldKey]: coercedValue },
          updatedAt: now,
        };
      } else {
        if (!STANDARD_FIELD_ALLOWLIST[descriptor.linkedEntityType].has(args.fieldKey)) {
          throw new Error(descriptor.unsupportedStandardFieldMessage);
        }
        updates = { [args.fieldKey]: coercedValue, updatedAt: now };
      }

      await db.patch(descriptor.table, args.targetId, updates);
      resultUpdates = updates;
      renderedBody = `${args.fieldKind}:${args.fieldKey}=${String(coercedValue)}`;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    await ctx.runMutation(internal.automation._recordUpdateFieldResult, {
      organizationId: args.organizationId,
      runId: args.runId,
      stepId: args.stepId,
      actorUserId: args.actorUserId,
      success: resultUpdates !== undefined,
      errorMessage,
      targetEntityType: args.targetEntityType,
      targetId: args.targetId,
      linkedEntityType: descriptor.linkedEntityType,
      fieldKey: args.fieldKey,
      renderedBody,
      updates: resultUpdates,
    });
  },
});

export const _recordUpdateFieldResult = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    runId: v.optional(v.string()),
    stepId: v.string(),
    actorUserId: v.optional(v.id("users")),
    success: v.boolean(),
    errorMessage: v.optional(v.string()),
    targetEntityType: v.optional(v.union(
      v.literal("gabinetPatient"),
      v.literal("gabinetAppointment"),
      v.literal("gabinetEmployee"),
      v.literal("lead"),
    )),
    targetId: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    fieldKey: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    updates: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (!args.success) {
      await ctx.scheduler.runAfter(0, internal.automation._patchAutomationRunStep, {
        stepId: args.stepId,
        status: "failed",
        errorMessage: args.errorMessage,
        processedAt: now,
        updatedAt: now,
      });
      if (args.runId) {
        await ctx.scheduler.runAfter(0, internal.automation._patchAutomationRun, {
          runId: args.runId,
          status: "failed",
          updatedAt: now,
        });
      }
      return;
    }

    // Mirror to Convex if a doc with this id still exists there (gabinet
    // entities seeded by tests, or legacy data not yet migrated). For
    // Supabase-only ids, normalizeId returns null and we silently skip.
    if (args.targetEntityType && args.targetId && args.updates) {
      const descriptor = AUTOMATION_UPDATE_FIELD_DESCRIPTORS[args.targetEntityType];
      const convexId = ctx.db.normalizeId(descriptor.table, args.targetId);
      if (convexId) {
        const convexDoc = await ctx.db.get(convexId);
        if (convexDoc) {
          await ctx.db.patch(convexId, args.updates as never);
        }
      }
    }

    if (args.actorUserId && args.linkedEntityType && args.targetId && args.fieldKey) {
      const activityLabelByEntity: Record<AutomationTargetEntityType, string> = {
        gabinetPatient: "patient",
        gabinetAppointment: "appointment",
        gabinetEmployee: "employee",
        lead: "lead",
      };
      const entityLabel = args.targetEntityType
        ? (activityLabelByEntity[args.targetEntityType] ?? args.targetEntityType)
        : args.linkedEntityType;
      await logActivity(ctx, {
        organizationId: args.organizationId,
        entityType: args.linkedEntityType,
        entityId: args.targetId,
        action: "updated",
        description: `Updated ${entityLabel} field ${args.fieldKey} via automation`,
        performedBy: args.actorUserId,
      });
    }

    await ctx.scheduler.runAfter(0, internal.automation._patchAutomationRunStep, {
      stepId: args.stepId,
      status: "processed",
      linkedEntityType: args.linkedEntityType,
      linkedEntityId: args.targetId,
      renderedBody: args.renderedBody,
      processedAt: now,
      updatedAt: now,
    });
  },
});

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

async function patchLegacyAppointmentWorkflowHistory(args: {
  organizationId: Id<"organizations">;
  // Supabase UUID; gabinet appointments moved off Convex ids in #353.
  appointmentId?: string;
  actionType: string;
  recipient?: string;
  recipientName?: string;
  renderedSubject?: string;
  renderedBody?: string;
  status: "pending" | "sent" | "failed" | "skipped";
  errorMessage?: string;
  idempotencyKey: string;
  processedAt?: number;
}) {
  if (!args.appointmentId) return;

  const db = createSupabaseDb();
  const existing = await db
    .query("appointmentWorkflowHistory")
    .eq("idempotencyKey", args.idempotencyKey)
    .unique();

  const channel = args.actionType === "send_email" ? "email" : "sms";
  const now = Date.now();

  if (existing) {
    await db.patch("appointmentWorkflowHistory", String(existing._id), {
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

  await db.insert("appointmentWorkflowHistory", {
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

// Extracted to internalAction so mutations can schedule this via ctx.scheduler —
// createSupabaseDb() makes HTTP calls which are forbidden inside mutations.
export const _patchLegacyAppointmentWorkflowHistory = internalAction({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.optional(v.string()),
    actionType: v.string(),
    recipient: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    errorMessage: v.optional(v.string()),
    idempotencyKey: v.string(),
    processedAt: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    await patchLegacyAppointmentWorkflowHistory(args);
  },
});

// listRules/listRuns/getRunSteps read from Supabase (primary read path for
// automationRules/Runs/RunSteps). The production UI uses useSupabaseAutomation*
// hooks directly; these actions serve the test suite and e2e tests.
export const listRules = action({
  args: {
    organizationId: v.id("organizations"),
    module: v.optional(automationModuleValidator),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    let rules = await db
      .query("automationRules")
      .eq("organizationId", String(args.organizationId))
      .order("createdAt", false)
      .collect();

    if (args.module) {
      rules = rules.filter((rule) => rule.module === args.module);
    }

    if (rules.length === 0) return [];

    // Single query for all recent runs; group by ruleId in JS.
    const ruleIds = rules.map((r) => String(r._id));
    const recentRuns = await db
      .query("automationRuns")
      .eq("organizationId", String(args.organizationId))
      .in("ruleId", ruleIds)
      .order("createdAt", false)
      .collect();

    const latestRunByRule = new Map<string, (typeof recentRuns)[0]>();
    for (const run of recentRuns) {
      const ruleId = String(run.ruleId ?? "");
      if (ruleId && !latestRunByRule.has(ruleId)) {
        latestRunByRule.set(ruleId, run);
      }
    }

    return rules.map((rule) => ({
      ...rule,
      trigger: resolveRuleTrigger(rule as Parameters<typeof resolveRuleTrigger>[0]),
      lastRun: latestRunByRule.get(String(rule._id)) ?? null,
    }));
  },
});

export const listRuns = action({
  args: {
    organizationId: v.id("organizations"),
    module: v.optional(automationModuleValidator),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const limit = args.limit ?? 100;

    let q = createSupabaseDb()
      .query("automationRuns")
      .eq("organizationId", String(args.organizationId))
      .order("createdAt", false);

    if (args.module) q = q.eq("module", args.module);
    if (args.entityType) q = q.eq("entityType", args.entityType);
    if (args.entityId) q = q.eq("entityId", args.entityId);

    return await q.take(limit).collect();
  },
});

export const getRunSteps = action({
  args: {
    organizationId: v.id("organizations"),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    return await createSupabaseDb()
      .query("automationRunSteps")
      .eq("runId", String(args.runId))
      .collect();
  },
});

export const createRule = action({
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
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    // Supabase-primary: generate a UUID here and write to Supabase first.
    // processRun is now an internalAction that reads rules from Supabase, so
    // a Convex replica is no longer required for the engine to find this rule.
    const ruleId = crypto.randomUUID();

    const db = createSupabaseDb();
    await db.insert("automationRules", {
      _id: ruleId,
      organizationId: String(args.organizationId),
      name: args.name,
      description: args.description ?? null,
      module: args.module,
      eventType: args.eventType,
      entityType: args.entityType ?? null,
      trigger: args.trigger ?? null,
      graph: args.graph ?? null,
      definitionVersion: args.definitionVersion ?? null,
      conditions: args.conditions,
      actions: args.actions,
      enabled: args.enabled,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return ruleId;
  },
});

export const updateRule = action({
  args: {
    organizationId: v.id("organizations"),
    ruleId: v.string(),
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
  handler: async (ctx, args): Promise<string> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const updatedAt = Date.now();
    const db = createSupabaseDb();

    const supabaseRule = await db.get("automationRules", args.ruleId);
    if (!supabaseRule || supabaseRule.organizationId !== String(args.organizationId)) {
      throw new Error("Automation rule not found");
    }

    const updates: Record<string, unknown> = { updatedAt };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.module !== undefined) updates.module = args.module;
    if (args.eventType !== undefined) updates.eventType = args.eventType;
    if (args.entityType !== undefined) updates.entityType = args.entityType;
    if (args.trigger !== undefined) updates.trigger = args.trigger;
    if (args.graph !== undefined) updates.graph = args.graph;
    if (args.definitionVersion !== undefined) updates.definitionVersion = args.definitionVersion;
    if (args.conditions !== undefined) updates.conditions = args.conditions;
    if (args.actions !== undefined) updates.actions = args.actions;
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    await db.patch("automationRules", args.ruleId, updates);

    return args.ruleId;
  },
});

export const deleteRule = action({
  args: {
    organizationId: v.id("organizations"),
    ruleId: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();

    const supabaseRule = await db.get("automationRules", args.ruleId);
    if (!supabaseRule || supabaseRule.organizationId !== String(args.organizationId)) {
      throw new Error("Automation rule not found");
    }
    await db.delete("automationRules", args.ruleId);

    return args.ruleId;
  },
});

export const listEventCatalog = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return listEventCatalogEntries();
  },
});

// `emailAccounts` and `orgSmsConfig` are Supabase-primary (see
// convex/emailAccounts.ts and convex/sms.ts:saveConfig), so the Convex
// mirrors are empty in production. Reading them via ctx.db would always
// report `send_email`/`send_sms` as unavailable, hiding configured
// capabilities from the automation builder. Convex queries cannot read
// from Supabase, so these are exposed as actions instead.
export const listActionCapabilities = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    const emailAccounts = await db
      .query("emailAccounts")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const smsConfig = await db
      .query("orgSmsConfig")
      .eq("organizationId", String(args.organizationId))
      .first();

    return buildActionCapabilities({
      hasEmail: emailAccounts.length > 0,
      hasSms: smsConfig?.isActive === true,
    });
  },
});

export const listActionTypes = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<string[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    const emailAccounts = await db
      .query("emailAccounts")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const smsConfig = await db
      .query("orgSmsConfig")
      .eq("organizationId", String(args.organizationId))
      .first();

    return buildActionCapabilities({
      hasEmail: emailAccounts.length > 0,
      hasSms: smsConfig?.isActive === true,
    })
      .filter((capability) => capability.available)
      .map((capability) => capability.type);
  },
});

export const emitEvent = internalMutation({
  args: automationEventArgsValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const runId = crypto.randomUUID();
    const occurredAt = args.occurredAt ?? now;

    // @ts-ignore -- TS2589: type instantiation depth in generated Convex API types
    const processRunRef = internal.automation.processRun;
    await ctx.scheduler.runAfter(0, processRunRef, {
      runId,
      organizationId: args.organizationId,
      module: args.module,
      eventType: args.eventType,
      entityType: args.entityType,
      entityId: args.entityId,
      eventIdempotencyKey: args.eventIdempotencyKey,
      correlationKey: args.correlationKey,
      payloadSnapshot: args.payload,
      actorUserId: args.actorUserId,
      occurredAt,
      createdAt: now,
    });
    return runId;
  },
});

export const processRun = internalAction({
  args: {
    runId: v.string(),
    organizationId: v.id("organizations"),
    module: automationModuleValidator,
    eventType: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    eventIdempotencyKey: v.string(),
    correlationKey: v.optional(v.string()),
    payloadSnapshot: v.string(),
    actorUserId: v.optional(v.id("users")),
    occurredAt: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Run data is passed directly from emitEvent — no Convex read needed.
    const run = {
      _id: args.runId,
      organizationId: args.organizationId,
      module: args.module,
      eventType: args.eventType,
      entityType: args.entityType,
      entityId: args.entityId,
      eventIdempotencyKey: args.eventIdempotencyKey,
      correlationKey: args.correlationKey,
      payloadSnapshot: args.payloadSnapshot,
      actorUserId: args.actorUserId,
      occurredAt: args.occurredAt,
      createdAt: args.createdAt,
      status: "pending" as const,
    };

    const payload = JSON.parse(run.payloadSnapshot) as Record<string, unknown>;
    const processRunDb = createSupabaseDb();

    // Idempotency guard: if another processRun already claimed this eventIdempotencyKey
    // (e.g. emitEvent was called twice due to a Convex mutation retry), skip silently.
    // The Supabase UNIQUE constraint on event_idempotency_key is the last-line defence,
    // but relying on it alone means the second action throws a 23505 error rather than
    // returning cleanly. This explicit check restores the graceful early-exit behaviour
    // that the old ctx.db dedup provided.
    const existingRun = await processRunDb
      .query("automationRuns")
      .eq("eventIdempotencyKey", args.eventIdempotencyKey)
      .first();
    if (existingRun) return;

    await processRunDb.insert("automationRuns", {
      _id: args.runId,
      organizationId: args.organizationId as string,
      ruleId: null,
      module: args.module,
      eventType: args.eventType,
      entityType: args.entityType ?? null,
      entityId: args.entityId ?? null,
      eventIdempotencyKey: args.eventIdempotencyKey,
      correlationKey: args.correlationKey ?? null,
      payloadSnapshot: args.payloadSnapshot,
      actorUserId: (args.actorUserId as string | undefined) ?? null,
      status: "pending",
      errorMessage: null,
      occurredAt: args.occurredAt,
      processedAt: null,
      createdAt: args.createdAt,
      updatedAt: args.createdAt,
    });

    const rules = await processRunDb
      .query("automationRules")
      .eq("organizationId", String(run.organizationId))
      .eq("eventType", run.eventType)
      .collect();

    const enabledRules = rules.filter(
      (rule) =>
        rule.enabled &&
        (!rule.entityType || !run.entityType || rule.entityType === run.entityType),
    );

    let matchedRuleId: string | undefined;
    let sawFailure = false;
    let processedAny = false;

    for (const rule of enabledRules) {
      const matches = rule.conditions.every((condition) =>
        evaluateCondition(payload, condition),
      );
      if (!matches) continue;

      matchedRuleId = String(rule._id);
      processedAny = true;

      for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex += 1) {
        const action = rule.actions[actionIndex];
        const stepIdempotencyKey = `${run.eventIdempotencyKey}:rule:${rule._id}:action:${actionIndex}`;

        const now = Date.now();
        const stepId = crypto.randomUUID();

        await processRunDb.insert("automationRunSteps", {
          _id: stepId,
          organizationId: run.organizationId as string,
          runId: run._id,
          ruleId: rule._id as string,
          actionIndex,
          actionType: action.type,
          idempotencyKey: stepIdempotencyKey,
          status: "pending",
          recipient: null,
          recipientName: null,
          linkedEntityType: null,
          linkedEntityId: null,
          renderedSubject: null,
          renderedBody: null,
          metadataSnapshot: null,
          errorMessage: null,
          emailEventLogId: null,
          appointmentSmsEventId: null,
          processedAt: null,
          createdAt: now,
          updatedAt: now,
        });

        try {
          if (action.type === "send_email") {
            const recipientEmail = stringifyValue(
              getPathValue(payload, action.recipientEmailPath),
            );
            const recipientName = action.recipientNamePath
              ? stringifyValue(getPathValue(payload, action.recipientNamePath))
              : undefined;

            if (!recipientEmail) {
              await processRunDb.patch("automationRunSteps", stepId, {
                status: "skipped",
                errorMessage: "Missing email recipient",
                processedAt: now,
                updatedAt: now,
              });
              await ctx.scheduler.runAfter(0, patchLegacyRef, {
                organizationId: run.organizationId,
                appointmentId:
                  run.entityType === "gabinetAppointment"
                    ? run.entityId
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
              const logId = await ctx.runAction(internal.emailEventTrigger.triggerEmailEvent, {
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

              await processRunDb.patch("automationRunSteps", stepId, {
                status: "processed",
                recipient: recipientEmail,
                ...(recipientName !== undefined ? { recipientName } : {}),
                emailEventLogId: logId as string,
                processedAt: now,
                updatedAt: now,
              });
              await ctx.scheduler.runAfter(0, patchLegacyRef, {
                organizationId: run.organizationId,
                appointmentId:
                  run.entityType === "gabinetAppointment"
                    ? run.entityId
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

            if (action.mode === "template") {
              const template = await processRunDb.get("emailTemplates", String(action.templateId));
              if (!template || template.organizationId !== String(run.organizationId)) {
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

            // Default-account lookup + Resend call run inside the action —
            // Convex mutations cannot perform fetch or read from Supabase,
            // and `emailAccounts` is Supabase-primary (see convex/emailAccounts.ts).
            // The action chains into `_recordAutomationEmailResult` which
            // inserts the email row, updates the step status in Supabase,
            // and writes the legacy appointment workflow history entry.
            await ctx.scheduler.runAfter(
              0,
              internal.automation._sendAutomationEmail,
              {
                organizationId: run.organizationId,
                stepId,
                recipient: recipientEmail,
                recipientName,
                subject: renderedSubject,
                bodyHtml: renderedBody,
                bodyText: stripHtml(renderedBody),
                sentBy: run.actorUserId,
                appointmentId:
                  run.entityType === "gabinetAppointment"
                    ? run.entityId
                    : undefined,
                actionType: action.type,
                idempotencyKey: stepIdempotencyKey,
              },
            );
            continue;
          }

          if (action.type === "send_sms" || action.type === "send_sms_request") {
            const phone = stringifyValue(getPathValue(payload, action.phonePath));
            const renderedBody = applyTemplate(action.messageTemplate, payload);

            if (!phone) {
              await processRunDb.patch("automationRunSteps", stepId, {
                status: "skipped",
                errorMessage: "Missing SMS recipient",
                processedAt: now,
                updatedAt: now,
              });
              await ctx.scheduler.runAfter(0, patchLegacyRef, {
                organizationId: run.organizationId,
                appointmentId:
                  run.entityType === "gabinetAppointment"
                    ? run.entityId
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
                    appointmentId: run.entityId as string,
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

            await processRunDb.patch("automationRunSteps", stepId, {
              status: "processed",
              recipient: phone,
              renderedBody,
              ...(appointmentSmsEventId ? { appointmentSmsEventId: appointmentSmsEventId as string } : {}),
              processedAt: now,
              updatedAt: now,
            });
            await ctx.scheduler.runAfter(0, patchLegacyRef, {
              organizationId: run.organizationId,
              appointmentId:
                run.entityType === "gabinetAppointment"
                  ? run.entityId
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
              await processRunDb.patch("automationRunSteps", stepId, {
                status: "skipped",
                errorMessage: "Missing notification user",
                processedAt: now,
                updatedAt: now,
              });
              continue;
            }

            await ctx.runMutation(internal.automation._createNotificationForRun, {
              organizationId: run.organizationId,
              userId,
              type: "automation_rule",
              title,
              message,
              link,
            });

            await processRunDb.patch("automationRunSteps", stepId, {
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
            const descriptor = AUTOMATION_UPDATE_FIELD_DESCRIPTORS[action.targetEntityType];
            const targetId = resolveAutomationTargetId(payload, run, descriptor, action.targetIdPath);

            if (!targetId) {
              await processRunDb.patch("automationRunSteps", stepId, {
                status: "skipped",
                errorMessage: "Missing field update target",
                processedAt: now,
                updatedAt: now,
              });
              continue;
            }

            const permission = await ctx.runMutation(
              internal.automation._getAutomationPermission,
              {
                organizationId: run.organizationId,
                actorUserId: run.actorUserId,
                feature: descriptor.permissionFeature,
                requireAdmin: descriptor.requireAdmin,
              },
            );

            if (!permission.allowed) {
              sawFailure = true;
              await processRunDb.patch("automationRunSteps", stepId, {
                status: "failed",
                errorMessage: permission.reason ?? "Permission denied",
                processedAt: now,
                updatedAt: now,
              });
              continue;
            }

            // Entity read and Supabase write happen in the action —
            // mutations cannot use fetch(). The action updates the step status.
            await ctx.scheduler.runAfter(0, internal.automation._applyUpdateFieldAction, {
              organizationId: run.organizationId,
              runId: run._id,
              stepId,
              actorUserId: run.actorUserId,
              targetEntityType: action.targetEntityType,
              targetId,
              permissionScope: permission.scope,
              fieldKind: action.fieldKind,
              fieldKey: action.fieldKey,
              valueTemplate: action.valueTemplate,
              valueType: action.valueType,
              payload,
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
            await processRunDb.patch("automationRunSteps", stepId, {
              status: "skipped",
              errorMessage: "Missing activity target or actor",
              processedAt: now,
              updatedAt: now,
            });
            continue;
          }

          await ctx.runMutation(internal.automation._logActivityForRun, {
            organizationId: run.organizationId,
            entityType,
            entityId,
            activityAction: action.activityAction,
            description,
            automationRunId: run._id,
            automationRuleId: String(rule._id),
            sourceEventType: run.eventType,
            performedBy: run.actorUserId!,
          });

          await processRunDb.patch("automationRunSteps", stepId, {
            status: "processed",
            linkedEntityType: entityType,
            linkedEntityId: entityId,
            renderedBody: description,
            processedAt: now,
            updatedAt: now,
          });
        } catch (error) {
          sawFailure = true;
          await processRunDb.patch("automationRunSteps", stepId, {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : String(error),
            processedAt: now,
            updatedAt: now,
          });
          await ctx.scheduler.runAfter(0, patchLegacyRef, {
            organizationId: run.organizationId,
            appointmentId:
              run.entityType === "gabinetAppointment"
                ? run.entityId
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
    const finalStatus = sawFailure ? "failed" : processedAny ? "processed" : "skipped";
    await processRunDb.patch("automationRuns", run._id, {
      ...(matchedRuleId !== undefined ? { ruleId: matchedRuleId } : {}),
      status: finalStatus,
      ...(!processedAny ? { errorMessage: "No matching automation rules" } : {}),
      processedAt,
      updatedAt: processedAt,
    });
  },
});

