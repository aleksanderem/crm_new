import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Stubs past their expiry are already rejected by _consumeStub, so they are
// safe to delete. A 24 h grace period past expiresAt preserves rows for any
// incident diagnostics before removal.
const CLEANUP_GRACE_MS = 24 * 60 * 60 * 1000; // 24 hours
// Batch cap: Convex mutations have an implicit write-unit budget; 500 deletes
// per invocation stays well under it and the daily cadence keeps the table
// from growing between runs.
const CLEANUP_BATCH_SIZE = 500;

const STUB_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

function generateStubId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Creates a single-use stub that maps an opaque ID to the real signing token.
// Called from sendSigningLinkSms and signing email senders so the raw token
// never appears in provider logs.
// destination: "sign" (default) → /sign/$token; "sign_form" → /sign/form/$token
export const createStub = internalMutation({
  args: {
    token: v.string(),
    organizationId: v.id("organizations"),
    signingTokenExpiresAt: v.number(),
    destination: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stubId = generateStubId();
    const expiresAt = Math.min(
      Date.now() + STUB_EXPIRY_MS,
      args.signingTokenExpiresAt,
    );
    await ctx.db.insert("signingLinkStubs", {
      stubId,
      token: args.token,
      organizationId: args.organizationId,
      expiresAt,
      destination: args.destination,
    });
    return stubId;
  },
});

// Public: browser calls this with the stubId from the SMS URL.
// Returns the real signing token and burns the stub (single-use).
export const resolveStub = action({
  args: { stubId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ token: string; destination: string }> => {
    return await ctx.runMutation(internal.signingStubs._consumeStub, {
      stubId: args.stubId,
    });
  },
});

// Internal: atomically validates and consumes the stub in one transaction.
// Returns { token, destination } so the caller knows where to redirect.
export const _consumeStub = internalMutation({
  args: { stubId: v.string() },
  handler: async (ctx, args) => {
    const stub = await ctx.db
      .query("signingLinkStubs")
      .withIndex("by_stubId", (q) => q.eq("stubId", args.stubId))
      .first();

    if (!stub) throw new Error("Link not found");
    if (stub.usedAt) throw new Error("Link already used");
    if (Date.now() > stub.expiresAt) throw new Error("Link expired");

    await ctx.db.patch(stub._id, { usedAt: Date.now() });
    return { token: stub.token, destination: stub.destination ?? "sign" };
  },
});

// Cron target: delete stubs whose expiresAt has passed the grace period.
// Rows rejected by _consumeStub are already dead at expiry; the grace period
// gives 24 h of diagnostic window before the row disappears.
export const _cleanupExpiredStubs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - CLEANUP_GRACE_MS;
    const expired = await ctx.db
      .query("signingLinkStubs")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", cutoff))
      .take(CLEANUP_BATCH_SIZE);

    for (const stub of expired) {
      await ctx.db.delete(stub._id);
    }

    if (expired.length > 0) {
      console.info(`[cleanupExpiredStubs] Deleted ${expired.length} expired stub(s)`);
    }
  },
});
