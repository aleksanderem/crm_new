import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_REDIRECT_URI,
  SITE_URL,
} from "@cvx/env";
import { Id } from "../_generated/dataModel";

const MICROSOFT_SCOPES = [
  "Mail.ReadWrite",
  "Mail.Send",
  "User.Read",
  "offline_access",
].join(" ");

export const initiate = httpAction(async (_ctx, request) => {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_REDIRECT_URI) {
    return new Response("Microsoft OAuth not configured", { status: 500 });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const userId = url.searchParams.get("userId");

  if (!organizationId || !userId) {
    return new Response("Missing organizationId or userId", { status: 400 });
  }

  const state = btoa(JSON.stringify({ organizationId, userId }));

  const authUrl = new URL(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
  );
  authUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", MICROSOFT_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", MICROSOFT_SCOPES);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
});

export const callback = httpAction(async (ctx, request) => {
  const redirectBase = SITE_URL ?? "http://localhost:5173";

  try {
    if (
      !MICROSOFT_CLIENT_ID ||
      !MICROSOFT_CLIENT_SECRET ||
      !MICROSOFT_REDIRECT_URI
    ) {
      throw new Error("Microsoft OAuth not configured");
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${redirectBase}/dashboard/settings/integrations?error=${encodeURIComponent(error)}`,
        },
      });
    }

    if (!code || !stateParam) {
      throw new Error("Missing code or state parameter");
    }

    const state = JSON.parse(atob(stateParam)) as {
      organizationId: string;
      userId: string;
    };

    // Exchange code for tokens
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          redirect_uri: MICROSOFT_REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("Microsoft token exchange failed:", errText);
      throw new Error("Failed to exchange authorization code");
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
      token_type: string;
    };

    // Fetch user info for providerAccountId
    const userInfoResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!userInfoResponse.ok) {
      throw new Error("Failed to fetch Microsoft user info");
    }

    const userInfo = await userInfoResponse.json() as {
      mail?: string;
      userPrincipalName?: string;
    };

    const accountEmail = userInfo.mail || userInfo.userPrincipalName;
    if (!accountEmail) {
      throw new Error("Could not determine Microsoft account email");
    }

    // Store the connection
    await ctx.runMutation(internal.oauthConnections.createOrUpdate, {
      organizationId: state.organizationId as Id<"organizations">,
      providerAccountId: accountEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scope: tokens.scope,
      tokenType: tokens.token_type,
      connectedBy: state.userId as Id<"users">,
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${redirectBase}/dashboard/settings/integrations?success=true`,
      },
    });
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${redirectBase}/dashboard/settings/integrations?error=callback_failed`,
      },
    });
  }
});
