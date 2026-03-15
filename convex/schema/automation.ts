import { defineTable } from "convex/server";
import { v } from "convex/values";

interface AutomationSchemaDeps {
  automationModuleValidator: typeof import("../schema").automationModuleValidator;
  automationTriggerDefinitionValidator: typeof import("../schema").automationTriggerDefinitionValidator;
  automationGraphValidator: typeof import("../schema").automationGraphValidator;
  automationConditionValidator: typeof import("../schema").automationConditionValidator;
  automationRuleActionValidator: typeof import("../schema").automationRuleActionValidator;
  automationRunStatusValidator: typeof import("../schema").automationRunStatusValidator;
  automationStepStatusValidator: typeof import("../schema").automationStepStatusValidator;
}

export function createAutomationTables({
  automationModuleValidator,
  automationTriggerDefinitionValidator,
  automationGraphValidator,
  automationConditionValidator,
  automationRuleActionValidator,
  automationRunStatusValidator,
  automationStepStatusValidator,
}: AutomationSchemaDeps) {
  return {
  automationRules: defineTable({
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
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_orgAndEnabled", ["organizationId", "enabled"])
    .index("by_orgAndModule", ["organizationId", "module"])
    .index("by_orgAndEventType", ["organizationId", "eventType"]),

  automationRuns: defineTable({
    organizationId: v.id("organizations"),
    ruleId: v.optional(v.id("automationRules")),
    module: automationModuleValidator,
    eventType: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    eventIdempotencyKey: v.string(),
    correlationKey: v.optional(v.string()),
    payloadSnapshot: v.string(),
    actorUserId: v.optional(v.id("users")),
    status: automationRunStatusValidator,
    errorMessage: v.optional(v.string()),
    occurredAt: v.number(),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndEventType", ["organizationId", "eventType"])
    .index("by_entity", ["entityType", "entityId", "createdAt"])
    .index("by_eventIdempotencyKey", ["eventIdempotencyKey"])
    .index("by_rule", ["ruleId", "createdAt"]),

  automationRunSteps: defineTable({
    organizationId: v.id("organizations"),
    runId: v.id("automationRuns"),
    ruleId: v.optional(v.id("automationRules")),
    actionIndex: v.number(),
    actionType: v.string(),
    idempotencyKey: v.string(),
    status: automationStepStatusValidator,
    recipient: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    metadataSnapshot: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    emailEventLogId: v.optional(v.id("emailEventLog")),
    appointmentSmsEventId: v.optional(v.id("appointmentSmsEvents")),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId", "actionIndex"])
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),
  };
}
