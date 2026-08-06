import { defineTable } from "convex/server";
import { v } from "convex/values";

interface AutomationSchemaDeps {
  automationModuleValidator: typeof import("../schema").automationModuleValidator;
  automationTriggerDefinitionValidator: typeof import("../schema").automationTriggerDefinitionValidator;
  automationGraphValidator: typeof import("../schema").automationGraphValidator;
  automationConditionValidator: typeof import("../schema").automationConditionValidator;
  automationRuleActionValidator: typeof import("../schema").automationRuleActionValidator;
}

export function createAutomationTables({
  automationModuleValidator,
  automationTriggerDefinitionValidator,
  automationGraphValidator,
  automationConditionValidator,
  automationRuleActionValidator,
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
  };
}
