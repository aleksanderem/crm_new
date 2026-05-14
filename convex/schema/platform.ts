import { defineTable } from "convex/server";
import { v } from "convex/values";

interface PlatformSchemaDeps {
  INTERVALS: typeof import("../schema").INTERVALS;
  pricesValidator: typeof import("../schema").pricesValidator;
  planKeyValidator: typeof import("../schema").planKeyValidator;
  currencyValidator: typeof import("../schema").currencyValidator;
  intervalValidator: typeof import("../schema").intervalValidator;
}

export function createPlatformTables({
  INTERVALS,
  pricesValidator,
  planKeyValidator,
  currencyValidator,
  intervalValidator,
}: PlatformSchemaDeps) {
  return {
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
    theme: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    ),
    timezone: v.optional(v.string()),
    // Platform-level admin flag. Distinct from organization roles; grants
    // access to the /admin area and ability to configure global platform
    // settings (e.g. invitation email From address).
    isPlatformAdmin: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("customerId", ["customerId"]),
  plans: defineTable({
    key: planKeyValidator,
    stripeId: v.string(),
    name: v.string(),
    description: v.string(),
    seatLimit: v.number(), // Maximum number of team members
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

  // --- Platform: Email Event Bus ---

  emailEventTypes: defineTable({
    organizationId: v.id("organizations"),
    eventType: v.string(),
    module: v.union(
      v.literal("crm"),
      v.literal("gabinet"),
      v.literal("platform"),
    ),
    displayName: v.string(),
    description: v.optional(v.string()),
    payloadSchema: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndModule", ["organizationId", "module"])
    .index("by_orgAndType", ["organizationId", "eventType"]),

  emailEventBindings: defineTable({
    organizationId: v.id("organizations"),
    eventType: v.string(),
    templateId: v.id("emailTemplates"),
    enabled: v.boolean(),
    priority: v.number(),
    conditions: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndEventType", ["organizationId", "eventType"])
    .index("by_orgAndEnabled", ["organizationId", "enabled"]),

  emailEventLog: defineTable({
    organizationId: v.id("organizations"),
    eventType: v.string(),
    bindingId: v.optional(v.id("emailEventBindings")),
    templateId: v.optional(v.id("emailTemplates")),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    payload: v.optional(v.string()),
    source: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    triggeredBy: v.optional(v.id("users")),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndEventType", ["organizationId", "eventType"])
    .index("by_orgAndCreatedAt", ["organizationId", "createdAt"])
    .index("by_orgAndIdempotency", ["organizationId", "idempotencyKey"]),

  // ---------------------------------------------------------------------------
  // Email Sequences
  // ---------------------------------------------------------------------------

  emailSequences: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    /** Event type that triggers this sequence, e.g. "appointment.created" */
    triggerEventType: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  emailSequenceSteps: defineTable({
    sequenceId: v.id("emailSequences"),
    organizationId: v.id("organizations"),
    /** Step order (0-indexed) */
    order: v.number(),
    /** Delay in milliseconds after enrollment (or after previous step) */
    delayMs: v.number(),
    templateId: v.id("emailTemplates"),
    /** Optional JSON condition string for conditional sending */
    conditionJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_sequence", ["sequenceId"])
    .index("by_org", ["organizationId"]),

  emailSequenceEnrollments: defineTable({
    sequenceId: v.id("emailSequences"),
    organizationId: v.id("organizations"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    /** JSON string payload passed from trigger event */
    payload: v.optional(v.string()),
    /** Current step index (0-indexed) */
    currentStep: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("completed"),
    ),
    enrolledAt: v.number(),
    completedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
  })
    .index("by_sequence", ["sequenceId"])
    .index("by_org", ["organizationId"]),

  // ---------------------------------------------------------------------------
  // Email Brand Config (per-org email branding)
  // ---------------------------------------------------------------------------

  emailBrandConfig: defineTable({
    organizationId: v.id("organizations"),
    logoStorageId: v.optional(v.id("_storage")),
    logoUrl: v.optional(v.string()),
    companyName: v.optional(v.string()),
    primaryColor: v.string(),
    backgroundColor: v.string(),
    contentBackgroundColor: v.string(),
    textColor: v.string(),
    secondaryTextColor: v.string(),
    accentColor: v.string(),
    footerText: v.optional(v.string()),
    socialLinks: v.optional(
      v.object({
        website: v.optional(v.string()),
        facebook: v.optional(v.string()),
        instagram: v.optional(v.string()),
        linkedin: v.optional(v.string()),
      })
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }).index("by_org", ["organizationId"]),

  recentlyViewed: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    entityType: v.string(),
    entityId: v.string(),
    entityLabel: v.string(),
    viewedAt: v.number(),
  })
    .index("by_user_type", ["organizationId", "userId", "entityType", "viewedAt"])
    .index("by_entity", ["entityId"]),

  // Singleton-style table: holds global platform configuration that is NOT
  // scoped to any organization. There should be at most ONE row here; the
  // queries/mutations in convex/platformSettings.ts enforce that invariant.
  // Used for things like the From name/email used on platform-sent emails
  // (invitations, password resets, etc.) so they represent Quera (the
  // platform) rather than any individual tenant gabinet.
  platformSettings: defineTable({
    invitationFromName: v.optional(v.string()),
    invitationFromEmail: v.optional(v.string()),
    invitationReplyToEmail: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }),
  };
}
