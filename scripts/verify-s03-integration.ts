/**
 * End-to-end verification: S03 Supabase Contact Write → Read round-trip
 *
 * Proves that:
 *   1. A service-role client can write a contact to PostgreSQL (bypassing RLS)
 *   2. An authenticated client (JWT with org_id) can read it back (RLS)
 *   3. Upsert is idempotent (writing same contact twice yields 1 row)
 *   4. Missing required fields trigger PostgreSQL constraint errors
 *   5. Wrong-org JWT cannot see other org's contacts (RLS isolation)
 *
 * Usage: npx tsx scripts/verify-s03-integration.ts
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

// Test identifiers — prefixed for reliable cleanup
const TEST_PREFIX = "__s03_test__";
const TEST_USER_ID = `${TEST_PREFIX}user_001`;
const TEST_ORG_ID = `${TEST_PREFIX}org_main`;
const TEST_OTHER_ORG_ID = `${TEST_PREFIX}org_other`;
const TEST_CONTACT_ID = `${TEST_PREFIX}contact_001`;
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

async function signJwt(orgId: string, sub?: string): Promise<string> {
  const secret = new TextEncoder().encode(SUPABASE_JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: sub ?? TEST_USER_ID,
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
// Service-role client for setup/teardown/writes
// ---------------------------------------------------------------------------

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Setup: insert test user + orgs (FK targets for contacts)
// ---------------------------------------------------------------------------

async function setup(): Promise<boolean> {
  console.log("\n--- Setup: inserting test data ---");

  // Clean up any leftover data from a prior failed run
  await teardown(true);

  // 1. Test user (required as FK target for contacts.created_by)
  const { error: userErr } = await serviceClient.from("users").insert({
    id: TEST_USER_ID,
    name: "S03 Integration Test User",
    email: `${TEST_PREFIX}@test.local`,
    role: "user",
    created_at: NOW_MS,
    updated_at: NOW_MS,
  });
  if (userErr) {
    fail("Insert test user", userErr.message);
    return false;
  }

  // 2. Two organizations (main + other for RLS isolation test)
  for (const [orgId, name, slug] of [
    [TEST_ORG_ID, "S03 Main Org", `${TEST_PREFIX}main`],
    [TEST_OTHER_ORG_ID, "S03 Other Org", `${TEST_PREFIX}other`],
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

  pass("Test data inserted", "1 user, 2 orgs");
  return true;
}

// ---------------------------------------------------------------------------
// Teardown: remove all test data (reverse FK order)
// ---------------------------------------------------------------------------

async function teardown(silent = false) {
  // Delete in FK-safe order: contacts → organizations → users
  await serviceClient
    .from("contacts")
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
// Test: Write contact via service-role client
// ---------------------------------------------------------------------------

async function testWriteContact(): Promise<boolean> {
  console.log("\n--- Test: Write contact via service-role client ---");

  const row = {
    id: TEST_CONTACT_ID,
    organization_id: TEST_ORG_ID,
    first_name: "Jan",
    last_name: "Testowy",
    email: `${TEST_PREFIX}jan@test.local`,
    phone: "+48123456789",
    title: "Test Contact",
    notes: "Created by S03 integration test",
    tags: ["test", "s03"],
    created_by: TEST_USER_ID,
    created_at: NOW_MS,
    updated_at: NOW_MS,
  };

  const { data, error } = await serviceClient
    .from("contacts")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    fail("Write contact", error.message);
    return false;
  }

  if (data && data.id === TEST_CONTACT_ID) {
    pass("Write contact", `id=${data.id}`);
    return true;
  } else {
    fail("Write contact", "unexpected response shape");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Test: Read contact back via authenticated client (RLS)
// ---------------------------------------------------------------------------

async function testReadContactWithRLS() {
  console.log("\n--- Test: Read contact back via JWT-authenticated client ---");

  const jwt = await signJwt(TEST_ORG_ID);
  const client = createAuthenticatedClient(jwt);

  const { data, error } = await client
    .from("contacts")
    .select("id, organization_id, first_name, last_name, email")
    .eq("id", TEST_CONTACT_ID);

  if (error) {
    fail("Read contact (RLS)", error.message);
    return;
  }

  const rows = data ?? [];
  if (rows.length !== 1) {
    fail("Read contact (RLS)", `expected 1 row, got ${rows.length}`);
    return;
  }

  const contact = rows[0];
  if (contact.id !== TEST_CONTACT_ID) {
    fail("Read contact ID", `expected ${TEST_CONTACT_ID}, got ${contact.id}`);
    return;
  }
  pass("Read contact ID", `id=${contact.id}`);

  if (contact.first_name === "Jan" && contact.last_name === "Testowy") {
    pass("Read contact fields", "first_name + last_name match");
  } else {
    fail(
      "Read contact fields",
      `got first_name=${contact.first_name} last_name=${contact.last_name}`,
    );
  }

  if (contact.organization_id === TEST_ORG_ID) {
    pass("Read contact org", "organization_id matches");
  } else {
    fail("Read contact org", `expected ${TEST_ORG_ID}, got ${contact.organization_id}`);
  }
}

// ---------------------------------------------------------------------------
// Test: Upsert idempotency — write same contact twice, count should be 1
// ---------------------------------------------------------------------------

async function testUpsertIdempotency() {
  console.log("\n--- Test: Upsert idempotency ---");

  // Write the same contact again with updated fields
  const row = {
    id: TEST_CONTACT_ID,
    organization_id: TEST_ORG_ID,
    first_name: "Jan",
    last_name: "Updated",
    email: `${TEST_PREFIX}jan@test.local`,
    created_by: TEST_USER_ID,
    created_at: NOW_MS,
    updated_at: Date.now(),
  };

  const { error: writeErr } = await serviceClient
    .from("contacts")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (writeErr) {
    fail("Upsert second write", writeErr.message);
    return;
  }

  // Count contacts with our test prefix
  const { data, error: countErr } = await serviceClient
    .from("contacts")
    .select("id")
    .like("id", `${TEST_PREFIX}%`);

  if (countErr) {
    fail("Upsert count", countErr.message);
    return;
  }

  const count = (data ?? []).length;
  if (count === 1) {
    pass("Upsert idempotency", "count=1 after two writes with same id");
  } else {
    fail("Upsert idempotency", `expected count=1, got ${count}`);
  }

  // Verify the update took effect
  const { data: updated } = await serviceClient
    .from("contacts")
    .select("last_name")
    .eq("id", TEST_CONTACT_ID)
    .single();

  if (updated?.last_name === "Updated") {
    pass("Upsert update", "last_name updated to 'Updated'");
  } else {
    fail("Upsert update", `last_name is '${updated?.last_name}', expected 'Updated'`);
  }
}

// ---------------------------------------------------------------------------
// Test: Missing required field — should get constraint error
// ---------------------------------------------------------------------------

async function testMissingRequiredField() {
  console.log("\n--- Test: Missing required field (first_name) ---");

  const badRow = {
    id: `${TEST_PREFIX}contact_bad`,
    organization_id: TEST_ORG_ID,
    // first_name intentionally omitted
    created_by: TEST_USER_ID,
    created_at: NOW_MS,
    updated_at: NOW_MS,
  };

  const { error } = await serviceClient
    .from("contacts")
    .insert(badRow as Record<string, unknown>);

  if (error) {
    pass("Missing required field", `rejected: ${error.message}`);
  } else {
    fail("Missing required field", "insert succeeded — should have failed");
    // Clean up the accidentally inserted row
    await serviceClient.from("contacts").delete().eq("id", `${TEST_PREFIX}contact_bad`);
  }
}

// ---------------------------------------------------------------------------
// Test: Wrong org JWT cannot see contacts (RLS isolation)
// ---------------------------------------------------------------------------

async function testWrongOrgIsolation() {
  console.log("\n--- Test: Wrong org JWT sees zero contacts ---");

  const jwt = await signJwt(TEST_OTHER_ORG_ID);
  const client = createAuthenticatedClient(jwt);

  const { data, error } = await client
    .from("contacts")
    .select("id")
    .eq("id", TEST_CONTACT_ID);

  if (error) {
    // Permission error is also acceptable — RLS blocks access
    pass("Wrong org isolation", `rejected: ${error.message}`);
    return;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    pass("Wrong org isolation", "zero rows returned (RLS blocks)");
  } else {
    fail(
      "Wrong org isolation",
      `expected 0 rows, got ${rows.length} — RLS leaking!`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== S03 Integration Verification: Contact Write→Read ===");
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
    const writeOk = await testWriteContact();
    if (!writeOk) {
      console.error("[FAIL] Write failed — skipping read tests");
      return;
    }

    await testReadContactWithRLS();
    await testUpsertIdempotency();
    await testMissingRequiredField();
    await testWrongOrgIsolation();
  } finally {
    console.log("\n--- Cleanup ---");
    await teardown();
  }

  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    console.log(
      "All assertions passed. S03 write→read integration verified.",
    );
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
