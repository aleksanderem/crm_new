import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v, Infer } from "convex/values";
import { createAutomationTables } from "./schema/automation";
import { createCrmTables } from "./schema/crm";
import { documentTables } from "./schema/documents";
import { createGabinetTables } from "./schema/gabinet";
import { createPlatformTables } from "./schema/platform";

export const CURRENCIES = {
  USD: "usd",
  EUR: "eur",
  PLN: "pln",
} as const;
export const currencyValidator = v.union(
  v.literal(CURRENCIES.USD),
  v.literal(CURRENCIES.EUR),
  v.literal(CURRENCIES.PLN),
);
export type Currency = Infer<typeof currencyValidator>;

export const INTERVALS = {
  MONTH: "month",
  YEAR: "year",
} as const;
export const intervalValidator = v.union(
  v.literal(INTERVALS.MONTH),
  v.literal(INTERVALS.YEAR),
);
export type Interval = Infer<typeof intervalValidator>;

export const PLANS = {
  FREE: "free",
  PRO: "pro",
} as const;
export const planKeyValidator = v.union(
  v.literal(PLANS.FREE),
  v.literal(PLANS.PRO),
);
export type PlanKey = Infer<typeof planKeyValidator>;

export const PRODUCT_KEYS = {
  CRM: "crm",
  GABINET: "gabinet",
  MAGAZYN: "magazyn",
} as const;
export const productKeyValidator = v.union(
  v.literal(PRODUCT_KEYS.CRM),
  v.literal(PRODUCT_KEYS.GABINET),
  v.literal(PRODUCT_KEYS.MAGAZYN),
);
export type ProductKey = Infer<typeof productKeyValidator>;

const priceValidator = v.object({
  stripeId: v.string(),
  amount: v.number(),
});
export const pricesValidator = v.object({
  [CURRENCIES.USD]: priceValidator,
  [CURRENCIES.EUR]: priceValidator,
  [CURRENCIES.PLN]: priceValidator,
});

// --- CRM Validators ---

export const orgRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
);
export type OrgRole = Infer<typeof orgRoleValidator>;

export const leadStatusValidator = v.union(
  v.literal("open"),
  v.literal("won"),
  v.literal("lost"),
  v.literal("archived"),
);
export type LeadStatus = Infer<typeof leadStatusValidator>;

export const leadPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);
export type LeadPriority = Infer<typeof leadPriorityValidator>;

export const documentCategoryValidator = v.union(
  v.literal("proposal"),
  v.literal("contract"),
  v.literal("invoice"),
  v.literal("presentation"),
  v.literal("report"),
  v.literal("other"),
);
export type DocumentCategory = Infer<typeof documentCategoryValidator>;

export const entityTypeValidator = v.union(
  v.literal("contact"),
  v.literal("company"),
  v.literal("lead"),
  v.literal("document"),
  v.literal("activity"),
  v.literal("gabinetPatient"),
  v.literal("gabinetTreatment"),
  v.literal("gabinetAppointment"),
  v.literal("gabinetEvent"),
  v.literal("gabinetPackage"),
  v.literal("gabinetDocument"),
  v.literal("gabinetEmployee"),
  v.literal("product"),
  v.literal("call"),
  v.literal("pipeline"),
);
export type EntityType = Infer<typeof entityTypeValidator>;

export const customFieldTypeValidator = v.union(
  v.literal("text"),
  v.literal("number"),
  v.literal("date"),
  v.literal("select"),
  v.literal("multiSelect"),
  v.literal("checkbox"),
  v.literal("url"),
  v.literal("email"),
  v.literal("phone"),
  v.literal("file"),
);
export type CustomFieldType = Infer<typeof customFieldTypeValidator>;

export const activityActionValidator = v.union(
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
  v.literal("package_assigned"),
);
export type ActivityAction = Infer<typeof activityActionValidator>;

export const emailDirectionValidator = v.union(
  v.literal("inbound"),
  v.literal("outbound"),
);
export type EmailDirection = Infer<typeof emailDirectionValidator>;

export const appointmentSmsDirectionValidator = v.union(
  v.literal("inbound"),
  v.literal("outbound"),
);
export type AppointmentSmsDirection = Infer<
  typeof appointmentSmsDirectionValidator
>;

export const appointmentSmsIntentValidator = v.union(
  v.literal("confirm"),
  v.literal("cancel"),
  v.literal("unknown"),
);
export type AppointmentSmsIntent = Infer<typeof appointmentSmsIntentValidator>;

export const appointmentSmsProcessingStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processed"),
  v.literal("ignored"),
  v.literal("failed"),
);
export type AppointmentSmsProcessingStatus = Infer<
  typeof appointmentSmsProcessingStatusValidator
>;

export const invitationStatusValidator = v.union(
  v.literal("pending"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("expired"),
);
export type InvitationStatus = Infer<typeof invitationStatusValidator>;

export const gabinetGenderValidator = v.union(
  v.literal("male"),
  v.literal("female"),
  v.literal("other"),
);
export type GabinetGender = Infer<typeof gabinetGenderValidator>;

export const gabinetLeaveTypeValidator = v.union(
  v.literal("vacation"),
  v.literal("sick"),
  v.literal("personal"),
  v.literal("training"),
  v.literal("other"),
);
export type GabinetLeaveType = Infer<typeof gabinetLeaveTypeValidator>;

export const gabinetEmployeeRoleValidator = v.union(
  v.literal("doctor"),
  v.literal("cosmetologist"),
  v.literal("nurse"),
  v.literal("therapist"),
  v.literal("receptionist"),
  v.literal("manager"),
  v.literal("admin"),
  v.literal("other"),
);
export type GabinetEmployeeRole = Infer<typeof gabinetEmployeeRoleValidator>;

export const gabinetLeaveStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
);
export type GabinetLeaveStatus = Infer<typeof gabinetLeaveStatusValidator>;

export const gabinetAppointmentStatusValidator = v.union(
  v.literal("pending_confirmation"),
  v.literal("scheduled"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("no_show"),
);
export type GabinetAppointmentStatus = Infer<
  typeof gabinetAppointmentStatusValidator
>;

export const appointmentWorkflowEventValidator = v.union(
  v.literal("appointment_created"),
);
export type AppointmentWorkflowEvent = Infer<
  typeof appointmentWorkflowEventValidator
>;

export const appointmentWorkflowChannelValidator = v.union(
  v.literal("email"),
  v.literal("sms"),
);
export type AppointmentWorkflowChannel = Infer<
  typeof appointmentWorkflowChannelValidator
>;

export const appointmentWorkflowStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped"),
);
export type AppointmentWorkflowStatus = Infer<
  typeof appointmentWorkflowStatusValidator
>;

export const automationModuleValidator = v.union(
  v.literal("crm"),
  v.literal("gabinet"),
  v.literal("platform"),
);
export type AutomationModule = Infer<typeof automationModuleValidator>;

export const automationTriggerSourceValidator = v.union(
  v.literal("domain_event"),
  v.literal("communication_reply"),
);
export type AutomationTriggerSource = Infer<typeof automationTriggerSourceValidator>;

export const automationVariableTypeValidator = v.union(
  v.literal("string"),
  v.literal("number"),
  v.literal("boolean"),
  v.literal("date"),
  v.literal("datetime"),
  v.literal("id"),
);
export type AutomationVariableType = Infer<typeof automationVariableTypeValidator>;

export const automationVariableDefinitionValidator = v.object({
  key: v.string(),
  path: v.string(),
  label: v.string(),
  type: automationVariableTypeValidator,
  group: v.optional(v.string()),
});
export type AutomationVariableDefinition = Infer<
  typeof automationVariableDefinitionValidator
>;

export const automationTriggerDefinitionValidator = v.object({
  module: automationModuleValidator,
  eventType: v.string(),
  entityType: v.optional(v.string()),
  source: automationTriggerSourceValidator,
  label: v.optional(v.string()),
});
export type AutomationTriggerDefinition = Infer<
  typeof automationTriggerDefinitionValidator
>;

export const automationConditionOperatorValidator = v.union(
  v.literal("equals"),
  v.literal("not_equals"),
  v.literal("contains"),
  v.literal("greater_than"),
  v.literal("less_than"),
  v.literal("is_truthy"),
  v.literal("is_falsy"),
);
export type AutomationConditionOperator = Infer<
  typeof automationConditionOperatorValidator
>;

const automationConditionValueValidator = v.union(
  v.string(),
  v.number(),
  v.boolean(),
);

export const automationConditionValidator = v.object({
  path: v.string(),
  operator: automationConditionOperatorValidator,
  value: v.optional(automationConditionValueValidator),
});
export type AutomationCondition = Infer<typeof automationConditionValidator>;

export const automationFieldValueTypeValidator = v.union(
  v.literal("string"),
  v.literal("number"),
  v.literal("boolean"),
  v.literal("date"),
);
export type AutomationFieldValueType = Infer<
  typeof automationFieldValueTypeValidator
>;

export const automationRuleActionValidator = v.union(
  v.object({
    type: v.literal("send_email"),
    delayMs: v.optional(v.number()),
    templateEventType: v.string(),
    recipientEmailPath: v.string(),
    recipientNamePath: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("send_email"),
    mode: v.literal("template"),
    delayMs: v.optional(v.number()),
    templateId: v.id("emailTemplates"),
    recipientEmailPath: v.string(),
    recipientNamePath: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("send_email"),
    mode: v.literal("manual"),
    delayMs: v.optional(v.number()),
    recipientEmailPath: v.string(),
    recipientNamePath: v.optional(v.string()),
    subjectTemplate: v.string(),
    bodyTemplate: v.string(),
  }),
  v.object({
    type: v.literal("send_sms"),
    delayMs: v.optional(v.number()),
    phonePath: v.string(),
    messageTemplate: v.string(),
  }),
  v.object({
    type: v.literal("send_sms_request"),
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
    activityAction: activityActionValidator,
    descriptionTemplate: v.string(),
    entityTypePath: v.optional(v.string()),
    entityIdPath: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("update_field"),
    delayMs: v.optional(v.number()),
    targetEntityType: v.union(
      v.literal("gabinetPatient"),
      v.literal("gabinetAppointment"),
      v.literal("gabinetEmployee"),
      v.literal("lead"),
    ),
    targetIdPath: v.optional(v.string()),
    fieldKind: v.union(v.literal("standard"), v.literal("custom")),
    fieldKey: v.string(),
    valueTemplate: v.string(),
    valueType: automationFieldValueTypeValidator,
  }),
);
export type AutomationRuleAction = Infer<typeof automationRuleActionValidator>;

export const automationGraphNodeValidator = v.union(
  v.object({
    id: v.string(),
    type: v.literal("trigger"),
    positionX: v.number(),
    positionY: v.number(),
    trigger: automationTriggerDefinitionValidator,
  }),
  v.object({
    id: v.string(),
    type: v.literal("condition"),
    positionX: v.number(),
    positionY: v.number(),
    condition: automationConditionValidator,
  }),
  v.object({
    id: v.string(),
    type: v.literal("action"),
    positionX: v.number(),
    positionY: v.number(),
    action: automationRuleActionValidator,
  }),
);
export type AutomationGraphNode = Infer<typeof automationGraphNodeValidator>;

export const automationGraphEdgeValidator = v.object({
  id: v.string(),
  source: v.string(),
  target: v.string(),
  branch: v.optional(
    v.union(v.literal("default"), v.literal("true"), v.literal("false")),
  ),
});
export type AutomationGraphEdge = Infer<typeof automationGraphEdgeValidator>;

export const automationGraphValidator = v.object({
  nodes: v.array(automationGraphNodeValidator),
  edges: v.array(automationGraphEdgeValidator),
});
export type AutomationGraph = Infer<typeof automationGraphValidator>;


export const gabinetPackageUsageStatusValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("expired"),
  v.literal("cancelled"),
  v.literal("unassigned"),
);
export type GabinetPackageUsageStatus = Infer<
  typeof gabinetPackageUsageStatusValidator
>;

export const gabinetLoyaltyTierValidator = v.union(
  v.literal("bronze"),
  v.literal("silver"),
  v.literal("gold"),
  v.literal("platinum"),
);
export type GabinetLoyaltyTier = Infer<typeof gabinetLoyaltyTierValidator>;

export const gabinetLoyaltyTxTypeValidator = v.union(
  v.literal("earn"),
  v.literal("spend"),
  v.literal("adjust"),
  v.literal("expire"),
);
export type GabinetLoyaltyTxType = Infer<typeof gabinetLoyaltyTxTypeValidator>;

export const callOutcomeValidator = v.union(
  v.literal("busy"),
  v.literal("leftVoiceMessage"),
  v.literal("movedConversationForward"),
  v.literal("wrongNumber"),
  v.literal("noAnswer"),
);
export type CallOutcome = Infer<typeof callOutcomeValidator>;

export const activityTypeValidator = v.string();
export type ActivityType = Infer<typeof activityTypeValidator>;

export const documentStatusValidator = v.union(
  v.literal("draft"),
  v.literal("sent"),
  v.literal("accepted"),
  v.literal("lost"),
);
export type DocumentStatus = Infer<typeof documentStatusValidator>;

const platformTables = createPlatformTables({
  INTERVALS,
  pricesValidator,
  planKeyValidator,
  productKeyValidator,
  currencyValidator,
  intervalValidator,
});

const crmTables = createCrmTables({
  leadStatusValidator,
  leadPriorityValidator,
  documentCategoryValidator,
  documentStatusValidator,
  entityTypeValidator,
  customFieldTypeValidator,
  activityActionValidator,
  callOutcomeValidator,
  activityTypeValidator,
  emailDirectionValidator,
  orgRoleValidator,
  invitationStatusValidator,
});

const gabinetTables = createGabinetTables({
  gabinetLeaveTypeValidator,
  gabinetLeaveStatusValidator,
  gabinetEmployeeRoleValidator,
  gabinetAppointmentStatusValidator,
  gabinetPackageUsageStatusValidator,
  gabinetLoyaltyTierValidator,
  gabinetLoyaltyTxTypeValidator,
  appointmentSmsDirectionValidator,
  appointmentSmsIntentValidator,
  appointmentSmsProcessingStatusValidator,
  appointmentWorkflowEventValidator,
  appointmentWorkflowChannelValidator,
  appointmentWorkflowStatusValidator,
});

const automationTables = createAutomationTables({
  automationModuleValidator,
  automationTriggerDefinitionValidator,
  automationGraphValidator,
  automationConditionValidator,
  automationRuleActionValidator,
});

// --- Tag & Category Definitions (org-wide tags, per-entity-type categories) ---

const tagAndCategoryTables = {
  tagDefinitions: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
    sortOrder: v.number(),
    isDeleted: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndName", ["organizationId", "name"]),

  categoryDefinitions: defineTable({
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    name: v.string(),
    parentId: v.optional(v.id("categoryDefinitions")),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    sortOrder: v.number(),
    isDeleted: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orgAndEntityType", ["organizationId", "entityType"])
    .index("by_parent", ["parentId"]),
};

// ---------------------------------------------------------------------------
// Dev utilities — email interceptor for development testing
// ---------------------------------------------------------------------------

const devTables = {
  devEmails: defineTable({
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    source: v.string(), // e.g. "signing", "template", "reminder"
    metadata: v.optional(v.string()), // JSON with extra context
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),
};

const schema = defineSchema({
  ...authTables,
  ...platformTables,
  ...crmTables,
  ...gabinetTables,
  ...automationTables,
  ...documentTables,
  ...tagAndCategoryTables,
  ...devTables,
});

export default schema;
