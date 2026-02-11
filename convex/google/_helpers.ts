import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "@cvx/env";

/**
 * Gets a valid Google access token for the organization, refreshing if expired.
 * Returns null if no active Google connection exists.
 */
export async function getValidAccessToken(
  ctx: ActionCtx,
  organizationId: Id<"organizations">
): Promise<{ accessToken: string; connectionId: Id<"oauthConnections"> } | null> {
  const connection = await ctx.runQuery(
    internal.oauthConnections.getActiveGoogle,
    { organizationId }
  );

  if (!connection) return null;

  // If token is still valid (with 5 minute buffer), return it
  if (connection.expiresAt > Date.now() + 5 * 60 * 1000) {
    return { accessToken: connection.accessToken, connectionId: connection._id };
  }

  // Token expired — refresh it
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth credentials not configured");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Failed to refresh Google token:", error);
    throw new Error("Failed to refresh Google access token");
  }

  const data = await response.json();
  const newExpiresAt = Date.now() + (data.expires_in as number) * 1000;

  await ctx.runMutation(internal.oauthConnections.updateTokens, {
    connectionId: connection._id,
    accessToken: data.access_token as string,
    expiresAt: newExpiresAt,
  });

  return { accessToken: data.access_token as string, connectionId: connection._id };
}
