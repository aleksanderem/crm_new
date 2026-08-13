import { internal } from "@cvx/_generated/api";
import { mutation, query, action, internalMutation } from "@cvx/_generated/server";
import { auth } from "@cvx/auth";
import { currencyValidator, PLANS, PRODUCT_KEYS, productKeyValidator, ProductKey } from "@cvx/schema";
import { asyncMap } from "convex-helpers";
import { v } from "convex/values";
import { User } from "~/types";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import type { UserRow } from "./_helpers/supabaseRows";
import { modifyAccountCredentials } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

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

// users table is auth — stays as mutation
export const updateUsername = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    await ctx.db.patch(userId, { username: args.username });
  },
});

// organizations and teamMemberships are AUTH tables — stay in Convex DB
// Convert to action for consistency, delegate auth writes to internalMutation
export const completeOnboarding = action({
  args: {
    username: v.string(),
    currency: currencyValidator,
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.app._completeOnboardingInternal, {
      username: args.username,
      currency: args.currency,
    });
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
      return;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return;
    }
    await ctx.db.patch(userId, { username: args.username });

    // Mirror user to Supabase so subsequent FK references (gabinet_employees,
    // team_memberships, etc.) resolve. Fire-and-forget; upsert-safe.
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

    // Auto-create a default organization for new users
    const existingMemberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!existingMemberships) {
      const now = Date.now();
      const orgId = await ctx.db.insert("organizations", {
        name: `${args.username}'s Workspace`,
        slug: args.username.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
      });

      // Also write org to Supabase (best-effort via scheduler)
      await ctx.scheduler.runAfter(
        0,
        internal.supabase.organizations.writeOrganizationToSupabase,
        {
          organizationId: String(orgId),
          name: `${args.username}'s Workspace`,
          slug: args.username.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
          ownerId: String(userId),
          createdAt: now,
          updatedAt: now,
        },
      );

      const membershipId = await ctx.db.insert("teamMemberships", {
        userId,
        organizationId: orgId,
        role: "owner",
        joinedAt: now,
      });

      await ctx.scheduler.runAfter(
        0,
        internal.supabase.organizations.writeTeamMembershipToSupabase,
        {
          membershipId: String(membershipId),
          userId: String(userId),
          organizationId: String(orgId),
          role: "owner",
          joinedAt: now,
        },
      );

      // Seed default reference data (sources, pipelines, lost reasons, etc.)
      await ctx.scheduler.runAfter(
        0,
        // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
        internal.seedDefaults.seedOrganizationDefaults,
        { organizationId: orgId, userId },
      );
    }

    if (user.customerId) {
      return;
    }
    await ctx.scheduler.runAfter(
      0,
      internal.stripe.PREAUTH_createStripeCustomer,
      {
        currency: args.currency,
        userId,
      },
    );
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

// users table is auth — stays as mutation
export const updateUserImage = mutation({
  args: {
    imageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const url = await ctx.storage.getUrl(args.imageId);
    await ctx.db.patch(userId, {
      imageId: args.imageId,
      image: url ?? undefined,
    });
  },
});

// users table is auth — stays as mutation
export const removeUserImage = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    ctx.db.patch(userId, { imageId: undefined, image: undefined });
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

// users table is auth — stays as mutation
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
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.language !== undefined) updates.language = args.language;
    if (args.theme !== undefined) updates.theme = args.theme;
    if (args.timezone !== undefined) updates.timezone = args.timezone;
    if (args.imageId !== undefined) {
      updates.imageId = args.imageId;
      const url = await ctx.storage.getUrl(args.imageId);
      if (url) updates.image = url;
    }
    await ctx.db.patch(userId, updates);
    return userId;
  },
});

// users table is auth — stays as mutation
export const deleteCurrentUserAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
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
  },
});

// Clears mustChangePassword after the user successfully sets a new password.
export const _clearMustChangePassword = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const userId = args.userId as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) return;
    // Setting to undefined removes the optional field from the document.
    await ctx.db.patch(userId, { mustChangePassword: undefined });
  },
});

// Action for a logged-in user to replace their one-time password.
// Validates the new password, updates credentials via @convex-dev/auth,
// and clears the mustChangePassword flag so the redirect gate is lifted.
export const setOwnPassword = action({
  args: { newPassword: v.string() },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8) {
      throw new Error("Hasło musi mieć co najmniej 8 znaków.");
    }

    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Read user from Convex (auth store) to get the email used as account ID.
    const user = await ctx.runQuery(internal.gabinet.employees._getConvexUser, {
      userId: String(userId),
    });
    if (!user?.email) {
      throw new Error("Nie znaleziono adresu e-mail użytkownika.");
    }

    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: user.email, secret: args.newPassword },
    });

    await ctx.runMutation(internal.app._clearMustChangePassword, {
      userId: String(userId),
    });
  },
});
