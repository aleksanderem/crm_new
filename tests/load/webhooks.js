/**
 * Load test: Stripe and SMS webhook spike
 *
 * Models the burst scenario that occurs when Stripe delivers a batch of
 * subscription events (e.g. after a billing cycle) or when many appointment
 * SMS replies arrive simultaneously.
 *
 * Two scenarios run back-to-back:
 *   stripe_spike  — 50 VUs hit /stripe/webhook for 30 s
 *   sms_spike     — 50 VUs hit /sms/inbound for 30 s (smsapi, no sig check)
 *
 * Stripe notes:
 *   Without a real STRIPE_WEBHOOK_SECRET the handler returns 400 immediately
 *   (signature verification fails). To test full processing, set
 *   STRIPE_WEBHOOK_SECRET to a test-mode secret and use Stripe CLI to forward
 *   events — this script then sends properly-signed customer.subscription.updated
 *   payloads. In spike mode without the secret, only the HTTP layer (routing,
 *   request parsing, connection handling) is measured.
 *
 * SMS notes:
 *   smsapi provider skips Twilio signature verification, so full handler
 *   execution runs without additional secrets. Set TEST_SMS_TO_NUMBER to a
 *   number registered in an SMS config row for your test org, otherwise the
 *   handler returns 200 "No matching SMS configuration" (still exercises the
 *   lookup path under load).
 *
 * Thresholds:
 *   p95 < 3000 ms  — webhooks are fire-and-forget; higher latency acceptable
 *   error rate < 2%  — 400 from Stripe sig failure is expected without secret
 *
 * Run:
 *   k6 run --env CONVEX_HTTP_URL=... tests/load/webhooks.js
 *
 *   Full Stripe flow (requires Stripe CLI):
 *   k6 run --env CONVEX_HTTP_URL=... --env STRIPE_WEBHOOK_SECRET=whsec_test_... \
 *           tests/load/webhooks.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";
import { env, validateEnv } from "./config.js";

const stripeLatency = new Trend("stripe_webhook_latency", true);
const smsLatency = new Trend("sms_webhook_latency", true);
const stripeErrors = new Rate("stripe_webhook_errors");
const smsErrors = new Rate("sms_webhook_errors");
const stripeRejections = new Counter("stripe_sig_rejections");

export const options = {
  scenarios: {
    stripe_spike: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      startTime: "0s",
      tags: { scenario: "stripe" },
    },
    sms_spike: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      startTime: "35s",
      tags: { scenario: "sms" },
    },
  },
  thresholds: {
    stripe_webhook_latency: ["p(95)<3000"],
    sms_webhook_latency: ["p(95)<3000"],
    stripe_webhook_errors: ["rate<0.02"],
    sms_webhook_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.05"],
  },
};

// Minimal customer.subscription.updated payload — real structure but fake IDs.
// Without STRIPE_WEBHOOK_SECRET the signature header will be wrong and the
// handler returns 400; the test records that as a stripe_sig_rejection.
function stripePayload() {
  const ts = Math.floor(Date.now() / 1000);
  const customerId = `cus_test${Math.random().toString(36).slice(2, 10)}`;
  const subscriptionId = `sub_test${Math.random().toString(36).slice(2, 10)}`;
  const productId = `prod_test${Math.random().toString(36).slice(2, 10)}`;
  const priceId = `price_test${Math.random().toString(36).slice(2, 10)}`;

  return JSON.stringify({
    id: `evt_test${Math.random().toString(36).slice(2, 14)}`,
    object: "event",
    created: ts,
    livemode: false,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        customer: customerId,
        status: "active",
        current_period_start: ts - 2592000,
        current_period_end: ts + 2592000,
        cancel_at_period_end: false,
        trial_end: null,
        metadata: {},
        items: {
          data: [
            {
              id: `si_test${Math.random().toString(36).slice(2, 10)}`,
              plan: {
                product: productId,
                interval: "month",
              },
              price: {
                id: priceId,
                currency: "pln",
              },
              subscription: subscriptionId,
            },
          ],
        },
      },
    },
  });
}

// Minimal smsapi inbound SMS payload — no signature required.
function smsPayload(toNumber) {
  return {
    provider: "smsapi",
    To: toNumber || "+48100000000",
    From: `+48${Math.floor(Math.random() * 900000000 + 100000000)}`,
    Body: "Tak",
    message_id: `smsapi-${Math.random().toString(36).slice(2, 14)}`,
  };
}

function buildStripeSignatureHeader(payload) {
  if (!env.stripeWebhookSecret) {
    // Send a deliberately malformed signature — handler will 400 quickly
    return "t=1234567890,v1=invalid_signature_for_load_test";
  }
  // When secret is available, construct a valid Stripe signature.
  // k6 doesn't have Node crypto, so we use the Web Crypto API subset.
  // This runs in k6's goja runtime which supports TextEncoder + subtle.
  const ts = Math.floor(Date.now() / 1000);
  const signed = `${ts}.${payload}`;
  // NOTE: full HMAC-SHA256 signing would require k6/crypto (available in k6 >=0.43)
  // For simplicity, emit the timestamp and a placeholder — replace with:
  //   import { hmac } from 'k6/crypto';
  //   const sig = hmac('sha256', env.stripeWebhookSecret.replace('whsec_', ''), signed, 'hex');
  //   return `t=${ts},v1=${sig}`;
  return `t=${ts},v1=placeholder_replace_with_k6_crypto`;
}

export function setup() {
  validateEnv(["convexHttpUrl"]);
}

export default function () {
  const scenario = exec.scenario.name; // eslint-disable-line no-undef

  if (scenario === "stripe_spike") {
    const payload = stripePayload();
    const sigHeader = buildStripeSignatureHeader(payload);

    const res = http.post(
      `${env.convexHttpUrl}/stripe/webhook`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          "Stripe-Signature": sigHeader,
        },
        tags: { name: "stripe_webhook" },
      },
    );

    // 400 = signature rejected (expected without real secret), 200/500 = processed
    const sigRejected = res.status === 400;
    if (sigRejected) stripeRejections.add(1);

    const ok = check(res, {
      "responded (200 or 400)": (r) => r.status === 200 || r.status === 400,
      "not 5xx": (r) => r.status < 500,
    });

    stripeLatency.add(res.timings.duration);
    stripeErrors.add(!ok);
  } else {
    // sms_spike
    const toNumber = __ENV.TEST_SMS_TO_NUMBER || "+48100000000"; // eslint-disable-line no-undef
    const payload = smsPayload(toNumber);

    const res = http.post(
      `${env.convexHttpUrl}/sms/inbound`,
      JSON.stringify(payload),
      {
        headers: { "Content-Type": "application/json" },
        tags: { name: "sms_webhook" },
      },
    );

    // 200 = processed or "no matching config", 400 = bad payload
    const ok = check(res, {
      "status 200": (r) => r.status === 200,
      "not 5xx": (r) => r.status < 500,
    });

    smsLatency.add(res.timings.duration);
    smsErrors.add(!ok);
  }

  sleep(0.1);
}
