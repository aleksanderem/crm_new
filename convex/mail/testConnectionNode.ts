"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createMailgunAdapter } from "./adapters/mailgun";
import { createGoogleAdapter } from "./adapters/google";
import { createMicrosoftAdapter } from "./adapters/microsoft";
import type { ConnectionTestResult } from "./adapter";

export const runProviderTest = internalAction({
  args: {
    providerType: v.union(
      v.literal("google"),
      v.literal("microsoft"),
      v.literal("mailgun"),
      v.literal("resend"),
    ),
    fromEmail: v.string(),
    fromName: v.string(),
    apiConfig: v.optional(
      v.object({
        apiKey: v.optional(v.string()),
        domain: v.optional(v.string()),
        region: v.optional(v.string()),
      }),
    ),
    oauthTokens: v.optional(
      v.object({
        accessToken: v.string(),
        refreshToken: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (_ctx, args): Promise<ConnectionTestResult> => {
    try {
      if (args.providerType === "mailgun") {
        const adapter = createMailgunAdapter(
          args.apiConfig?.apiKey ?? "",
          args.apiConfig?.domain ?? "",
          args.fromEmail,
          args.fromName,
          args.apiConfig?.region ?? "us",
        );
        return adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: args.fromEmail };
      }
      if (args.providerType === "google") {
        const adapter = createGoogleAdapter(
          args.oauthTokens?.accessToken ?? "",
          args.oauthTokens?.refreshToken ?? "",
          args.fromEmail,
          args.fromName,
          process.env.GOOGLE_CLIENT_ID ?? "",
          process.env.GOOGLE_CLIENT_SECRET ?? "",
          args.oauthTokens?.expiresAt ?? 0,
        );
        return adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: args.fromEmail };
      }
      if (args.providerType === "microsoft") {
        const adapter = createMicrosoftAdapter(
          args.oauthTokens?.accessToken ?? "",
          args.oauthTokens?.refreshToken ?? "",
          args.fromEmail,
          args.fromName,
        );
        return adapter.testConnection
          ? await adapter.testConnection()
          : { success: true, accountEmail: args.fromEmail };
      }
      // Resend has no testConnection — check that API key is present
      return args.apiConfig?.apiKey
        ? { success: true, accountEmail: args.fromEmail }
        : { success: false, error: "Missing API key" };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});
