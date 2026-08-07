import { defineTable } from "convex/server";
import { v } from "convex/values";

interface PlatformSchemaDeps {
  INTERVALS: typeof import("../schema").INTERVALS;
  pricesValidator: typeof import("../schema").pricesValidator;
  planKeyValidator: typeof import("../schema").planKeyValidator;
  productKeyValidator: typeof import("../schema").productKeyValidator;
  currencyValidator: typeof import("../schema").currencyValidator;
  intervalValidator: typeof import("../schema").intervalValidator;
}

export function createPlatformTables({
  INTERVALS,
  pricesValidator,
  planKeyValidator,
  productKeyValidator,
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
  })
    .index("email", ["email"])
    .index("customerId", ["customerId"]),
  plans: defineTable({
    key: planKeyValidator,
    productKey: v.optional(productKeyValidator),
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
    .index("stripeId", ["stripeId"])
    .index("by_productAndKey", ["productKey", "key"]),
  subscriptions: defineTable({
    userId: v.id("users"),
    planId: v.id("plans"),
    productKey: v.optional(productKeyValidator),
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
    .index("stripeId", ["stripeId"])
    .index("by_userId_and_productKey", ["userId", "productKey"]),

  // --- Product Subscriptions (per organization, per product) ---

  platformProducts: defineTable({
    productId: v.string(),
    name: v.string(),
    description: v.string(),
    isActive: v.boolean(),
    prices: v.object({
      month: v.object({ usd: v.number(), eur: v.number(), pln: v.number() }),
      year: v.object({ usd: v.number(), eur: v.number(), pln: v.number() }),
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

  // Global error log — every uncaught throw on the server or unhandled error
  // on the frontend that flows through reportError() lands here. Read from
  // /admin/errors. Records are bounded by an external retention job (TODO).
  errorLogs: defineTable({
    ts: v.number(),
    source: v.union(v.literal("convex"), v.literal("frontend")),
    scope: v.optional(v.string()),       // module/area, e.g. "gabinet.treatments"
    fnName: v.optional(v.string()),      // exact function or route
    level: v.optional(v.union(v.literal("error"), v.literal("warn"))),
    message: v.string(),
    stack: v.optional(v.string()),
    url: v.optional(v.string()),         // frontend: window.location
    userAgent: v.optional(v.string()),   // frontend
    userId: v.optional(v.id("users")),
    organizationId: v.optional(v.id("organizations")),
    argsJson: v.optional(v.string()),    // sanitized JSON of inputs (truncated)
    requestId: v.optional(v.string()),   // optional correlation id
  })
    .index("by_ts", ["ts"])
    .index("by_userId_ts", ["userId", "ts"])
    .index("by_organizationId_ts", ["organizationId", "ts"])
    .index("by_scope_ts", ["scope", "ts"]),

  // Per-organization log of every outgoing email attempt across all send
  // paths (signing, automation, manual compose, auto-generated documents,
  // platform-level mails routed through the org context). Captures the
  // minimum surface needed to debug deliverability: source code path that
  // triggered the send, template (when applicable), provider used, final
  // status, error message on failure, recipient and timestamp.
  //
  // Covers non-templated sends (signing emails, ad-hoc compose, OTP, system
  // invitations). See `/dashboard/settings/mail` → "Logs" tab.
  emailSendLog: defineTable({
    organizationId: v.id("organizations"),
    source: v.union(
      v.literal("signing"),
      v.literal("automation"),
      v.literal("manual_compose"),
      v.literal("auto_generate"),
      v.literal("event_trigger"),
      v.literal("system"),
    ),
    templateId: v.optional(v.string()),
    provider: v.optional(
      v.union(
        v.literal("resend"),
        v.literal("mailgun"),
        v.literal("google"),
        v.literal("microsoft"),
        v.literal("gmail"),
        v.literal("dev_intercept"),
      ),
    ),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    errorMessage: v.optional(v.string()),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    fromEmail: v.optional(v.string()),
    subject: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    triggeredBy: v.optional(v.id("users")),
    sentAt: v.number(),
  })
    .index("by_org_sentAt", ["organizationId", "sentAt"])
    .index("by_org_status", ["organizationId", "status", "sentAt"])
    .index("by_org_source", ["organizationId", "source", "sentAt"])
    .index("by_org_provider", ["organizationId", "provider", "sentAt"])
    .index("by_org_recipient", ["organizationId", "recipientEmail", "sentAt"]),

  // Singleton-style table: holds global platform configuration that is NOT
  // scoped to any organization. There should be at most ONE row here; the
  // queries/mutations in convex/platformSettings.ts enforce that invariant.
  // Used for things like the From name/email used on platform-sent emails
  // (invitations, password resets, etc.) so they represent Quera (the
  // platform) rather than any individual tenant gabinet.
  //
  // Provider:
  //   When `provider` is unset the platform falls back to env-based Resend
  //   (AUTH_RESEND_KEY / AUTH_EMAIL). When set, sends go through the chosen
  //   provider using the corresponding credential fields below.
  //   Google/Microsoft are intentionally not supported here yet — they need
  //   an OAuth flow that doesn't exist for platform-scope credentials.
  platformSettings: defineTable({
    invitationFromName: v.optional(v.string()),
    invitationFromEmail: v.optional(v.string()),
    invitationReplyToEmail: v.optional(v.string()),
    // Provider selection (optional — unset = env Resend fallback)
    provider: v.optional(
      v.union(v.literal("resend"), v.literal("mailgun")),
    ),
    resendApiKey: v.optional(v.string()),
    mailgunApiKey: v.optional(v.string()),
    mailgunDomain: v.optional(v.string()),
    mailgunRegion: v.optional(
      v.union(v.literal("us"), v.literal("eu")),
    ),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }),
  };
}
