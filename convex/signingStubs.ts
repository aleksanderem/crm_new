import { action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const STUB_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

function generateStubId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Creates a single-use stub that maps an opaque ID to the real signing token.
// Called from sendSigningLinkSms so the raw token never appears in SMS logs.
export const createStub = internalMutation({
  args: {
    token: v.string(),
    organizationId: v.id("organizations"),
    signingTokenExpiresAt: v.number(),
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
    });
    return stubId;
  },
});

// Public: browser calls this with the stubId from the SMS URL.
// Returns the real signing token and burns the stub (single-use).
export const resolveStub = action({
  args: { stubId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(internal.signingStubs._consumeStub, {
      stubId: args.stubId,
    });
  },
});

// Internal: atomically validates and consumes the stub in one transaction.
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
    return stub.token;
  },
});
