/**
 * End-to-end verification: JWT Bridge + Supabase RLS org isolation
 *
 * Proves that JWTs minted with different org_ids see only their own data
 * when querying Supabase PostgREST. Uses the same JWT signing mechanism
 * as the Convex mintSupabaseToken action.
 *
 * Usage: npx tsx scripts/verify-jwt-bridge.ts
 * Requires: .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SignJWT } from "jose";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env loading (manual — no dotenv dependency needed)
// ---------------------------------------------------------------------------

function loadEnvFile(): Record<string, string> {
  const envPath = resolve(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
    const vars: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

const fileEnv = loadEnvFile();
function env(key: string): string {
  const val = process.env[key] || fileEnv[key];
  if (!val) {
    console.error(`[FAIL] Missing env var: ${key}. Set it in .env.local`);
    process.exit(1);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = env("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_JWT_SECRET = env("SUPABASE_JWT_SECRET");

// Test identifiers — deterministic for reliable cleanup
const TEST_PREFIX = "__jwt_bridge_test__";
const TEST_USER_ID = `${TEST_PREFIX}user_001`;
const ORG_ALPHA_ID = `${TEST_PREFIX}org_alpha`;
const ORG_BETA_ID = `${TEST_PREFIX}org_beta`;
const NOW_MS = Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;

function pass(label: string, detail?: string) {
  passCount++;
  console.log(`[PASS] ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label: string, detail?: string) {
  failCount++;
  console.error(`[FAIL] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function signJwt(orgId: string): Promise<string> {
  const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: TEST_USER_ID,
    org_id: orgId,
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("supabase")
    .setIssuedAt(now)
    .setExpirationTime(now + 300) // 5 min — enough for the test
    .sign(secret);
}

function createAuthenticatedClient(jwt: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_JWT_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
        apikey: SUPABASE_JWT_SECRET,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Service-role client for setup/teardown
// ---------------------------------------------------------------------------

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Setup: insert test user, orgs, and org-scoped rows
// ---------------------------------------------------------------------------

async function setup() {
  console.log("\n--- Setup: inserting test data ---");

  // Clean up any leftover data from a prior failed run
  await teardown(true);

  // 1. Test user (required as FK target for organizations.owner_id)
  const { error: userErr } = await serviceClient.from("users").insert({
    id: TEST_USER_ID,
    name: "JWT Bridge Test User",
    email: `${TEST_PREFIX}@test.local`,
    role: "user",
    created_at: NOW_MS,
    updated_at: NOW_MS,
  });
  if (userErr) {
    fail("Insert test user", userErr.message);
    return false;
  }

  // 2. Two organizations
  for (const [orgId, name, slug] of [
    [ORG_ALPHA_ID, "Alpha Org", `${TEST_PREFIX}alpha`],
    [ORG_BETA_ID, "Beta Org", `${TEST_PREFIX}beta`],
  ] as const) {
    const { error } = await serviceClient.from("organizations").insert({
      id: orgId,
      name,
      slug,
      owner_id: TEST_USER_ID,
      created_at: NOW_MS,
      updated_at: NOW_MS,
    });
    if (error) {
      fail(`Insert org ${orgId}`, error.message);
      return false;
    }
  }

  // 3. Org-scoped test rows in sources table
  const sources = [
    {
      id: `${TEST_PREFIX}src_alpha_1`,
      organization_id: ORG_ALPHA_ID,
      name: "Alpha Source 1",
      order: 1,
      is_active: true,
      created_by: TEST_USER_ID,
      created_at: NOW_MS,
      updated_at: NOW_MS,
    },
    {
      id: `${TEST_PREFIX}src_alpha_2`,
      organization_id: ORG_ALPHA_ID,
      name: "Alpha Source 2",
      order: 2,
      is_active: true,
      created_by: TEST_USER_ID,
      created_at: NOW_MS,
      updated_at: NOW_MS,
    },
    {
      id: `${TEST_PREFIX}src_beta_1`,
      organization_id: ORG_BETA_ID,
      name: "Beta Source 1",
      order: 1,
      is_active: true,
      created_by: TEST_USER_ID,
      created_at: NOW_MS,
      updated_at: NOW_MS,
    },
  ];

  const { error: srcErr } = await serviceClient.from("sources").insert(sources);
  if (srcErr) {
    fail("Insert test sources", srcErr.message);
    return false;
  }

  pass("Test data inserted", "1 user, 2 orgs, 3 source rows");
  return true;
}

// ---------------------------------------------------------------------------
// Teardown: remove all test data (reverse FK order)
// ---------------------------------------------------------------------------

async function teardown(silent = false) {
  // Delete in FK-safe order: sources → organizations → users
  await serviceClient
    .from("sources")
    .delete()
    .like("id", `${TEST_PREFIX}%`);
  await serviceClient
    .from("organizations")
    .delete()
    .like("id", `${TEST_PREFIX}%`);
  await serviceClient
    .from("users")
    .delete()
    .like("id", `${TEST_PREFIX}%`);
  if (!silent) {
    pass("Cleanup", "test data removed");
  }
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

async function testJwtSigning() {
  console.log("\n--- Test: JWT signing ---");
  try {
    const token = await signJwt(ORG_ALPHA_ID);
    if (typeof token === "string" && token.split(".").length === 3) {
      pass("JWT signing", "valid 3-part token produced");
    } else {
      fail("JWT signing", "token format invalid");
    }
  } catch (e: unknown) {
    fail("JWT signing", (e as Error).message);
  }
}

async function testOrgAlphaIsolation() {
  console.log("\n--- Test: Org Alpha isolation ---");
  const jwt = await signJwt(ORG_ALPHA_ID);
  const client = createAuthenticatedClient(jwt);

  const { data, error, status } = await client
    .from("sources")
    .select("id, organization_id, name")
    .like("id", `${TEST_PREFIX}%`);

  if (error) {
    fail("Org Alpha query", `HTTP ${status}: ${error.message}`);
    return;
  }

  const rows = data ?? [];
  if (rows.length === 2) {
    pass("Org Alpha row count", `got ${rows.length} rows (expected 2)`);
  } else {
    fail("Org Alpha row count", `got ${rows.length} rows (expected 2)`);
  }

  const allAlpha = rows.every((r) => r.organization_id === ORG_ALPHA_ID);
  if (allAlpha) {
    pass("Org Alpha isolation", "all rows belong to alpha org");
  } else {
    fail(
      "Org Alpha isolation",
      `found rows from other orgs: ${JSON.stringify(rows)}`
    );
  }
}

async function testOrgBetaIsolation() {
  console.log("\n--- Test: Org Beta isolation ---");
  const jwt = await signJwt(ORG_BETA_ID);
  const client = createAuthenticatedClient(jwt);

  const { data, error, status } = await client
    .from("sources")
    .select("id, organization_id, name")
    .like("id", `${TEST_PREFIX}%`);

  if (error) {
    fail("Org Beta query", `HTTP ${status}: ${error.message}`);
    return;
  }

  const rows = data ?? [];
  if (rows.length === 1) {
    pass("Org Beta row count", `got ${rows.length} row (expected 1)`);
  } else {
    fail("Org Beta row count", `got ${rows.length} rows (expected 1)`);
  }

  const allBeta = rows.every((r) => r.organization_id === ORG_BETA_ID);
  if (allBeta) {
    pass("Org Beta isolation", "all rows belong to beta org");
  } else {
    fail(
      "Org Beta isolation",
      `found rows from other orgs: ${JSON.stringify(rows)}`
    );
  }
}

async function testNonExistentOrg() {
  console.log("\n--- Test: Non-existent org returns zero rows ---");
  const jwt = await signJwt(`${TEST_PREFIX}org_nonexistent`);
  const client = createAuthenticatedClient(jwt);

  const { data, error } = await client
    .from("sources")
    .select("id")
    .like("id", `${TEST_PREFIX}%`);

  if (error) {
    fail("Non-existent org query", error.message);
    return;
  }

  if ((data ?? []).length === 0) {
    pass("Non-existent org", "zero rows returned (correct)");
  } else {
    fail("Non-existent org", `expected 0 rows, got ${(data ?? []).length}`);
  }
}

async function testEmptyOrgId() {
  console.log("\n--- Test: Empty org_id returns zero rows ---");
  const jwt = await signJwt("");
  const client = createAuthenticatedClient(jwt);

  const { data, error } = await client
    .from("sources")
    .select("id")
    .like("id", `${TEST_PREFIX}%`);

  if (error) {
    // A 401 or permission error is also acceptable — RLS blocks access
    pass("Empty org_id", `rejected with: ${error.message}`);
    return;
  }

  if ((data ?? []).length === 0) {
    pass("Empty org_id", "zero rows returned (nullif handles empty string)");
  } else {
    fail("Empty org_id", `expected 0 rows, got ${(data ?? []).length}`);
  }
}

async function testWrongSecret() {
  console.log("\n--- Test: Wrong JWT secret gets 401 ---");
  const wrongSecret = new TextEncoder().encode("wrong-secret-key-12345678");
  const now = Math.floor(Date.now() / 1000);
  const badToken = await new SignJWT({
    sub: TEST_USER_ID,
    org_id: ORG_ALPHA_ID,
    role: "authenticated",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("supabase")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(wrongSecret);

  const client = createClient(SUPABASE_URL, SUPABASE_JWT_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${badToken}`,
        apikey: SUPABASE_JWT_SECRET,
      },
    },
  });

  const { error, status } = await client.from("sources").select("id").limit(1);

  if (error && (status === 401 || status === 403)) {
    pass("Wrong secret rejected", `HTTP ${status}`);
  } else if (error) {
    pass("Wrong secret rejected", `error: ${error.message}`);
  } else {
    fail("Wrong secret", "query succeeded — JWT verification not enforced!");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== JWT Bridge + RLS Isolation Verification ===");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`JWT Secret: [REDACTED ${SUPABASE_JWT_SECRET.length} chars]`);
  console.log(`Service Key: [REDACTED ${SUPABASE_SERVICE_ROLE_KEY.length} chars]`);

  const setupOk = await setup();
  if (!setupOk) {
    console.error("\n[FAIL] Setup failed — cannot proceed with tests");
    await teardown();
    process.exit(1);
  }

  try {
    await testJwtSigning();
    await testOrgAlphaIsolation();
    await testOrgBetaIsolation();
    await testNonExistentOrg();
    await testEmptyOrgId();
    await testWrongSecret();
  } finally {
    console.log("\n--- Cleanup ---");
    await teardown();
  }

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log("All assertions passed. JWT bridge + RLS isolation verified.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
