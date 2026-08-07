import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { createLogger } from "../_helpers/logger";
import type { Id } from "../_generated/dataModel";

// ── helpers ──────────────────────────────────────────────────────────────────

export const getAllSubscriptions = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("subscriptions").collect(),
});

export const getAllPlans = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("plans").collect(),
});

export const getOrgByOwner = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) =>
    ctx.db
      .query("organizations")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", args.userId))
      .first(),
});

export const getExistingProductSub = internalQuery({
  args: { organizationId: v.id("organizations"), productId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("productSubscriptions")
      .withIndex("by_orgAndProduct", (q) =>
        q.eq("organizationId", args.organizationId).eq("productId", args.productId),
      )
      .first(),
});

// ── backfill action ───────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(["active", "trialing", "past_due", "canceled", "incomplete"]);

function normalizeStatus(
  s: string,
): "active" | "trialing" | "past_due" | "canceled" | "incomplete" {
  return VALID_STATUSES.has(s)
    ? (s as "active" | "trialing" | "past_due" | "canceled" | "incomplete")
    : "incomplete";
}

/**
 * One-off migration for issue #4111.
 *
 * `handleCheckoutSessionCompleted` skips the productSubscriptions upsert when
 * organizationId or productKey are absent from Stripe session metadata —
 * which is the case for every subscription created before those fields were
 * added. This action backfills the missing rows by inferring the organization
 * from the subscription owner (organizations.ownerId) and the productKey from
 * the plan linked to each subscription.
 *
 * Safe to run multiple times — skips entries that already exist.
 * Pass dryRun: true to preview what would be inserted without writing.
 */
type PlanRow = { _id: string; key: string; productKey?: string | null };
type SubscriptionRow = { _id: string; planId: string; userId: import("../_generated/dataModel").Id<"users">; stripeId: string; status: string; currentPeriodStart: number; currentPeriodEnd: number; cancelAtPeriodEnd: boolean };
type BackfillResult = { subscriptionsScanned: number; inserted: number; skippedAlreadyExists: number; skippedNoPlan: number; skippedNoProductKey: number; skippedNoOrg: number; dryRun: boolean };

export const backfillProductSubscriptions = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<BackfillResult> => {
    const { dryRun = false } = args;
    const log = createLogger("migrations.backfillProductSubscriptions", { dryRun });

    // Self-module internal references. Convex's generated `internal` graph cannot
    // type a function that references its own module — the index expression
    // itself triggers a circular type instantiation (TS7053/TS2615). Access it
    // through a loosely-typed view; the runtime FunctionReferences resolve fine.
    const self = (internal as Record<string, Record<string, unknown>>)[
      "migrations/backfillProductSubscriptions"
    ] as {
      getAllSubscriptions: FunctionReference<"query", "internal">;
      getAllPlans: FunctionReference<"query", "internal">;
      getOrgByOwner: FunctionReference<"query", "internal", { userId: Id<"users"> }>;
      getExistingProductSub: FunctionReference<
        "query",
        "internal",
        { organizationId: string; productId: string }
      >;
    };

    const [subscriptionsRaw, plansRaw] = await Promise.all([
      ctx.runQuery(
        self.getAllSubscriptions,
      ),
      ctx.runQuery(
        self.getAllPlans,
      ),
    ]);

    const subscriptions = subscriptionsRaw as unknown as SubscriptionRow[];
    const plans = plansRaw as unknown as PlanRow[];

    const planById = new Map(plans.map((p: PlanRow) => [p._id as string, p]));

    let inserted = 0;
    let skippedAlreadyExists = 0;
    let skippedNoPlan = 0;
    let skippedNoProductKey = 0;
    let skippedNoOrg = 0;

    for (const sub of subscriptions) {
      const plan = planById.get(sub.planId as string);
      if (!plan) {
        skippedNoPlan++;
        log.info("skip: plan not found", { subscriptionId: String(sub._id) });
        continue;
      }

      if (!plan.productKey) {
        skippedNoProductKey++;
        log.info("skip: plan has no productKey", {
          subscriptionId: String(sub._id),
          planKey: plan.key,
        });
        continue;
      }

      const org = await ctx.runQuery(
        self.getOrgByOwner,
        { userId: sub.userId },
      );

      if (!org) {
        skippedNoOrg++;
        log.info("skip: no owned org for user", {
          subscriptionId: String(sub._id),
          userId: String(sub.userId),
        });
        continue;
      }

      const existing = await ctx.runQuery(
        self.getExistingProductSub,
        { organizationId: org._id, productId: plan.productKey },
      );

      if (existing) {
        skippedAlreadyExists++;
        continue;
      }

      if (!dryRun) {
        await ctx.runMutation(internal.stripe.PREAUTH_upsertProductSubscription, {
          organizationId: org._id,
          productId: plan.productKey,
          stripeSubscriptionId: sub.stripeId,
          status: normalizeStatus(sub.status),
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        });
      }

      inserted++;
      log.info("upserted productSubscription", {
        organizationId: String(org._id),
        productId: plan.productKey,
        stripeSubscriptionId: sub.stripeId,
        dryRun,
      });
    }

    const summary = {
      subscriptionsScanned: subscriptions.length,
      inserted,
      skippedAlreadyExists,
      skippedNoPlan,
      skippedNoProductKey,
      skippedNoOrg,
      dryRun,
    };
    log.info("complete", summary);
    return summary;
  },
});
