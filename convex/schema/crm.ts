import { defineTable } from "convex/server";
import { v } from "convex/values";

interface CrmSchemaDeps {
  leadStatusValidator: typeof import("../schema").leadStatusValidator;
  leadPriorityValidator: typeof import("../schema").leadPriorityValidator;
  documentCategoryValidator: typeof import("../schema").documentCategoryValidator;
  documentStatusValidator: typeof import("../schema").documentStatusValidator;
  entityTypeValidator: typeof import("../schema").entityTypeValidator;
  customFieldTypeValidator: typeof import("../schema").customFieldTypeValidator;
  activityActionValidator: typeof import("../schema").activityActionValidator;
  callOutcomeValidator: typeof import("../schema").callOutcomeValidator;
  activityTypeValidator: typeof import("../schema").activityTypeValidator;
  emailDirectionValidator: typeof import("../schema").emailDirectionValidator;
  orgRoleValidator: typeof import("../schema").orgRoleValidator;
  invitationStatusValidator: typeof import("../schema").invitationStatusValidator;
}

export function createCrmTables({
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
}: CrmSchemaDeps) {
  return {
  // --- CRM Tables ---

  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    logo: v.optional(v.string()),
    website: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    onboardingCompleted: v.optional(v.boolean()),
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
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    source: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndEmail", ["organizationId", "email"]),

  companies: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    domain: v.optional(v.string()),
    industry: v.optional(v.string()),
    size: v.optional(v.string()),
    website: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
      }),
    ),
    notes: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDomain", ["organizationId", "domain"]),

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
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
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
    .index("by_companyId", ["companyId"]),

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
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
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
    .index("by_orgAndStatus", ["organizationId", "status"]),

  pipelines: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

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

  pipelineStageActions: defineTable({
    organizationId: v.id("organizations"),
    stageId: v.id("pipelineStages"),
    actionType: v.literal("create_activity"),
    config: v.object({
      activityTypeId: v.optional(v.string()),
      title: v.string(),
      description: v.optional(v.string()),
      dueInDays: v.number(),
      assignToOwner: v.boolean(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_stage", ["stageId"])
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
    .index("by_orgEntityAndActivityType", [
      "organizationId",
      "entityType",
      "activityTypeKey",
      "order",
    ]),

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
    .index("by_orgEntityField", [
      "organizationId",
      "entityType",
      "entityId",
      "fieldDefinitionId",
    ]),

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
    .index("by_sourceAndTarget", [
      "organizationId",
      "sourceType",
      "sourceId",
      "targetType",
    ]),

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
    taxRate: v.optional(v.number()),
    // True when the product is VAT-exempt ("zwolniony" / ZW). When set, the
    // numeric taxRate is ignored. Mirrors gabinetTreatments.taxExempt.
    taxExempt: v.optional(v.boolean()),
    isActive: v.boolean(),
    description: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    // Inventory foundation (#1700 PR-A). When trackStock=true, the product has
    // managed quantity-on-hand stored in productStockLevels (optionally
    // per-location for Gabinet) and every change writes a productStockMovements
    // audit row. When trackStock=false, callers may still log movements for
    // history but no balance is maintained.
    trackStock: v.optional(v.boolean()),
    stockUnit: v.optional(v.string()),
    // Organisational section (#2049): "sale" | "treatment" | "disposable"
    productSection: v.optional(v.string()),
    // Inventory/warehouse fields (#2052, migration 00020)
    minStock: v.optional(v.number()),
    manufacturer: v.optional(v.string()),
    catalogNumber: v.optional(v.string()),
    stockNote: v.optional(v.string()),
    // Net purchase price per unit (#2956, migration 00050). Used to calculate
    // warehouse value. Distinct from unitPrice (the selling price).
    purchasePrice: v.optional(v.number()),
    // Optional retail sale price per unit (#3201/#3203, migration 00066).
    // Data-layer only for now — form/columns/validation wiring is a follow-up
    // per the #3203 micro-task scoping.
    salePrice: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndSku", ["organizationId", "sku"]),

  // Inventory foundation (#1700 PR-A): current quantity-on-hand per
  // (product, location). locationId is optional so CRM-only orgs (no
  // gabinetLocations) can keep a single null-location row per product.
  productStockLevels: defineTable({
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    locationId: v.optional(v.id("gabinetLocations")),
    quantity: v.number(),
    avgCost: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_product", ["productId"])
    .index("by_productAndLocation", ["productId", "locationId"]),

  // Inventory foundation (#1700 PR-A): append-only audit trail for every stock
  // change. `delta` is positive for receipts (purchase/manual add) and negative
  // for issues (appointment use, sale, manual remove). `balanceAfter` snapshots
  // the per-(product, location) running balance after this movement so we can
  // render history without recomputing.
  productStockMovements: defineTable({
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    locationId: v.optional(v.id("gabinetLocations")),
    delta: v.number(),
    balanceAfter: v.optional(v.number()),
    reason: v.union(
      v.literal("initial"),
      v.literal("warehouse_receive"),
      v.literal("manual_adjust"),
      v.literal("inventory_adjustment"),
      v.literal("appointment_use"),
      v.literal("appointment_return"),
      v.literal("deal_close"),
      v.literal("deal_reopen"),
      v.literal("transfer_in"),
      v.literal("transfer_out"),
      v.literal("other"),
    ),
    sourceType: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    note: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    avgCostAfter: v.optional(v.number()),
    lotNumber: v.optional(v.string()),        // LOT/batch number (#2989)
    expiryDate: v.optional(v.string()),       // ISO date YYYY-MM-DD (#2989)
    performedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_product", ["productId", "createdAt"])
    .index("by_source", ["sourceType", "sourceId"]),

  // Warehouse delivery document (#2961).  Header table for a goods-receipt
  // event; groups multiple product receipts from one supplier into a single
  // document with invoice number and VAT support.  Status 'draft' means items
  // are still editable; 'posted' means stock movements have been created and
  // the record is read-only.
  warehouseDeliveries: defineTable({
    organizationId: v.id("organizations"),
    supplierName: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
    notes: v.optional(v.string()),
    status: v.union(v.literal("draft"), v.literal("posted")),
    // Denormalized SUM(quantity × unit_price) across all items (#2968).
    // NULL when no items carried a unit_price.
    totalValue: v.optional(v.number()),
    // Denormalized SUM(line_value_gross) across all items (#2975).
    totalValueGross: v.optional(v.number()),
    // Uploaded invoice pages from 'Add from invoice' workflow (#3016).
    // Ordered array of Convex storage IDs; NULL for manually created deliveries.
    invoicePages: v.optional(v.array(v.object({
      storageId: v.id("_storage"),
      mimeType: v.string(),
      position: v.number(),
    }))),
    // AI/OCR invoice analysis fields (#3045).
    // analysisStatus: null=never run, pending=queued, processing=running,
    //   completed=success, failed=error.
    // analysisResult: ParsedInvoice without rawText, stored as JSONB.
    // On re-analysis failure the previous successful result is preserved.
    analysisStatus: v.optional(v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    )),
    analysisResult: v.optional(v.any()),
    analysisCompletedAt: v.optional(v.number()),
    analysisError: v.optional(v.string()),
    // Item-to-product matching proposals (#3050). Stored as MatchingProposals
    // JSONB. Overwritten on each re-run; never touches analysisResult.
    matchingProposals: v.optional(v.any()),
    // Per-item user decisions from the verification screen (#3055).
    // Stored as ItemDecisions JSONB. Written by saveItemDecisions; never
    // overwritten by the OCR analysis or matching engine.
    itemDecisions: v.optional(v.any()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_orgAndStatus", ["organizationId", "status"]),

  // One row per product within a warehouse delivery.  `movementId` is filled
  // in when the parent delivery is posted and links this line back to the
  // product_stock_movements audit trail.
  warehouseDeliveryItems: defineTable({
    organizationId: v.id("organizations"),
    deliveryId: v.id("warehouseDeliveries"),
    productId: v.id("products"),
    quantity: v.number(),
    unitPrice: v.optional(v.number()),       // net unit price
    vatRate: v.optional(v.number()),          // numeric %, e.g. 23
    vatCode: v.optional(v.string()),          // "23"|"8"|"5"|"0"|"zw"|"np"
    unitPriceGross: v.optional(v.number()),   // gross unit price (#2975)
    lineValueNet: v.optional(v.number()),     // qty × unitPrice (#2975)
    lineValueGross: v.optional(v.number()),   // qty × unitPriceGross (#2975)
    lotNumber: v.optional(v.string()),        // LOT/batch number (#2989)
    expiryDate: v.optional(v.string()),       // ISO date YYYY-MM-DD (#2989)
    movementId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_delivery", ["deliveryId"])
    .index("by_org", ["organizationId"])
    .index("by_product", ["productId"]),

  // Saved invoice-name → product mappings for delivery item matching (#3053).
  // matchDeliveryItems reads these as priority #1 and writes back auto-confirmed
  // exact-name matches.  One mapping per (org, invoiceName) — enforced by the
  // unique index in the Supabase migration.
  deliveryNameMappings: defineTable({
    organizationId: v.id("organizations"),
    invoiceName: v.string(),
    productId: v.id("products"),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_and_name", ["organizationId", "invoiceName"]),

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
    .index("by_product", ["productId"])
    .index("by_org", ["organizationId"]),

  // --- Calls ---

  calls: defineTable({
    organizationId: v.id("organizations"),
    outcome: callOutcomeValidator,
    callDate: v.number(),
    note: v.optional(v.string()),
    duration: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
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
    location: v.optional(v.string()),
    meetingUrl: v.optional(v.string()),
    googleEventId: v.optional(v.string()),
    googleCalendarId: v.optional(v.string()),
    lastGoogleSyncAt: v.optional(v.number()),
    requiresCompletion: v.optional(v.boolean()),
    sourceType: v.optional(v.union(v.literal("manual"), v.literal("google"), v.literal("system"))),
    syncConfigId: v.optional(v.string()),
    visibilityOverride: v.optional(v.union(v.literal("full"), v.literal("busy_only"), v.literal("hidden"))),
    // Link to module extension record (e.g. gabinetAppointment)
    moduleRef: v.optional(
      v.object({
        moduleId: v.string(),
        entityType: v.string(),
        entityId: v.string(),
      }),
    ),
    // Resource performing the work (distinct from ownerId who created the event)
    resourceId: v.optional(v.id("users")),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
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
    .index("by_orgAndResourceAndDueDate", [
      "organizationId",
      "resourceId",
      "dueDate",
    ])
    .index("by_orgAndGoogleEventId", ["organizationId", "googleEventId"]),

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
      v.literal("package"),
      v.literal("gratis"),
      v.literal("barter"),
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
    // Patient-credit accounting (issue #1059).
    // creditEarned: portion of `amount` that became patient credit (overpayment
    // on this row). May be negative on `kind="credit_refund"` rows to drain the
    // balance when an admin refunds outstanding credit to the patient.
    // creditApplied: amount of pre-existing patient credit consumed by this row
    // to settle an appointment — it reduces the patient's available balance
    // but doesn't add to the `amount` (which is the cash/card leg).
    // kind: discriminates ordinary payments from credit-refund bookkeeping
    // rows so the balance computation can treat the latter as pure deductions.
    creditEarned: v.optional(v.number()),
    creditApplied: v.optional(v.number()),
    kind: v.optional(
      v.union(v.literal("payment"), v.literal("credit_refund")),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndPatientAndStatus", [
      "organizationId",
      "patientId",
      "status",
    ])
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
  }).index("by_orgAndEntityType", ["organizationId", "entityType"]),

  // --- Lost Reasons ---

  lostReasons: defineTable({
    organizationId: v.id("organizations"),
    label: v.string(),
    order: v.number(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  // --- Org Settings ---

  orgSettings: defineTable({
    organizationId: v.id("organizations"),
    allowCustomLostReason: v.boolean(),
    lostReasonRequired: v.boolean(),
    defaultCurrency: v.optional(v.string()),
    timezone: v.optional(v.string()),
    resourceSharingEnabled: v.optional(v.boolean()),
    // Appointment reminder settings
    reminderEnabled: v.optional(v.boolean()),
    reminderHoursBefore: v.optional(v.number()), // default 24
    // Per-channel/per-timing reminder toggles (issue #2685)
    reminderSms48h: v.optional(v.boolean()),
    reminderSms24h: v.optional(v.boolean()),
    reminderEmail48h: v.optional(v.boolean()),
    reminderEmail24h: v.optional(v.boolean()),
    appointmentWorkflowConfig: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

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

  // --- RBAC: Gabinet Role Definitions ---
  // Per-org registry of gabinet roles. Ships with system rows (doctor / nurse
  // / therapist / receptionist / admin / other — isSystem=true) seeded on
  // first use; tenants can add custom roles on top (isSystem=false).
  gabinetRoleDefinitions: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(), // stable identifier used in gabinetEmployees.role
    labelPl: v.string(),
    labelEn: v.string(),
    color: v.optional(v.string()),
    isSystem: v.boolean(),
    isClinical: v.optional(v.boolean()), // hint: render treatment qualifications
    order: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndKey", ["organizationId", "key"]),

  // --- RBAC: Gabinet Role Permissions ---
  // Overrides for the MAX-merge with org-role permissions. When a feature is
  // gabinet_*, the user's effective scope per action is max(orgRoleScope,
  // gabinetRoleScope). An absent row means use the baked-in default for the
  // role key (or "none" for custom roles, until the admin fills it in).
  gabinetRolePermissions: defineTable({
    organizationId: v.id("organizations"),
    gabinetRole: v.string(), // FK to gabinetRoleDefinitions.key (per org)
    permissions: v.any(), // FeaturePermissions JSON
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndRole", ["organizationId", "gabinetRole"]),

  // --- RBAC: Gabinet Per-Employee Permission Overrides ---
  // Optional per-user permission overrides with REPLACE semantics: for each
  // feature/action present in the blob the stored scope wins over the
  // role-derived value, supporting both elevation (e.g. receptionist sees
  // financial reports) and restriction (e.g. doctor cannot view payments).
  // Missing entries inherit from the role. Absent row → role-level applies.
  gabinetMembershipPermissions: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    permissions: v.any(), // FeaturePermissions JSON
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"]),

  // --- RBAC: Gabinet Membership Mirror ---
  // Slim Convex mirror of gabinet_employees.{userId, role, isActive} so that
  // checkPermission (which runs in QueryCtx and can't reach Supabase) can
  // resolve the gabinet-role for the current user. Maintained alongside the
  // Supabase row writes in convex/gabinet/employees.ts.
  gabinetMemberships: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    gabinetRole: v.string(),
    isActive: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_user", ["userId"]),

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
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("revoked"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_token", ["token"])
    .index("by_email", ["email"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_orgAndResource", [
      "organizationId",
      "resourceType",
      "resourceId",
    ]),

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
    // Optional JSON payload carrying type-specific data for inline actions.
    // For type="refund_authorization_requested" it holds the shared
    // requestId plus patientId/amount/notes so the bell can approve/reject
    // without round-tripping to the patient page (#1722).
    metadata: v.optional(v.any()),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_userAndRead", ["userId", "isRead", "createdAt"])
    .index("by_org", ["organizationId"])
    .index("by_orgAndType", ["organizationId", "type"]),

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
  }).index("by_org", ["organizationId"]),

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
    provider: v.optional(
      v.union(
        v.literal("resend"),
        v.literal("google"),
        v.literal("microsoft"),
        v.literal("mailgun"),
        v.literal("gmail"), // legacy — remove after migration
      ),
    ),
    mailProviderId: v.optional(v.id("mailProviders")),
    gmailMessageId: v.optional(v.string()),
    gmailThreadId: v.optional(v.string()),
    sentBy: v.optional(v.id("users")),
    templateId: v.optional(v.id("emailTemplates")),
    patientId: v.optional(v.id("gabinetPatients")),
    appointmentId: v.optional(v.id("gabinetAppointments")),
    employeeId: v.optional(v.id("gabinetEmployees")),
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
    .index("by_template", ["organizationId", "templateId"])
    .index("by_patient", ["patientId", "sentAt"])
    .index("by_appointment", ["appointmentId", "sentAt"])
    .index("by_employee", ["employeeId", "sentAt"])
    .index("by_org_provider", ["organizationId", "mailProviderId", "sentAt"]),

  emailAccounts: defineTable({
    organizationId: v.id("organizations"),
    fromName: v.string(),
    fromEmail: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  // --- Mail Providers ---

  mailProviders: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    providerType: v.union(
      v.literal("google"),
      v.literal("microsoft"),
      v.literal("mailgun"),
      v.literal("resend"),
    ),
    // OAuth tokens (Google/Microsoft)
    oauthTokens: v.optional(
      v.object({
        accessToken: v.string(),
        refreshToken: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        scope: v.optional(v.string()),
      }),
    ),
    // API key config (Resend/Mailgun)
    apiConfig: v.optional(
      v.object({
        apiKey: v.optional(v.string()),
        domain: v.optional(v.string()),
        region: v.optional(v.string()),
      }),
    ),
    fromName: v.string(),
    fromEmail: v.string(),
    replyToEmail: v.optional(v.string()),
    capabilities: v.object({
      canSend: v.boolean(),
      canReceive: v.boolean(),
      canSync: v.boolean(),
    }),
    isDefault: v.boolean(),
    isShared: v.boolean(),
    assignedUserIds: v.optional(v.array(v.id("users"))),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("error"),
      v.literal("pending_auth"),
    ),
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    statusMessage: v.optional(v.string()),
    connectedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_default", ["organizationId", "isDefault"])
    .index("by_org_type", ["organizationId", "providerType"])
    .index("by_org_status", ["organizationId", "status"])
    .index("by_org_email", ["organizationId", "fromEmail"]),

  // --- Email Templates ---

  emailTemplates: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    subject: v.string(),
    body: v.string(), // kept for backward compat
    contentJson: v.optional(v.string()), // TipTap JSON
    renderedHtml: v.optional(v.string()), // pre-rendered HTML from TipTap
    slug: v.optional(v.string()), // machine ID, e.g. "gabinet.appointment.confirmation"
    category: v.optional(v.string()),
    module: v.optional(v.string()),
    eventType: v.optional(v.string()),
    isSystem: v.optional(v.boolean()),
    locale: v.optional(v.string()), // "pl" | "en"
    requiredSources: v.optional(v.array(v.string())),
    variables: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        source: v.string(),
      }),
    ),
    createdBy: v.id("users"),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_org_active", ["organizationId", "isActive"])
    .index("by_org_module", ["organizationId", "module"])
    .index("by_org_slug_locale", ["organizationId", "slug", "locale"]),

  // --- Email Layouts (global wrapper per org) ---

  emailLayouts: defineTable({
    organizationId: v.id("organizations"),
    headerBlocks: v.string(),
    footerBlocks: v.string(),
    backgroundColor: v.string(),
    contentBackgroundColor: v.string(),
    primaryColor: v.string(),
    logoUrl: v.optional(v.string()),
    companyName: v.optional(v.string()),
    footerText: v.optional(v.string()),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

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
    // Optional module to provision on accept. "gabinet" auto-creates a
    // gabinet_employees row using `moduleData`. Free-form so future modules
    // (crm, billing, …) can be added without a schema migration.
    module: v.optional(v.string()),
    // Module-specific payload captured at invite time and applied on accept.
    // For module="gabinet": { firstName, lastName, role, specialization,
    //   color, qualifiedTreatmentIds[], tagIds[], categoryId, customFields }.
    moduleData: v.optional(v.any()),
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
    userId: v.optional(v.id("users")),
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
    .index("by_orgAndProvider", ["organizationId", "provider", "isActive"])
    .index("by_userAndProvider", ["userId", "provider", "isActive"])
    .index("by_userOrgAndProvider", ["userId", "organizationId", "provider", "isActive"]),

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

  };
}
