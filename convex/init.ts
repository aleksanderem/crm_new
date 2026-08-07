import { asyncMap } from "convex-helpers";
import type { RegisteredAction } from "convex/server";
import { ERRORS } from "~/errors";
import { internalAction, internalMutation, internalQuery } from "@cvx/_generated/server";
import { v } from "convex/values";
import schema, {
  CURRENCIES,
  Currency,
  Interval,
  INTERVALS,
  PlanKey,
  PLANS,
  PRODUCT_KEYS,
  ProductKey,
  productKeyValidator,
} from "@cvx/schema";
import { internal } from "@cvx/_generated/api";
import { stripe } from "@cvx/stripe";

const seedProducts: Array<{
  key: PlanKey;
  productKey: ProductKey;
  name: string;
  description: string;
  seatLimit: number;
  prices: {
    [K in typeof INTERVALS[keyof typeof INTERVALS]]: {
      [C in typeof CURRENCIES[keyof typeof CURRENCIES]]: number;
    };
  };
}> = [
  {
    key: PLANS.FREE,
    productKey: PRODUCT_KEYS.CRM,
    name: "CRM Free",
    description: "Start with CRM basics: contacts, companies, and pipeline.",
    seatLimit: 5,
    prices: {
      [INTERVALS.MONTH]: {
        [CURRENCIES.USD]: 0,
        [CURRENCIES.EUR]: 0,
        [CURRENCIES.PLN]: 0,
      },
      [INTERVALS.YEAR]: {
        [CURRENCIES.USD]: 0,
        [CURRENCIES.EUR]: 0,
        [CURRENCIES.PLN]: 0,
      },
    },
  },
  {
    key: PLANS.PRO,
    productKey: PRODUCT_KEYS.CRM,
    name: "CRM Pro",
    description: "Full CRM: contacts, deals, pipelines, email, documents, and automations.",
    seatLimit: 25,
    prices: {
      [INTERVALS.MONTH]: {
        [CURRENCIES.USD]: 2900,
        [CURRENCIES.EUR]: 2700,
        [CURRENCIES.PLN]: 11900,
      },
      [INTERVALS.YEAR]: {
        [CURRENCIES.USD]: 29000,
        [CURRENCIES.EUR]: 27000,
        [CURRENCIES.PLN]: 119000,
      },
    },
  },
  {
    key: PLANS.FREE,
    productKey: PRODUCT_KEYS.GABINET,
    name: "Gabinet Free",
    description: "Start with clinic basics: patients and appointments.",
    seatLimit: 3,
    prices: {
      [INTERVALS.MONTH]: {
        [CURRENCIES.USD]: 0,
        [CURRENCIES.EUR]: 0,
        [CURRENCIES.PLN]: 0,
      },
      [INTERVALS.YEAR]: {
        [CURRENCIES.USD]: 0,
        [CURRENCIES.EUR]: 0,
        [CURRENCIES.PLN]: 0,
      },
    },
  },
  {
    key: PLANS.PRO,
    productKey: PRODUCT_KEYS.GABINET,
    name: "Gabinet Pro",
    description: "Full clinic management: patients, appointments, billing, loyalty, and scheduling.",
    seatLimit: 15,
    prices: {
      [INTERVALS.MONTH]: {
        [CURRENCIES.USD]: 4900,
        [CURRENCIES.EUR]: 4500,
        [CURRENCIES.PLN]: 19900,
      },
      [INTERVALS.YEAR]: {
        [CURRENCIES.USD]: 49000,
        [CURRENCIES.EUR]: 45000,
        [CURRENCIES.PLN]: 199000,
      },
    },
  },
];

export const insertSeedPlan = internalMutation({
  args: schema.tables.plans.validator,
  handler: async (ctx, args) => {
    await ctx.db.insert("plans", {
      stripeId: args.stripeId,
      key: args.key,
      productKey: args.productKey,
      name: args.name,
      description: args.description,
      seatLimit: args.seatLimit,
      prices: args.prices,
    });
  },
});

export const getAllPlans = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("plans").collect();
  },
});

export const patchPlanPlnPrices = internalMutation({
  args: {
    planId: v.id("plans"),
    monthPln: v.object({ stripeId: v.string(), amount: v.number() }),
    yearPln: v.object({ stripeId: v.string(), amount: v.number() }),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    await ctx.db.patch(args.planId, {
      prices: {
        ...plan.prices,
        month: { ...plan.prices.month, [CURRENCIES.PLN]: args.monthPln },
        year: { ...plan.prices.year, [CURRENCIES.PLN]: args.yearPln },
      },
    });
  },
});

/**
 * One-off migration for existing deployments that were set up before PLN
 * currency support was added. Creates PLN prices in Stripe for each plan
 * and patches the plan docs with the resulting price IDs.
 *
 * Safe to run multiple times — skips plans that already have PLN prices.
 */
export const migratePlnPrices = internalAction({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.runQuery(internal.init.getAllPlans);

    for (const plan of plans) {
      // Runtime check: existing docs pre-PLN won't have the pln field
      const existingMonthPln = (plan.prices.month as Record<string, unknown>).pln as
        | { stripeId: string }
        | undefined;
      if (existingMonthPln?.stripeId) {
        console.info(`⏭️  Plan ${plan.key}: PLN prices already exist, skipping.`);
        continue;
      }

      const seedProduct = seedProducts.find(
        (p) =>
          p.key === plan.key &&
          p.productKey === (plan.productKey ?? PRODUCT_KEYS.CRM),
      );
      if (!seedProduct) {
        console.warn(
          `⚠️  No seed config found for plan key: ${plan.key} / productKey: ${plan.productKey ?? PRODUCT_KEYS.CRM}`,
        );
        continue;
      }

      const monthAmount = seedProduct.prices[INTERVALS.MONTH][CURRENCIES.PLN];
      const yearAmount = seedProduct.prices[INTERVALS.YEAR][CURRENCIES.PLN];

      const [monthPrice, yearPrice] = await Promise.all([
        stripe.prices.create({
          product: plan.stripeId,
          currency: CURRENCIES.PLN,
          unit_amount: monthAmount,
          tax_behavior: "inclusive",
          recurring: { interval: INTERVALS.MONTH },
        }),
        stripe.prices.create({
          product: plan.stripeId,
          currency: CURRENCIES.PLN,
          unit_amount: yearAmount,
          tax_behavior: "inclusive",
          recurring: { interval: INTERVALS.YEAR },
        }),
      ]);

      await ctx.runMutation(internal.init.patchPlanPlnPrices, {
        planId: plan._id,
        monthPln: { stripeId: monthPrice.id, amount: monthPrice.unit_amount ?? 0 },
        yearPln: { stripeId: yearPrice.id, amount: yearPrice.unit_amount ?? 0 },
      });

      console.info(
        `✅ Plan ${plan.key}: PLN prices created (month: ${monthPrice.id}, year: ${yearPrice.id})`,
      );
    }

    console.info("🎉 PLN price migration complete.");
  },
});

export const patchPlanProductKey = internalMutation({
  args: {
    planId: v.id("plans"),
    productKey: productKeyValidator,
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    await ctx.db.patch(args.planId, { productKey: args.productKey });
  },
});

/**
 * One-off migration for existing deployments that were set up before per-module
 * plan support was added (issue #4090). Two steps:
 *
 * 1. Backfill productKey="crm" on legacy global plans that have no productKey,
 *    so the by_productAndKey index query in getActivePlans continues to work.
 * 2. Create any missing per-module plans (e.g. Gabinet Free/Pro) in Stripe and
 *    insert the corresponding plan docs with all currency prices.
 *
 * Safe to run multiple times — skips plans that already exist.
 */
export const migratePerModulePlans = internalAction({
  args: {},
  handler: async (ctx) => {
    const allPlans = await ctx.runQuery(internal.init.getAllPlans);

    // Step 1: backfill productKey on old global (CRM) plans.
    for (const plan of allPlans) {
      if (!plan.productKey) {
        await ctx.runMutation(internal.init.patchPlanProductKey, {
          planId: plan._id,
          productKey: PRODUCT_KEYS.CRM,
        });
        console.info(`✅ Plan ${plan.key}: backfilled productKey=crm`);
      }
    }

    // Step 2: create any plans missing from the DB.
    const refreshedPlans = await ctx.runQuery(internal.init.getAllPlans);
    for (const seedProduct of seedProducts) {
      const exists = refreshedPlans.some(
        (p) => p.key === seedProduct.key && p.productKey === seedProduct.productKey,
      );
      if (exists) {
        console.info(
          `⏭️  Plan ${seedProduct.productKey}/${seedProduct.key}: already exists, skipping.`,
        );
        continue;
      }

      const stripeProduct = await stripe.products.create({
        name: seedProduct.name,
        description: seedProduct.description,
      });

      const pricesByInterval = Object.entries(seedProduct.prices).flatMap(
        ([interval, prices]) =>
          Object.entries(prices).map(([currency, amount]) => ({
            interval,
            currency,
            amount,
          })),
      );

      const stripePrices = await Promise.all(
        pricesByInterval.map((price) =>
          stripe.prices.create({
            product: stripeProduct.id,
            currency: price.currency,
            unit_amount: price.amount,
            tax_behavior: "inclusive",
            recurring: { interval: price.interval as Interval },
          }),
        ),
      );

      const getPrice = (currency: Currency, interval: Interval) => {
        const price = stripePrices.find(
          (p) => p.currency === currency && p.recurring?.interval === interval,
        );
        if (!price) throw new Error(ERRORS.STRIPE_SOMETHING_WENT_WRONG);
        return { stripeId: price.id, amount: price.unit_amount ?? 0 };
      };

      await ctx.runMutation(internal.init.insertSeedPlan, {
        stripeId: stripeProduct.id,
        key: seedProduct.key as PlanKey,
        productKey: seedProduct.productKey as ProductKey,
        name: seedProduct.name,
        description: seedProduct.description,
        seatLimit: seedProduct.seatLimit,
        prices: {
          [INTERVALS.MONTH]: {
            [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.MONTH),
            [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.MONTH),
            [CURRENCIES.PLN]: getPrice(CURRENCIES.PLN, INTERVALS.MONTH),
          },
          [INTERVALS.YEAR]: {
            [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.YEAR),
            [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.YEAR),
            [CURRENCIES.PLN]: getPrice(CURRENCIES.PLN, INTERVALS.YEAR),
          },
        },
      });

      console.info(
        `✅ Created plan ${seedProduct.productKey}/${seedProduct.key}: ${stripeProduct.id}`,
      );
    }

    console.info("🎉 Per-module plan migration complete.");
  },
});

const init: RegisteredAction<
  "internal",
  Record<string, never>,
  Promise<void>
> = internalAction(async (ctx) => {
  /**
   * Stripe Products.
   */
  const products = await stripe.products.list({
    limit: 1,
  });
  if (products?.data?.length) {
    console.info("🏃‍♂️ Skipping Stripe products creation and seeding.");
    return;
  }

  const seededProducts = await asyncMap(seedProducts, async (product) => {
    // Format prices to match Stripe's API.
    const pricesByInterval = Object.entries(product.prices).flatMap(
      ([interval, price]) => {
        return Object.entries(price).map(([currency, amount]) => ({
          interval,
          currency,
          amount,
        }));
      },
    );

    // Create Stripe product.
    const stripeProduct = await stripe.products.create({
      name: product.name,
      description: product.description,
    });

    // Create Stripe price for the current product.
    const stripePrices = await Promise.all(
      pricesByInterval.map((price) => {
        return stripe.prices.create({
          product: stripeProduct.id,
          currency: price.currency ?? "usd",
          unit_amount: price.amount ?? 0,
          tax_behavior: "inclusive",
          recurring: {
            interval: (price.interval as Interval) ?? INTERVALS.MONTH,
          },
        });
      }),
    );

    const getPrice = (currency: Currency, interval: Interval) => {
      const price = stripePrices.find(
        (price) =>
          price.currency === currency && price.recurring?.interval === interval,
      );
      if (!price) {
        throw new Error(ERRORS.STRIPE_SOMETHING_WENT_WRONG);
      }
      return { stripeId: price.id, amount: price.unit_amount || 0 };
    };

    await ctx.runMutation(internal.init.insertSeedPlan, {
      stripeId: stripeProduct.id,
      key: product.key as PlanKey,
      productKey: product.productKey as ProductKey,
      name: product.name,
      description: product.description,
      seatLimit: product.seatLimit,
      prices: {
        [INTERVALS.MONTH]: {
          [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.MONTH),
          [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.MONTH),
          [CURRENCIES.PLN]: getPrice(CURRENCIES.PLN, INTERVALS.MONTH),
        },
        [INTERVALS.YEAR]: {
          [CURRENCIES.USD]: getPrice(CURRENCIES.USD, INTERVALS.YEAR),
          [CURRENCIES.EUR]: getPrice(CURRENCIES.EUR, INTERVALS.YEAR),
          [CURRENCIES.PLN]: getPrice(CURRENCIES.PLN, INTERVALS.YEAR),
        },
      },
    });

    return {
      key: product.key,
      product: stripeProduct.id,
      prices: stripePrices.map((price) => price.id),
    };
  });
  console.info(`📦 Stripe Products has been successfully created.`);

  // Configure Customer Portal.
  await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "Organization Name - Customer Portal",
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["address", "shipping", "tax_id", "email"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "always_invoice",
        products: seededProducts
          .filter(({ key }) => key !== PLANS.FREE)
          .map(({ product, prices }) => ({ product, prices })),
      },
    },
  });

  console.info(`👒 Stripe Customer Portal has been successfully configured.`);
  console.info(
    "🎉 Visit: https://dashboard.stripe.com/test/products to see your products.",
  );
});

export default init;
