import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, SITE_URL } from "@cvx/env";
import { Id } from "../_generated/dataModel";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export const initiate = httpAction(async (_ctx, request) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    return new Response("Google OAuth not configured", { status: 500 });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const userId = url.searchParams.get("userId");

  if (!organizationId || !userId) {
    return new Response("Missing organizationId or userId", { status: 400 });
  }

  const state = btoa(JSON.stringify({ organizationId, userId }));

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
});

export const callback = httpAction(async (ctx, request) => {
  const redirectBase = SITE_URL ?? "http://localhost:5173";

  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      throw new Error("Google OAuth not configured");
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
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error("Token exchange failed:", errText);
      throw new Error("Failed to exchange authorization code");
    }

    const tokens = await tokenResponse.json();

    // Fetch user info for providerAccountId
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!userInfoResponse.ok) {
      throw new Error("Failed to fetch Google user info");
    }

    const userInfo = await userInfoResponse.json();

    // Store the connection
    await ctx.runMutation(internal.oauthConnections.createOrUpdate, {
      organizationId: state.organizationId as Id<"organizations">,
      providerAccountId: userInfo.email as string,
      accessToken: tokens.access_token as string,
      refreshToken: tokens.refresh_token as string,
      expiresAt: Date.now() + (tokens.expires_in as number) * 1000,
      scope: tokens.scope as string,
      tokenType: tokens.token_type as string,
      connectedBy: state.userId as Id<"users">,
    });

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${redirectBase}/dashboard/settings/integrations?success=true`,
      },
    });
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${redirectBase}/dashboard/settings/integrations?error=callback_failed`,
      },
    });
  }
});
