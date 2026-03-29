import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { ActionCtx, httpAction } from "@cvx/_generated/server";
import { ERRORS } from "~/errors";
import { stripe } from "@cvx/stripe";
import { STRIPE_WEBHOOK_SECRET } from "@cvx/env";
import { z } from "zod";
import { internal } from "@cvx/_generated/api";
import { Currency, Interval, PLANS } from "@cvx/schema";
import {
  sendSubscriptionErrorEmail,
  sendSubscriptionSuccessEmail,
} from "@cvx/email/templates/subscriptionEmail";
import Stripe from "stripe";
import { Doc } from "@cvx/_generated/dataModel";

function normalizeWebhookValue(value: FormDataEntryValue | unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof File) return undefined;
  return undefined;
}

async function getRequestPayload(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    const payload: Record<string, string> = {};
    formData.forEach((value, key) => {
      const normalized = normalizeWebhookValue(value);
      if (normalized !== undefined) payload[key] = normalized;
    });
    return payload;
  }

  if (contentType.includes("application/json")) {
    const json = await request.json();
    if (json && typeof json === "object") {
      return Object.fromEntries(
        Object.entries(json as Record<string, unknown>).flatMap(([key, value]) => {
          if (typeof value === "string") return [[key, value]];
          if (typeof value === "number" || typeof value === "boolean") {
            return [[key, String(value)]];
          }
          return [];
        }),
      );
    }
  }

  const text = await request.text();
  const params = new URLSearchParams(text);
  return Object.fromEntries(params.entries());
}

function getFirstPayloadValue(
  payload: Record<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

async function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
) {
  const data = `${url}${Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}${params[key]}`)
    .join("")}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function verifyTwilioRequest(
  request: Request,
  params: Record<string, string>,
  authToken: string,
) {
  const signature = request.headers.get("X-Twilio-Signature");
  if (!signature) return false;
  const expected = await computeTwilioSignature(request.url, params, authToken);
  return signature === expected;
}

const http = httpRouter();

/**
 * Gets and constructs a Stripe event signature.
 *
 * @throws An error if Stripe signature is missing or if event construction fails.
 * @returns The Stripe event object.
 */
async function getStripeEvent(request: Request) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error(`Stripe - ${ERRORS.ENVS_NOT_INITIALIZED}`);
  }

  try {
    const signature = request.headers.get("Stripe-Signature");
    if (!signature) throw new Error(ERRORS.STRIPE_MISSING_SIGNATURE);
    const payload = await request.text();
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
    return event;
  } catch (err: unknown) {
    console.error(err);
    throw new Error(ERRORS.STRIPE_SOMETHING_WENT_WRONG);
  }
}

const handleUpdateSubscription = async (
  ctx: ActionCtx,
  user: Doc<"users">,
  subscription: Stripe.Subscription,
) => {
  const subscriptionItem = subscription.items.data[0];
  await ctx.runMutation(internal.stripe.PREAUTH_replaceSubscription, {
    userId: user._id,
    subscriptionStripeId: subscription.id,
    input: {
      currency: subscription.items.data[0].price.currency as Currency,
      planStripeId: subscriptionItem.plan.product as string,
      priceStripeId: subscriptionItem.price.id,
      interval: subscriptionItem.plan.interval as Interval,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
};

const handleCheckoutSessionCompleted = async (
  ctx: ActionCtx,
  event: Stripe.CheckoutSessionCompletedEvent,
) => {
  const session = event.data.object;

  const { customer: customerId, subscription: subscriptionId } = z
    .object({ customer: z.string(), subscription: z.string() })
    .parse(session);

  const user = await ctx.runQuery(internal.stripe.PREAUTH_getUserByCustomerId, {
    customerId,
  });
  if (!user?.email) {
    throw new Error(ERRORS.SOMETHING_WENT_WRONG);
  }

  const freeSubscriptionStripeId =
    user.subscription.planKey === PLANS.FREE
      ? user.subscription.stripeId
      : undefined;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  await handleUpdateSubscription(ctx, user, subscription);

  await sendSubscriptionSuccessEmail({
    email: user.email,
    subscriptionId,
  });

  // Cancel free subscription. - User upgraded to a paid plan.
  // Not required, but it's a good practice to keep just a single active plan.
  const subscriptions = (
    await stripe.subscriptions.list({ customer: customerId })
  ).data.map((sub) => sub.items);

  if (subscriptions.length > 1) {
    const freeSubscription = subscriptions.find((sub) =>
      sub.data.some(
        ({ subscription }) => subscription === freeSubscriptionStripeId,
      ),
    );
    if (freeSubscription) {
      await stripe.subscriptions.cancel(freeSubscription?.data[0].subscription);
    }
  }

  return new Response(null);
};

const handleCheckoutSessionCompletedError = async (
  ctx: ActionCtx,
  event: Stripe.CheckoutSessionCompletedEvent,
) => {
  const session = event.data.object;

  const { customer: customerId, subscription: subscriptionId } = z
    .object({ customer: z.string(), subscription: z.string() })
    .parse(session);

  const user = await ctx.runQuery(internal.stripe.PREAUTH_getUserByCustomerId, {
    customerId,
  });
  if (!user?.email) throw new Error(ERRORS.STRIPE_SOMETHING_WENT_WRONG);

  await sendSubscriptionErrorEmail({
    email: user.email,
    subscriptionId,
  });
  return new Response(null);
};

const handleCustomerSubscriptionUpdated = async (
  ctx: ActionCtx,
  event: Stripe.CustomerSubscriptionUpdatedEvent,
) => {
  const subscription = event.data.object;
  const { customer: customerId } = z
    .object({ customer: z.string() })
    .parse(subscription);

  const user = await ctx.runQuery(internal.stripe.PREAUTH_getUserByCustomerId, {
    customerId,
  });
  if (!user) throw new Error(ERRORS.SOMETHING_WENT_WRONG);

  await handleUpdateSubscription(ctx, user, subscription);

  return new Response(null);
};

const handleCustomerSubscriptionUpdatedError = async (
  ctx: ActionCtx,
  event: Stripe.CustomerSubscriptionUpdatedEvent,
) => {
  const subscription = event.data.object;

  const { id: subscriptionId, customer: customerId } = z
    .object({ id: z.string(), customer: z.string() })
    .parse(subscription);

  const user = await ctx.runQuery(internal.stripe.PREAUTH_getUserByCustomerId, {
    customerId,
  });
  if (!user?.email) throw new Error(ERRORS.STRIPE_SOMETHING_WENT_WRONG);

  await sendSubscriptionErrorEmail({
    email: user.email,
    subscriptionId,
  });
  return new Response(null);
};

const handleCustomerSubscriptionCreated = async (
  ctx: ActionCtx,
  event: Stripe.CustomerSubscriptionCreatedEvent,
) => {
  const subscription = event.data.object;
  const { customer: customerId } = z
    .object({ customer: z.string() })
    .parse(subscription);

  const user = await ctx.runQuery(internal.stripe.PREAUTH_getUserByCustomerId, {
    customerId,
  });
  if (!user) throw new Error(ERRORS.SOMETHING_WENT_WRONG);

  await handleUpdateSubscription(ctx, user, subscription);

  return new Response(null);
};

const handleCustomerSubscriptionDeleted = async (
  ctx: ActionCtx,
  event: Stripe.CustomerSubscriptionDeletedEvent,
) => {
  const subscription = event.data.object;
  await ctx.runMutation(internal.stripe.PREAUTH_deleteSubscription, {
    subscriptionStripeId: subscription.id,
  });
  return new Response(null);
};

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let event: Stripe.Event;
    try {
      event = await getStripeEvent(request);
    } catch (err: unknown) {
      // Signature validation failure or missing webhook secret
      console.error("Stripe webhook signature error:", err);
      return new Response("Webhook signature verification failed", {
        status: 400,
      });
    }

    try {
      switch (event.type) {
        /**
         * Occurs when a Checkout Session has been successfully completed.
         */
        case "checkout.session.completed": {
          return handleCheckoutSessionCompleted(ctx, event);
        }

        /**
         * Occurs when a new Stripe subscription is created.
         * E.g. when a user signs up for a paid plan for the first time.
         */
        case "customer.subscription.created": {
          return handleCustomerSubscriptionCreated(ctx, event);
        }

        /**
         * Occurs when a Stripe subscription has been updated.
         * E.g. when a user upgrades or downgrades their plan.
         */
        case "customer.subscription.updated": {
          return handleCustomerSubscriptionUpdated(ctx, event);
        }

        /**
         * Occurs whenever a customer's subscription ends.
         */
        case "customer.subscription.deleted": {
          return handleCustomerSubscriptionDeleted(ctx, event);
        }
      }
    } catch (err: unknown) {
      switch (event.type) {
        case "checkout.session.completed": {
          return handleCheckoutSessionCompletedError(ctx, event);
        }

        case "customer.subscription.updated": {
          return handleCustomerSubscriptionUpdatedError(ctx, event);
        }
      }

      throw err;
    }

    return new Response(null);
  }),
});

/**
 * Resend inbound email webhook.
 * Parses inbound payload, matches to org via emailAccounts,
 * auto-links to contact by from address, threads via In-Reply-To.
 */
http.route({
  path: "/resend/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const {
        from,
        to,
        subject,
        html,
        text,
        headers,
      } = body as {
        from: string;
        to: string | string[];
        subject: string;
        html?: string;
        text?: string;
        headers?: Record<string, string>;
      };

      const toAddresses = Array.isArray(to) ? to : [to];
      const fromEmail = from.includes("<")
        ? from.match(/<(.+)>/)?.[1] ?? from
        : from;

      // Match to address to an email account to find the org
      const emailAccount = await ctx.runQuery(
        internal.emails_internal.findEmailAccountByAddress,
        { addresses: toAddresses }
      );

      if (!emailAccount) {
        console.log("No matching email account for inbound:", toAddresses);
        return new Response("No matching account", { status: 200 });
      }

      const organizationId = emailAccount.organizationId;

      // Find existing thread via In-Reply-To header
      const inReplyTo = headers?.["In-Reply-To"] ?? headers?.["in-reply-to"];
      let threadId: string | undefined;
      if (inReplyTo) {
        const existingEmail = await ctx.runQuery(
          internal.emails_internal.findByMessageId,
          { messageId: inReplyTo }
        );
        if (existingEmail) {
          threadId = existingEmail.threadId;
        }
      }

      // Auto-link to contact by from email
      const contact = await ctx.runQuery(
        internal.emails_internal.findContactByEmail,
        { organizationId, email: fromEmail }
      );

      const messageId =
        headers?.["Message-ID"] ??
        headers?.["message-id"] ??
        `<${crypto.randomUUID()}@inbound>`;
      const finalThreadId = threadId ?? messageId;

      const snippet = text ? text.slice(0, 200) : html ? html.replace(/<[^>]*>/g, "").slice(0, 200) : undefined;

      await ctx.runMutation(internal.emails_internal.insertInbound, {
        organizationId,
        threadId: finalThreadId,
        messageId,
        inReplyTo,
        from: fromEmail,
        to: toAddresses,
        subject: subject ?? "(no subject)",
        bodyHtml: html,
        bodyText: text,
        snippet,
        contactId: contact?._id,
      });

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Inbound email error:", err);
      return new Response("Error", { status: 500 });
    }
  }),
});

http.route({
  path: "/sms/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const payload = await getRequestPayload(request);
      const provider = getFirstPayloadValue(payload, ["provider", "Provider"]);
      const to = getFirstPayloadValue(payload, ["To", "to", "recipient", "msisdn"]);
      const from = getFirstPayloadValue(payload, ["From", "from", "sender", "phone"]);
      const body = getFirstPayloadValue(payload, ["Body", "body", "message", "text"]);
      const providerMessageId = getFirstPayloadValue(payload, [
        "MessageSid",
        "messageSid",
        "message_id",
        "id",
      ]);

      if (!provider || !to || !from || !body) {
        return new Response("Missing inbound SMS fields", { status: 400 });
      }

      if (provider !== "twilio" && provider !== "smsapi") {
        return new Response("Unsupported SMS provider", { status: 400 });
      }

      let webhookSignatureVerified: boolean | undefined;
      if (provider === "twilio") {
        const config = await ctx.runQuery(internal.sms.getConfigForInbound, {
          provider,
          recipient: to,
        });
        if (!config?.apiSecret) {
          return new Response("No matching Twilio configuration", { status: 200 });
        }
        webhookSignatureVerified = await verifyTwilioRequest(request, payload, config.apiSecret);
        if (!webhookSignatureVerified) {
          return new Response("Invalid Twilio signature", { status: 401 });
        }
      }

      const idempotencyKey = providerMessageId
        ? `${provider}:${providerMessageId}`
        : `${provider}:${to}:${from}:${body.trim()}`;

      await ctx.runMutation(internal.gabinet.appointmentSms.processIncomingMessage, {
        provider,
        to,
        from,
        body,
        providerMessageId,
        webhookSignatureVerified,
        idempotencyKey,
        metadata: JSON.stringify(payload),
      });

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("Inbound SMS error:", err);
      return new Response("Error", { status: 500 });
    }
  }),
});

// --- Google OAuth routes ---
import { initiate as googleOAuthInitiate, callback as googleOAuthCallback } from "./google/oauth";

http.route({
  path: "/google/oauth/initiate",
  method: "GET",
  handler: googleOAuthInitiate,
});

http.route({
  path: "/google/oauth/callback",
  method: "GET",
  handler: googleOAuthCallback,
});

// --- Microsoft OAuth routes ---
import { initiate as microsoftOAuthInitiate, callback as microsoftOAuthCallback } from "./microsoft/oauth";

http.route({
  path: "/microsoft/oauth/initiate",
  method: "GET",
  handler: microsoftOAuthInitiate,
});

http.route({
  path: "/microsoft/oauth/callback",
  method: "GET",
  handler: microsoftOAuthCallback,
});

auth.addHttpRoutes(http);

export default http;
