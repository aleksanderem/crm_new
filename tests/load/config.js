/**
 * Shared configuration for all load test scenarios.
 *
 * Required env vars (pass via k6 --env flag or OS environment):
 *   SUPABASE_URL             — self-hosted Supabase base URL (no trailing slash)
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS; load testing only)
 *   TEST_ORG_ID              — organization ID whose data the tests read
 *   CONVEX_HTTP_URL          — Convex HTTP endpoint base URL (for webhook tests)
 *
 * Optional:
 *   STRIPE_WEBHOOK_SECRET    — if set, webhook test signs payloads properly;
 *                              otherwise sends unsigned requests (expect 400 back)
 *
 * Usage:
 *   k6 run --env SUPABASE_URL=https://... --env SUPABASE_SERVICE_ROLE_KEY=... \
 *          --env TEST_ORG_ID=... --env CONVEX_HTTP_URL=https://... \
 *          tests/load/gabinet-calendar.js
 */

import { __ENV } from "k6"; // eslint-disable-line no-unused-vars -- k6 global

export const env = {
  supabaseUrl: __ENV.SUPABASE_URL,
  supabaseKey: __ENV.SUPABASE_SERVICE_ROLE_KEY,
  orgId: __ENV.TEST_ORG_ID,
  convexHttpUrl: __ENV.CONVEX_HTTP_URL,
  stripeWebhookSecret: __ENV.STRIPE_WEBHOOK_SECRET,
};

export function supabaseHeaders() {
  return {
    apikey: env.supabaseKey,
    Authorization: `Bearer ${env.supabaseKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

export function validateEnv(required) {
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars: ${missing.map((k) => {
        const map = {
          supabaseUrl: "SUPABASE_URL",
          supabaseKey: "SUPABASE_SERVICE_ROLE_KEY",
          orgId: "TEST_ORG_ID",
          convexHttpUrl: "CONVEX_HTTP_URL",
        };
        return map[k] ?? k;
      }).join(", ")}`,
    );
  }
}
