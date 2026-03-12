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

const automationRuleActionValidator = v.union(
  v.object({
    type: v.literal("send_email"),
    delayMs: v.optional(v.number()),
    templateEventType: v.string(),
    recipientEmailPath: v.string(),
    recipientNamePath: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("send_sms"),
    delayMs: v.optional(v.number()),
    phonePath: v.string(),
    messageTemplate: v.string(),
  }),
  v.object({
    type: v.literal("create_notification"),
    delayMs: v.optional(v.number()),
    userIdPath: v.string(),
    titleTemplate: v.string(),
    messageTemplate: v.string(),
    linkTemplate: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("write_activity"),
    delayMs: v.optional(v.number()),
    activityAction: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
      v.literal("note_added"),
      v.literal("stage_changed"),
      v.literal("assigned"),
      v.literal("relationship_added"),
      v.literal("relationship_removed"),
      v.literal("document_uploaded"),
      v.literal("status_changed"),
      v.literal("email_sent"),
      v.literal("email_received"),
      v.literal("sms_sent"),
      v.literal("sms_received"),
    ),
    descriptionTemplate: v.string(),
    entityTypePath: v.optional(v.string()),
    entityIdPath: v.optional(v.string()),
  }),
);

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

    return [
      {
        module: "gabinet",
        eventType: "gabinet.appointment.created",
        label: "Appointment created",
      },
      {
        module: "gabinet",
        eventType: "gabinet.appointment.updated",
        label: "Appointment updated",
      },
      {
        module: "gabinet",
        eventType: "gabinet.appointment.status_changed",
        label: "Appointment status changed",
      },
      {
        module: "gabinet",
        eventType: "gabinet.appointment.reminder_due",
        label: "Appointment reminder due",
      },
      {
        module: "gabinet",
        eventType: "gabinet.appointment.sms_reply_received",
        label: "Appointment SMS reply received",
      },
      {
        module: "crm",
        eventType: "crm.lead.status_changed",
        label: "Lead status changed",
      },
      {
        module: "crm",
        eventType: "crm.lead.stage_changed",
        label: "Lead stage changed",
      },
    ];
  },
});

export const listActionTypes = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return [
      "send_email",
      "send_sms",
      "create_notification",
      "write_activity",
    ];
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

          if (action.type === "send_sms") {
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
