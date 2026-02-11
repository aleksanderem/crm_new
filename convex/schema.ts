import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v, Infer } from "convex/values";

export const CURRENCIES = {
  USD: "usd",
  EUR: "eur",
} as const;
export const currencyValidator = v.union(
  v.literal(CURRENCIES.USD),
  v.literal(CURRENCIES.EUR),
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

const priceValidator = v.object({
  stripeId: v.string(),
  amount: v.number(),
});
const pricesValidator = v.object({
  [CURRENCIES.USD]: priceValidator,
  [CURRENCIES.EUR]: priceValidator,
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
);
export type ActivityAction = Infer<typeof activityActionValidator>;

const schema = defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    username: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    customerId: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("customerId", ["customerId"]),
  plans: defineTable({
    key: planKeyValidator,
    stripeId: v.string(),
    name: v.string(),
    description: v.string(),
    prices: v.object({
      [INTERVALS.MONTH]: pricesValidator,
      [INTERVALS.YEAR]: pricesValidator,
    }),
  })
    .index("key", ["key"])
    .index("stripeId", ["stripeId"]),
  subscriptions: defineTable({
    userId: v.id("users"),
    planId: v.id("plans"),
    priceStripeId: v.string(),
    stripeId: v.string(),
    currency: currencyValidator,
    interval: intervalValidator,
    status: v.string(),
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  })
    .index("userId", ["userId"])
    .index("stripeId", ["stripeId"]),

  // --- CRM Tables ---

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerId", ["ownerId"]),

  teamMemberships: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    role: orgRoleValidator,
    invitedBy: v.optional(v.id("users")),
    joinedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"]),

  contacts: defineTable({
    organizationId: v.id("organizations"),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndEmail", ["organizationId", "email"])
    .searchIndex("search_contacts", {
      searchField: "firstName",
      filterFields: ["organizationId"],
    }),

  companies: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    size: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zip: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDomain", ["organizationId", "domain"])
    .searchIndex("search_companies", {
      searchField: "name",
      filterFields: ["organizationId"],
    }),

  leads: defineTable({
    organizationId: v.id("organizations"),
    title: v.string(),
    value: v.optional(v.number()),
    currency: v.optional(v.string()),
    status: leadStatusValidator,
    priority: v.optional(leadPriorityValidator),
    expectedCloseDate: v.optional(v.number()),
    source: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    assignedTo: v.optional(v.id("users")),
    pipelineStageId: v.optional(v.id("pipelineStages")),
    stageOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    wonAt: v.optional(v.number()),
    lostAt: v.optional(v.number()),
    lostReason: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_pipelineStage", ["pipelineStageId", "stageOrder"])
    .index("by_assignedTo", ["assignedTo"])
    .index("by_companyId", ["companyId"])
    .searchIndex("search_leads", {
      searchField: "title",
      filterFields: ["organizationId", "status"],
    }),

  documents: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    fileId: v.optional(v.string()),
    fileUrl: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(documentCategoryValidator),
    tags: v.optional(v.array(v.string())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndCategory", ["organizationId", "category"])
    .searchIndex("search_documents", {
      searchField: "name",
      filterFields: ["organizationId"],
    }),

  pipelines: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"]),

  pipelineStages: defineTable({
    pipelineId: v.id("pipelines"),
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.optional(v.string()),
    order: v.number(),
    isWonStage: v.optional(v.boolean()),
    isLostStage: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_pipeline", ["pipelineId", "order"])
    .index("by_org", ["organizationId"]),

  customFieldDefinitions: defineTable({
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    name: v.string(),
    fieldKey: v.string(),
    fieldType: customFieldTypeValidator,
    options: v.optional(v.array(v.string())),
    isRequired: v.optional(v.boolean()),
    order: v.number(),
    group: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orgAndEntity", ["organizationId", "entityType", "order"])
    .index("by_orgAndKey", ["organizationId", "entityType", "fieldKey"]),

  customFieldValues: defineTable({
    organizationId: v.id("organizations"),
    fieldDefinitionId: v.id("customFieldDefinitions"),
    entityType: entityTypeValidator,
    entityId: v.string(),
    value: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_fieldDef", ["fieldDefinitionId"])
    .index("by_orgEntityField", ["organizationId", "entityType", "entityId", "fieldDefinitionId"]),

  objectRelationships: defineTable({
    organizationId: v.id("organizations"),
    sourceType: v.string(),
    sourceId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    relationshipType: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_source", ["sourceType", "sourceId"])
    .index("by_target", ["targetType", "targetId"])
    .index("by_org", ["organizationId"])
    .index("by_sourceAndTarget", ["organizationId", "sourceType", "sourceId", "targetType"]),

  activities: defineTable({
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    action: activityActionValidator,
    description: v.string(),
    metadata: v.optional(v.any()),
    performedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_user", ["performedBy", "createdAt"]),
});

export default schema;
