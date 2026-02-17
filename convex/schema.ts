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
  v.literal("activity"),
  v.literal("gabinetPatient"),
  v.literal("gabinetTreatment"),
  v.literal("gabinetAppointment"),
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
);
export type ActivityAction = Infer<typeof activityActionValidator>;

export const emailDirectionValidator = v.union(
  v.literal("inbound"),
  v.literal("outbound"),
);
export type EmailDirection = Infer<typeof emailDirectionValidator>;

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
  v.literal("nurse"),
  v.literal("therapist"),
  v.literal("receptionist"),
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
  v.literal("scheduled"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("no_show"),
);
export type GabinetAppointmentStatus = Infer<typeof gabinetAppointmentStatusValidator>;

export const gabinetDocTypeValidator = v.union(
  v.literal("consent"),
  v.literal("medical_record"),
  v.literal("prescription"),
  v.literal("referral"),
  v.literal("custom"),
);
export type GabinetDocType = Infer<typeof gabinetDocTypeValidator>;

export const gabinetDocStatusValidator = v.union(
  v.literal("draft"),
  v.literal("pending_signature"),
  v.literal("signed"),
  v.literal("archived"),
);
export type GabinetDocStatus = Infer<typeof gabinetDocStatusValidator>;

export const gabinetPackageUsageStatusValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("expired"),
  v.literal("cancelled"),
);
export type GabinetPackageUsageStatus = Infer<typeof gabinetPackageUsageStatusValidator>;

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
    // User preferences (Phase 2)
    language: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    timezone: v.optional(v.string()),
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

  // --- Product Subscriptions (per organization, per product) ---

  platformProducts: defineTable({
    productId: v.string(),
    name: v.string(),
    description: v.string(),
    isActive: v.boolean(),
    prices: v.object({
      month: v.object({ usd: v.number(), eur: v.number() }),
      year: v.object({ usd: v.number(), eur: v.number() }),
    }),
    stripeProductId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_productId", ["productId"])
    .index("by_stripeProductId", ["stripeProductId"]),

  productSubscriptions: defineTable({
    organizationId: v.id("organizations"),
    productId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
    ),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndProduct", ["organizationId", "productId"])
    .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),

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
    source: v.optional(v.string()),
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
    status: v.optional(documentStatusValidator),
    amount: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndCategory", ["organizationId", "category"])
    .index("by_orgAndStatus", ["organizationId", "status"])
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
    activityTypeKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orgAndEntity", ["organizationId", "entityType", "order"])
    .index("by_orgAndKey", ["organizationId", "entityType", "fieldKey"])
    .index("by_orgEntityAndActivityType", ["organizationId", "entityType", "activityTypeKey", "order"]),

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

  activityTypeDefinitions: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(),
    name: v.string(),
    icon: v.string(),
    color: v.optional(v.string()),
    isSystem: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId", "order"])
    .index("by_orgAndKey", ["organizationId", "key"]),

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

  // --- Products ---

  products: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    sku: v.string(),
    unitPrice: v.number(),
    taxRate: v.number(),
    isActive: v.boolean(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndSku", ["organizationId", "sku"])
    .searchIndex("search_products", {
      searchField: "name",
      filterFields: ["organizationId"],
    }),

  dealProducts: defineTable({
    organizationId: v.id("organizations"),
    dealId: v.id("leads"),
    productId: v.id("products"),
    quantity: v.number(),
    unitPrice: v.number(),
    discount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_deal", ["dealId"])
    .index("by_product", ["productId"]),

  // --- Calls ---

  calls: defineTable({
    organizationId: v.id("organizations"),
    outcome: callOutcomeValidator,
    callDate: v.number(),
    note: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDate", ["organizationId", "callDate"])
    .index("by_orgAndOutcome", ["organizationId", "outcome"]),

  // --- Scheduled Activities ---

  scheduledActivities: defineTable({
    organizationId: v.id("organizations"),
    title: v.string(),
    activityType: activityTypeValidator,
    dueDate: v.number(),
    endDate: v.optional(v.number()),
    isCompleted: v.boolean(),
    completedAt: v.optional(v.number()),
    ownerId: v.id("users"),
    description: v.optional(v.string()),
    linkedEntityType: v.optional(v.string()),
    linkedEntityId: v.optional(v.string()),
    googleEventId: v.optional(v.string()),
    googleCalendarId: v.optional(v.string()),
    lastGoogleSyncAt: v.optional(v.number()),
    // Link to module extension record (e.g. gabinetAppointment)
    moduleRef: v.optional(v.object({
      moduleId: v.string(),
      entityType: v.string(),
      entityId: v.string(),
    })),
    // Resource performing the work (distinct from ownerId who created the event)
    resourceId: v.optional(v.id("users")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDueDate", ["organizationId", "dueDate"])
    .index("by_owner", ["ownerId"])
    .index("by_orgAndType", ["organizationId", "activityType"])
    .index("by_orgAndCompleted", ["organizationId", "isCompleted"])
    .index("by_orgAndResource", ["organizationId", "resourceId"])
    .index("by_orgAndResourceAndDueDate", ["organizationId", "resourceId", "dueDate"]),

  // --- Payments ---

  payments: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.optional(v.id("gabinetPatients")),
    appointmentId: v.optional(v.id("gabinetAppointments")),
    packageUsageId: v.optional(v.id("gabinetPackageUsage")),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("card"),
      v.literal("transfer"),
      v.literal("other"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("refunded"),
      v.literal("cancelled"),
    ),
    paidAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_appointment", ["appointmentId"]),

  // --- Saved Views ---

  savedViews: defineTable({
    organizationId: v.id("organizations"),
    entityType: v.string(),
    name: v.string(),
    filters: v.any(),
    columns: v.optional(v.array(v.string())),
    sortField: v.optional(v.string()),
    sortDirection: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    isSystem: v.boolean(),
    createdBy: v.id("users"),
    order: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_orgAndEntityType", ["organizationId", "entityType"]),

  // --- Lost Reasons ---

  lostReasons: defineTable({
    organizationId: v.id("organizations"),
    label: v.string(),
    order: v.number(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"]),

  // --- Org Settings ---

  orgSettings: defineTable({
    organizationId: v.id("organizations"),
    allowCustomLostReason: v.boolean(),
    lostReasonRequired: v.boolean(),
    defaultCurrency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    resourceSharingEnabled: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"]),

  // --- RBAC: Permission Overrides ---

  orgPermissions: defineTable({
    organizationId: v.id("organizations"),
    role: v.union(v.literal("member"), v.literal("viewer")),
    // Record<Feature, Record<Action, Scope>> stored as JSON
    // Feature: leads, contacts, companies, documents, activities, calls, email, products, pipelines,
    //          gabinet_patients, gabinet_appointments, gabinet_treatments, gabinet_packages,
    //          gabinet_employees, settings, team
    // Action: view, create, edit, delete
    // Scope: "none" | "own" | "all"
    permissions: v.any(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndRole", ["organizationId", "role"]),

  // --- RBAC: Resource Invites (External Guests) ---

  resourceInvites: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    userId: v.optional(v.id("users")),
    resourceType: v.string(),
    resourceId: v.string(),
    accessLevel: v.union(v.literal("viewer"), v.literal("editor")),
    invitedBy: v.id("users"),
    token: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_token", ["token"])
    .index("by_email", ["email"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_orgAndResource", ["organizationId", "resourceType", "resourceId"]),

  // --- Notifications ---

  notifications: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    link: v.optional(v.string()),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_userAndRead", ["userId", "isRead", "createdAt"])
    .index("by_org", ["organizationId"]),

  // --- Audit Log ---

  auditLog: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    action: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    details: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_orgAndAction", ["organizationId", "action", "createdAt"])
    .index("by_orgAndUser", ["organizationId", "userId", "createdAt"]),

  // --- Sources ---

  sources: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    order: v.number(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"]),

  // --- Emails ---

  emails: defineTable({
    organizationId: v.id("organizations"),
    threadId: v.string(),
    messageId: v.string(),
    inReplyTo: v.optional(v.string()),
    direction: emailDirectionValidator,
    from: v.string(),
    to: v.array(v.string()),
    cc: v.optional(v.array(v.string())),
    bcc: v.optional(v.array(v.string())),
    subject: v.string(),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    snippet: v.optional(v.string()),
    isRead: v.boolean(),
    isStarred: v.optional(v.boolean()),
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    leadId: v.optional(v.id("leads")),
    provider: v.optional(v.union(v.literal("resend"), v.literal("gmail"))),
    gmailMessageId: v.optional(v.string()),
    gmailThreadId: v.optional(v.string()),
    sentBy: v.optional(v.id("users")),
    sentAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId", "sentAt"])
    .index("by_thread", ["organizationId", "threadId"])
    .index("by_gmailMessageId", ["gmailMessageId"])
    .index("by_contact", ["contactId", "sentAt"])
    .index("by_company", ["companyId", "sentAt"])
    .index("by_lead", ["leadId", "sentAt"])
    .index("by_messageId", ["messageId"])
    .searchIndex("search_emails", {
      searchField: "subject",
      filterFields: ["organizationId", "direction"],
    }),

  emailAccounts: defineTable({
    organizationId: v.id("organizations"),
    fromName: v.string(),
    fromEmail: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"]),

  // --- Invitations ---

  invitations: defineTable({
    organizationId: v.id("organizations"),
    email: v.string(),
    role: orgRoleValidator,
    token: v.string(),
    status: invitationStatusValidator,
    invitedBy: v.id("users"),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_token", ["token"])
    .index("by_email", ["email", "organizationId"]),

  // --- OAuth Connections ---

  oauthConnections: defineTable({
    organizationId: v.id("organizations"),
    provider: v.literal("google"),
    providerAccountId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scope: v.string(),
    tokenType: v.string(),
    isActive: v.boolean(),
    lastSyncedAt: v.optional(v.number()),
    connectedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndProvider", ["organizationId", "provider", "isActive"]),

  // --- Notes ---

  notes: defineTable({
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    content: v.string(),
    createdBy: v.id("users"),
    isPinned: v.optional(v.boolean()),
    parentNoteId: v.optional(v.id("notes")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entity", ["entityType", "entityId"])
    .index("by_org", ["organizationId"]),

  // --- Gabinet (Medical Office) ---

  gabinetPatients: defineTable({
    organizationId: v.id("organizations"),
    contactId: v.optional(v.id("contacts")),
    firstName: v.string(),
    lastName: v.string(),
    pesel: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"))),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
    })),
    medicalNotes: v.optional(v.string()),
    allergies: v.optional(v.string()),
    bloodType: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    referredByPatientId: v.optional(v.id("gabinetPatients")),
    isActive: v.boolean(),
    tags: v.optional(v.array(v.string())),
    customFields: v.optional(v.any()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndEmail", ["organizationId", "email"])
    .index("by_orgAndPesel", ["organizationId", "pesel"])
    .index("by_orgAndContact", ["organizationId", "contactId"])
    .searchIndex("search_patients", {
      searchField: "firstName",
      filterFields: ["organizationId"],
    }),

  gabinetTreatments: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.number(),
    price: v.number(),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    isActive: v.boolean(),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndCategory", ["organizationId", "category"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .searchIndex("search_treatments", {
      searchField: "name",
      filterFields: ["organizationId"],
    }),

  // --- Gabinet: Employee Scheduling (Phase 2) ---

  gabinetWorkingHours: defineTable({
    organizationId: v.id("organizations"),
    dayOfWeek: v.number(), // 0-6
    startTime: v.string(), // "HH:MM"
    endTime: v.string(),
    isOpen: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDay", ["organizationId", "dayOfWeek"]),

  gabinetEmployeeSchedules: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isWorking: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgUserAndDay", ["organizationId", "userId", "dayOfWeek"]),

  gabinetLeaves: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    type: gabinetLeaveTypeValidator,
    leaveTypeId: v.optional(v.id("gabinetLeaveTypes")),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    status: gabinetLeaveStatusValidator,
    reason: v.optional(v.string()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndDate", ["organizationId", "startDate"]),

  gabinetOvertime: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    date: v.string(),
    hours: v.number(),
    reason: v.optional(v.string()),
    status: gabinetLeaveStatusValidator, // reuse pending/approved/rejected
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"]),

  // --- Gabinet: Employees (HR) ---

  gabinetEmployees: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.array(v.id("gabinetTreatments")),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    isActive: v.boolean(),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .index("by_orgAndRole", ["organizationId", "role"]),

  // --- Gabinet: Leave Types & Balances (HR) ---

  gabinetLeaveTypes: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.optional(v.string()),
    isPaid: v.boolean(),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.boolean(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndActive", ["organizationId", "isActive"]),

  gabinetLeaveBalances: defineTable({
    organizationId: v.id("organizations"),
    employeeId: v.id("gabinetEmployees"),
    leaveTypeId: v.id("gabinetLeaveTypes"),
    year: v.number(),
    totalDays: v.number(),
    usedDays: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndEmployee", ["organizationId", "employeeId"])
    .index("by_orgEmployeeTypeYear", ["organizationId", "employeeId", "leaveTypeId", "year"]),

  // --- Gabinet: Appointments (Phase 3) ---

  gabinetAppointments: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    treatmentId: v.id("gabinetTreatments"),
    employeeId: v.id("users"),
    date: v.string(), // YYYY-MM-DD
    startTime: v.string(), // HH:MM
    endTime: v.string(),
    status: gabinetAppointmentStatusValidator,
    notes: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    color: v.optional(v.string()),
    isRecurring: v.boolean(),
    recurringRule: v.optional(v.object({
      frequency: v.string(), // daily, weekly, biweekly, monthly
      count: v.optional(v.number()),
      until: v.optional(v.string()),
    })),
    recurringGroupId: v.optional(v.string()),
    recurringIndex: v.optional(v.number()),
    prepaymentRequired: v.optional(v.boolean()),
    prepaymentAmount: v.optional(v.number()),
    prepaymentStatus: v.optional(v.string()),
    prepaymentPaidAt: v.optional(v.number()),
    packageUsageId: v.optional(v.id("gabinetPackageUsage")),
    scheduledActivityId: v.optional(v.id("scheduledActivities")),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancellationReason: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDate", ["organizationId", "date"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndEmployee", ["organizationId", "employeeId"])
    .index("by_orgAndEmployeeAndDate", ["organizationId", "employeeId", "date"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndRecurringGroup", ["organizationId", "recurringGroupId"]),

  // --- Gabinet: Packages & Loyalty (Phase 4) ---

  gabinetTreatmentPackages: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    treatments: v.array(v.object({
      treatmentId: v.id("gabinetTreatments"),
      quantity: v.number(),
    })),
    totalPrice: v.number(),
    currency: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    isActive: v.boolean(),
    loyaltyPointsAwarded: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndActive", ["organizationId", "isActive"]),

  gabinetPackageUsage: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    packageId: v.id("gabinetTreatmentPackages"),
    purchasedAt: v.number(),
    expiresAt: v.optional(v.number()),
    status: gabinetPackageUsageStatusValidator,
    treatmentsUsed: v.array(v.object({
      treatmentId: v.id("gabinetTreatments"),
      usedCount: v.number(),
      totalCount: v.number(),
    })),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndStatus", ["organizationId", "status"]),

  gabinetLoyaltyPoints: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    balance: v.number(),
    lifetimeEarned: v.number(),
    lifetimeSpent: v.number(),
    tier: v.optional(gabinetLoyaltyTierValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"]),

  gabinetLoyaltyTransactions: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    type: gabinetLoyaltyTxTypeValidator,
    points: v.number(),
    reason: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    balanceAfter: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"]),

  // --- Gabinet: Documents & Signatures (Phase 5) ---

  gabinetDocumentTemplates: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    type: gabinetDocTypeValidator,
    content: v.string(),
    requiresSignature: v.boolean(),
    isActive: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndType", ["organizationId", "type"]),

  gabinetDocuments: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    appointmentId: v.optional(v.id("gabinetAppointments")),
    templateId: v.optional(v.id("gabinetDocumentTemplates")),
    title: v.string(),
    type: gabinetDocTypeValidator,
    content: v.string(),
    status: gabinetDocStatusValidator,
    signatureData: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    signedByPatient: v.optional(v.boolean()),
    signedByEmployee: v.optional(v.id("users")),
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileMimeType: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_appointment", ["appointmentId"]),

  // --- Gabinet: Patient Portal (Phase 6) ---

  gabinetPortalSessions: defineTable({
    patientId: v.id("gabinetPatients"),
    organizationId: v.id("organizations"),
    tokenHash: v.string(),
    otpHash: v.optional(v.string()),
    otpExpiresAt: v.optional(v.number()),
    isActive: v.boolean(),
    lastAccessedAt: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_token", ["tokenHash"])
    .index("by_patient", ["patientId"])
    .index("by_org", ["organizationId"]),
});

export default schema;
