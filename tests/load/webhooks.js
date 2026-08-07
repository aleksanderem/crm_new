/**
 * k6 load test — Stripe webhook endpoint with HMAC-SHA256 signing.
 *
 * Requires k6 >= 0.43 (k6/crypto module).
 *
 * Usage:
 *   k6 run tests/load/webhooks.js \
 *     -e STRIPE_WEBHOOK_SECRET=whsec_test_... \
 *     -e CONVEX_BASE_URL=https://your-project.convex.cloud
 *
 * The test exercises the full Stripe processing path through signature
 * verification (not just HTTP routing). Requests signed with the wrong
 * secret return 400; correctly signed requests reach handler logic.
 *
 * Expected responses in a test environment:
 *   200 — event processed (rare without real DB fixtures)
 *   500 — signature OK, business logic rejected (e.g. customer not found)
 *   400 — signature mismatch (indicates misconfigured STRIPE_WEBHOOK_SECRET)
 */

import http from 'k6/http';
import { hmac } from 'k6/crypto';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    // A 400 means signature verification failed — that must not happen.
    'checks{check:signature accepted}': ['rate>0.99'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.CONVEX_BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.STRIPE_WEBHOOK_SECRET || 'whsec_test_placeholder';
const WEBHOOK_URL = `${BASE_URL}/stripe/webhook`;

/**
 * Builds a Stripe-Signature header for the given raw JSON body.
 *
 * Stripe's v1 signing scheme: HMAC-SHA256 over "<unix_ts>.<body>" with the
 * webhook signing secret as the key. The header format is "t=<ts>,v1=<hex>".
 *
 * The Stripe Node SDK accepts the full whsec_... string as the HMAC key
 * (it does not strip the prefix internally); this mirrors that behaviour.
 */
function stripeSignatureHeader(body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = hmac('sha256', WEBHOOK_SECRET, `${timestamp}.${body}`, 'hex');
  return `t=${timestamp},v1=${sig}`;
}

const EVENTS = [
  {
    type: 'customer.subscription.updated',
    body: JSON.stringify({
      id: 'evt_load_sub_updated',
      object: 'event',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_load_test',
          object: 'subscription',
          customer: 'cus_load_test',
          status: 'active',
          items: {
            object: 'list',
            data: [
              {
                id: 'si_load_test',
                price: { id: 'price_load_test', currency: 'usd' },
                plan: {
                  id: 'plan_load_test',
                  interval: 'month',
                  product: 'prod_load_test',
                },
                subscription: 'sub_load_test',
              },
            ],
          },
          current_period_start: 1700000000,
          current_period_end: 1702678400,
          cancel_at_period_end: false,
          trial_end: null,
          metadata: {},
        },
      },
    }),
  },
  {
    type: 'invoice.finalized',
    body: JSON.stringify({
      id: 'evt_load_invoice_finalized',
      object: 'event',
      type: 'invoice.finalized',
      data: {
        object: {
          id: 'in_load_test',
          object: 'invoice',
          customer: 'cus_load_test',
          amount_due: 2900,
          tax: 0,
          total_tax_amounts: [],
          currency: 'usd',
          status: 'open',
        },
      },
    }),
  },
  {
    type: 'invoice.payment_failed',
    body: JSON.stringify({
      id: 'evt_load_payment_failed',
      object: 'event',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_load_fail',
          object: 'invoice',
          customer: 'cus_load_test',
          subscription: 'sub_load_test',
          amount_due: 2900,
          currency: 'usd',
          status: 'open',
        },
      },
    }),
  },
];

export default function () {
  const event = EVENTS[Math.floor(Math.random() * EVENTS.length)];

  const res = http.post(WEBHOOK_URL, event.body, {
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': stripeSignatureHeader(event.body),
    },
    tags: { event_type: event.type },
  });

  // 400 means Stripe signature verification rejected the request — the HMAC
  // key is wrong. Any other status (200, 500) means the signature was accepted
  // and the handler ran (or threw on missing DB fixtures, which is expected in
  // a test environment without seeded Stripe customer data).
  check(res, {
    'signature accepted': (r) => r.status !== 400,
  });

  sleep(1);
}
