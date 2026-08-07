/**
 * Load test: Global search (Supabase ILIKE queries)
 *
 * Simulates concurrent users typing in the global search bar.
 * Each VU issues the same 7-table parallel query fan-out that
 * supabaseGlobalSearch() (src/hooks/use-supabase-search.ts) performs,
 * but sequentially via k6 (parallel HTTP batching via http.batch()).
 *
 * IMPORTANT — known performance risk:
 *   The search function uses `ILIKE '%pattern%'` which cannot use B-tree
 *   indexes. While pg_trgm is installed and GIN search_vector indexes exist
 *   on each table, they cover a tsvector column — NOT the ILIKE path. Under
 *   moderate load this will cause sequential scans on large tables.
 *
 *   If p95 latency exceeds the threshold, the fix is to switch search to use
 *   the search_vector column with `@@ websearch_to_tsquery()` or to add
 *   GIN trigram indexes (`USING gin (name gin_trgm_ops)`).
 *   See follow-up in GitHub issue #4305.
 *
 * Thresholds:
 *   p95 < 2000 ms  — generous to account for ILIKE fan-out
 *   error rate < 1%
 *
 * Run:
 *   k6 run --env SUPABASE_URL=... --env SUPABASE_SERVICE_ROLE_KEY=... \
 *           --env TEST_ORG_ID=... tests/load/global-search.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";
import { env, supabaseHeaders, validateEnv } from "./config.js";

const searchLatency = new Trend("global_search_latency", true);
const searchErrors = new Rate("global_search_errors");

export const options = {
  scenarios: {
    search_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "3m", target: 30 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    global_search_latency: ["p(95)<2000"],
    global_search_errors: ["rate<0.01"],
    http_req_failed: ["rate<0.01"],
  },
};

// Representative Polish-market search queries — short prefixes stress ILIKE worst-case.
const QUERIES = [
  "jan", "kowal", "anna", "piotr", "maria",
  "wiz", "mas", "lase", "rehab",
  "sp. z", "sp z o", "med", "kli",
];

export function setup() {
  validateEnv(["supabaseUrl", "supabaseKey", "orgId"]);
}

function buildSearchRequests(query, orgId, headers) {
  const pattern = `%${query}%`;
  const base = `${env.supabaseUrl}/rest/v1`;

  // Mirror the 7 queries in supabaseGlobalSearch()
  return [
    // contacts — first_name OR last_name ILIKE (multi-token AND chaining)
    {
      method: "GET",
      url: `${base}/contacts?select=id,first_name,last_name,email,title`
        + `&organization_id=eq.${orgId}`
        + `&or=(first_name.ilike.${pattern},last_name.ilike.${pattern})`
        + `&limit=5`,
      params: { headers, tags: { entity: "contacts" } },
    },
    // companies
    {
      method: "GET",
      url: `${base}/companies?select=id,name,industry,domain`
        + `&organization_id=eq.${orgId}`
        + `&name=ilike.${pattern}`
        + `&limit=5`,
      params: { headers, tags: { entity: "companies" } },
    },
    // leads
    {
      method: "GET",
      url: `${base}/leads?select=id,title,status,value`
        + `&organization_id=eq.${orgId}`
        + `&title=ilike.${pattern}`
        + `&limit=5`,
      params: { headers, tags: { entity: "leads" } },
    },
    // documents
    {
      method: "GET",
      url: `${base}/documents?select=id,name,status`
        + `&organization_id=eq.${orgId}`
        + `&name=ilike.${pattern}`
        + `&limit=5`,
      params: { headers, tags: { entity: "documents" } },
    },
    // products
    {
      method: "GET",
      url: `${base}/products?select=id,name,unit_price`
        + `&organization_id=eq.${orgId}`
        + `&name=ilike.${pattern}`
        + `&limit=5`,
      params: { headers, tags: { entity: "products" } },
    },
    // gabinet_patients
    {
      method: "GET",
      url: `${base}/gabinet_patients?select=id,first_name,last_name,email`
        + `&organization_id=eq.${orgId}`
        + `&or=(first_name.ilike.${pattern},last_name.ilike.${pattern})`
        + `&limit=5`,
      params: { headers, tags: { entity: "gabinet_patients" } },
    },
    // gabinet_treatments
    {
      method: "GET",
      url: `${base}/gabinet_treatments?select=id,name,price`
        + `&organization_id=eq.${orgId}`
        + `&name=ilike.${pattern}`
        + `&limit=5`,
      params: { headers, tags: { entity: "gabinet_treatments" } },
    },
  ];
}

export default function () {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const headers = supabaseHeaders();

  const startTime = Date.now();

  // k6 http.batch() fires all requests concurrently — matches browser Promise.all()
  const responses = http.batch(buildSearchRequests(query, env.orgId, headers));

  const wallTime = Date.now() - startTime;

  const allOk = responses.every((res) => {
    return check(res, {
      "status 200": (r) => r.status === 200,
    });
  });

  searchLatency.add(wallTime);
  searchErrors.add(!allOk);

  // Simulate debounce — user types another character after ~300 ms
  sleep(Math.random() * 0.5 + 0.3);
}
