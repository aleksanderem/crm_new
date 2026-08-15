import { internal } from "@cvx/_generated/api";
import { mutation, query, action, internalMutation } from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import { currencyValidator, PLANS, PRODUCT_KEYS, productKeyValidator, ProductKey } from "@cvx/schema";
import { asyncMap } from "convex-helpers";
import { v } from "convex/values";
import { User } from "~/types";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import type { UserRow } from "./_helpers/supabaseRows";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx): Promise<User | undefined> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const [user, subscription] = await Promise.all([
      ctx.db.get(userId),
      ctx.db
        .query("subscriptions")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .unique(),
    ]);
    if (!user) {
      return;
    }
    const plan = subscription?.planId
      ? await ctx.db.get(subscription.planId)
      : undefined;
    const avatarUrl = user.imageId
      ? await ctx.storage.getUrl(user.imageId)
      : user.image;
    return {
      ...user,
      avatarUrl: avatarUrl || undefined,
      subscription:
        subscription && plan
          ? {
              ...subscription,
              planKey: plan.key,
            }
          : undefined,
    };
  },
});

// Returns whether the current user has the platform-admin flag, reading from
// Supabase (the authoritative store for isPlatformAdmin post-migration).
// Call this instead of user.isPlatformAdmin from getCurrentUser.
export const getIsPlatformAdmin = action({
  args: {},
  handler: async (ctx): Promise<{ isPlatformAdmin: boolean }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return { isPlatformAdmin: false };
    const db = createSupabaseDb();
    const user = (await db.get("users", String(userId))) as UserRow | null;
    return { isPlatformAdmin: Boolean(user?.isPlatformAdmin) };
  },
});

// users table is auth — ctx.db.patch is the Convex-side dual-write (needed for
// auth helpers that read from QueryCtx). The scheduler mirrors to Supabase.
export const updateUsername = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const user = await ctx.db.get(userId);
    if (!user) return;
    await ctx.db.patch(userId, { username: args.username });
    await ctx.scheduler.runAfter(0, internal.supabase.users.writeUserToSupabase, {
      userId: String(userId),
      email: user.email,
      name: user.name,
      username: args.username,
      image: user.image,
      imageStorageId: user.imageId ? String(user.imageId) : undefined,
      phone: user.phone,
      isAnonymous: user.isAnonymous,
      customerId: user.customerId,
      language: user.language,
      theme: user.theme,
      timezone: user.timezone,
      createdAt: Math.floor(user._creationTime),
      updatedAt: Date.now(),
    });
  },
});

// completeOnboarding is an action so it can write directly to Supabase after
// the Convex mutation settles. _completeOnboardingInternal handles all Convex
// writes (users, organizations, teamMemberships) which must stay in ctx.db for
// verifyOrgAccess / requireOrgAdmin (QueryCtx / MutationCtx, no HTTP). The
// action then mirrors each row to Supabase without scheduler indirection.
export const completeOnboarding = action({
  args: {
    username: v.string(),
    currency: currencyValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(internal.app._completeOnboardingInternal, {
      username: args.username,
      currency: args.currency,
    });
    if (!result) return;

    const db = createSupabaseDb();

    // Write user to Supabase (primary store). Do this first so org.owner_id
    // and team_memberships.user_id FKs resolve.
    await db.insert("users", {
      _id: result.userId,
      email: result.email,
      name: result.name,
      username: result.username,
      image: result.image,
      imageStorageId: result.imageStorageId,
      phone: result.phone,
      isAnonymous: result.isAnonymous ?? false,
      customerId: result.customerId,
      language: result.language,
      theme: result.theme,
      timezone: result.timezone,
      createdAt: result.createdAt,
      updatedAt: Date.now(),
    }).catch((e: unknown) =>
      console.error("[completeOnboarding] Supabase user write failed:", e),
    );

    if (result.orgCreated) {
      const { orgId, orgName, orgSlug, membershipId, createdAt } = result.orgCreated;

      // Write org then membership (dependency order: user → org → membership).
      await db.insert("organizations", {
        _id: orgId,
        name: orgName,
        slug: orgSlug,
        ownerId: result.userId,
        createdAt,
        updatedAt: createdAt,
      }).catch((e: unknown) =>
        console.error("[completeOnboarding] Supabase org write failed:", e),
      );

      await db.insert("teamMemberships", {
        _id: membershipId,
        userId: result.userId,
        organizationId: orgId,
        role: "owner",
        joinedAt: createdAt,
      }).catch((e: unknown) =>
        console.error("[completeOnboarding] Supabase membership write failed:", e),
      );
    }
  },
});

export const _completeOnboardingInternal = internalMutation({
  args: {
    username: v.string(),
    currency: currencyValidator,
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    await ctx.db.patch(userId, { username: args.username });

    // Auto-create a default organization for new users
    const existingMemberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    let orgCreated:
      | { orgId: string; orgName: string; orgSlug: string; membershipId: string; createdAt: number }
      | undefined;

    if (!existingMemberships) {
      const now = Date.now();
      const orgName = `${args.username}'s Workspace`;
      const orgSlug = args.username.toLowerCase().replace(/[^a-z0-9-]/g, "-");

      // Dual-write to Convex (required: verifyOrgAccess reads from ctx.db in
      // QueryCtx/MutationCtx which cannot make HTTP calls). Supabase write
      // happens in the parent completeOnboarding action.
      const orgId = await ctx.db.insert("organizations", {
        name: orgName,
        slug: orgSlug,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      });

      const membershipId = await ctx.db.insert("teamMemberships", {
        userId,
        organizationId: orgId,
        role: "owner",
        joinedAt: now,
      });

      // Seed default reference data (sources, pipelines, lost reasons, etc.)
      await ctx.scheduler.runAfter(
        0,
        // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
        internal.seedDefaults.seedOrganizationDefaults,
        { organizationId: orgId, userId },
      );

      orgCreated = {
        orgId: String(orgId),
        orgName,
        orgSlug,
        membershipId: String(membershipId),
        createdAt: now,
      };
    }

    if (!user.customerId) {
      await ctx.scheduler.runAfter(
        0,
        internal.stripe.PREAUTH_createStripeCustomer,
        {
          currency: args.currency,
          userId,
        },
      );
    }

    return {
      userId: String(userId),
      email: user.email,
      name: user.name,
      username: args.username,
      image: user.image,
      imageStorageId: user.imageId ? String(user.imageId) : undefined,
      phone: user.phone,
      isAnonymous: user.isAnonymous,
      customerId: user.customerId,
      language: user.language,
      theme: user.theme,
      timezone: user.timezone,
      createdAt: Math.floor(user._creationTime),
      orgCreated,
    };
  },
});

// users table is auth — stays as mutation
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("User not found");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const getStorageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.getUrl(args.storageId);
  },
});

// users table is auth — ctx.db.patch is the Convex-side dual-write.
// Scheduler mirrors to Supabase.
export const updateUserImage = mutation({
  args: {
    imageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const user = await ctx.db.get(userId);
    if (!user) return;
    const url = await ctx.storage.getUrl(args.imageId);
    await ctx.db.patch(userId, {
      imageId: args.imageId,
      image: url ?? undefined,
    });
    await ctx.scheduler.runAfter(0, internal.supabase.users.writeUserToSupabase, {
      userId: String(userId),
      email: user.email,
      name: user.name,
      username: user.username,
      image: url ?? undefined,
      imageStorageId: String(args.imageId),
      phone: user.phone,
      isAnonymous: user.isAnonymous,
      customerId: user.customerId,
      language: user.language,
      theme: user.theme,
      timezone: user.timezone,
      createdAt: Math.floor(user._creationTime),
      updatedAt: Date.now(),
    });
  },
});

// users table is auth — ctx.db.patch is the Convex-side dual-write.
// Scheduler mirrors to Supabase.
export const removeUserImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const user = await ctx.db.get(userId);
    if (!user) return;
    await ctx.db.patch(userId, { imageId: undefined, image: undefined });
    await ctx.scheduler.runAfter(0, internal.supabase.users.writeUserToSupabase, {
      userId: String(userId),
      email: user.email,
      name: user.name,
      username: user.username,
      image: undefined,
      imageStorageId: undefined,
      phone: user.phone,
      isAnonymous: user.isAnonymous,
      customerId: user.customerId,
      language: user.language,
      theme: user.theme,
      timezone: user.timezone,
      createdAt: Math.floor(user._creationTime),
      updatedAt: Date.now(),
    });
  },
});

// Public query — no auth required. Returns a server timestamp proving Convex
// is alive. Used by the /status page to verify backend health.
export const getPublicStatus = query({
  args: {},
  handler: async (_ctx) => {
    return { ts: Date.now() };
  },
});

// Public query — no auth required. Returns PLN monthly/yearly prices for the
// CRM Pro and Gabinet Pro plans so the public pricing page can display live
// prices instead of hardcoded placeholders. Returns null when plans have not
// been seeded yet (Stripe not configured).
export const getPublicPricingPlans = query({
  args: {},
  handler: async (ctx) => {
    const [crmPro, gabinetPro] = await Promise.all([
      ctx.db
        .query("plans")
        .withIndex("by_productAndKey", (q) =>
          q.eq("productKey", PRODUCT_KEYS.CRM).eq("key", PLANS.PRO),
        )
        .unique(),
      ctx.db
        .query("plans")
        .withIndex("by_productAndKey", (q) =>
          q.eq("productKey", PRODUCT_KEYS.GABINET).eq("key", PLANS.PRO),
        )
        .unique(),
    ]);
    if (!crmPro || !gabinetPro) return null;
    return {
      crm: {
        monthPln: crmPro.prices.month.pln.amount,
        yearPln: crmPro.prices.year.pln.amount,
      },
      gabinet: {
        monthPln: gabinetPro.prices.month.pln.amount,
        yearPln: gabinetPro.prices.year.pln.amount,
      },
    };
  },
});

export const getActivePlans = query({
  args: { productKey: v.optional(productKeyValidator) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const pk: ProductKey = args.productKey ?? PRODUCT_KEYS.CRM;
    const [free, pro] = await asyncMap(
      [PLANS.FREE, PLANS.PRO] as const,
      (key) =>
        ctx.db
          .query("plans")
          .withIndex("by_productAndKey", (q) => q.eq("productKey", pk).eq("key", key))
          .unique(),
    );
    if (!free || !pro) {
      return null;
    }
    return { free, pro };
  },
});

// users table is auth — ctx.db.patch is the Convex-side dual-write.
// Scheduler mirrors to Supabase.
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    language: v.optional(v.string()),
    theme: v.optional(
      v.union(v.literal("light"), v.literal("dark"), v.literal("system"))
    ),
    timezone: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.language !== undefined) updates.language = args.language;
    if (args.theme !== undefined) updates.theme = args.theme;
    if (args.timezone !== undefined) updates.timezone = args.timezone;
    let newImageUrl: string | undefined;
    let newImageStorageId: string | undefined;
    if (args.imageId !== undefined) {
      updates.imageId = args.imageId;
      const url = await ctx.storage.getUrl(args.imageId);
      if (url) {
        updates.image = url;
        newImageUrl = url;
      }
      newImageStorageId = String(args.imageId);
    }
    await ctx.db.patch(userId, updates);
    await ctx.scheduler.runAfter(0, internal.supabase.users.writeUserToSupabase, {
      userId: String(userId),
      email: user.email,
      name: args.name ?? user.name,
      username: user.username,
      image: newImageUrl ?? user.image,
      imageStorageId: newImageStorageId ?? (user.imageId ? String(user.imageId) : undefined),
      phone: user.phone,
      isAnonymous: user.isAnonymous,
      customerId: user.customerId,
      language: args.language ?? user.language,
      theme: args.theme ?? user.theme,
      timezone: args.timezone ?? user.timezone,
      createdAt: Math.floor(user._creationTime),
      updatedAt: Date.now(),
    });
    return userId;
  },
});

// deleteCurrentUserAccount is an action so it can also delete the user row
// from Supabase. _deleteCurrentUserInternal handles all Convex ctx.db deletes
// (users, subscriptions, authAccounts) which must stay in the Convex store.
export const deleteCurrentUserAccount = action({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runMutation(internal.app._deleteCurrentUserInternal, {});
    if (!result) return;
    const db = createSupabaseDb();
    try {
      await db.delete("users", result.userId);
    } catch (e) {
      console.error("[deleteCurrentUserAccount] Supabase user delete failed:", e);
    }
  },
});

export const _deleteCurrentUserInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    if (!subscription) {
      console.error("No subscription found");
    } else {
      await ctx.db.delete(subscription._id);
      await ctx.scheduler.runAfter(
        0,
        internal.stripe.cancelCurrentUserSubscriptions,
      );
    }
    await ctx.db.delete(userId);
    await asyncMap(["resend-otp", "github"], async (provider) => {
      const authAccount = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) =>
          q.eq("userId", userId).eq("provider", provider),
        )
        .unique();
      if (!authAccount) {
        return;
      }
      await ctx.db.delete(authAccount._id);
    });
    return { userId: String(userId) };
  },
});
