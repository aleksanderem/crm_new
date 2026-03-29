/**
 * S04 Contacts Vertical Migration — End-to-end Verification
 *
 * Static source-file checks that prove the full contacts migration is wired:
 *   1. Supabase actions exist (update, delete)
 *   2. Dual-write is wired via scheduler.runAfter
 *   3. Frontend reads switched to Supabase (no USE_SUPABASE_READS = false)
 *   4. Cache invalidation on list, detail, and create pages
 *   5. Detail page uses useSupabaseContact
 *   6. PostgreSQL full-text search support
 *   7. TypeScript compiles cleanly
 *
 * Usage: npx tsx scripts/verify-s04-contacts.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname ?? process.cwd(), "..");

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

function readFile(relativePath: string): string {
  const fullPath = resolve(ROOT, relativePath);
  try {
    return readFileSync(fullPath, "utf-8");
  } catch (err) {
    fail(`Read file: ${relativePath}`, (err as Error).message);
    return "";
  }
}

function assertContains(
  content: string,
  needle: string,
  label: string,
): boolean {
  if (content.includes(needle)) {
    pass(label, `contains "${needle}"`);
    return true;
  }
  fail(label, `missing "${needle}"`);
  return false;
}

function assertNotContains(
  content: string,
  needle: string,
  label: string,
): boolean {
  if (!content.includes(needle)) {
    pass(label, `does not contain "${needle}"`);
    return true;
  }
  fail(label, `unexpectedly contains "${needle}"`);
  return false;
}

// ---------------------------------------------------------------------------
// File paths under test
// ---------------------------------------------------------------------------

const SUPABASE_CONTACTS = "convex/supabase/contacts.ts";
const CONVEX_CONTACTS = "convex/contacts.ts";
const CONTACTS_LIST =
  "src/routes/_app/_auth/dashboard/_layout.contacts.index.tsx";
const CONTACTS_DETAIL =
  "src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx";
const CONTACTS_NEW =
  "src/routes/_app/_auth/dashboard/_layout.contacts.new.tsx";
const SUPABASE_HOOKS = "src/hooks/use-supabase-contacts.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log("=== S04 Contacts Vertical Migration Verification ===\n");

// 1. Supabase update action exists
const supabaseContacts = readFile(SUPABASE_CONTACTS);
assertContains(
  supabaseContacts,
  "updateContactInSupabase",
  "1. Supabase update action exists",
);

// 2. Supabase delete action exists
assertContains(
  supabaseContacts,
  "deleteContactFromSupabase",
  "2. Supabase delete action exists",
);

// 3. Dual-write wired via scheduler.runAfter
const convexContacts = readFile(CONVEX_CONTACTS);
assertContains(
  convexContacts,
  "scheduler.runAfter",
  "3. Dual-write wired (scheduler.runAfter)",
);

// 4. Frontend reads switched — USE_SUPABASE_READS = false must NOT be present
const contactsList = readFile(CONTACTS_LIST);
assertNotContains(
  contactsList,
  "USE_SUPABASE_READS = false",
  "4. Supabase reads enabled (no USE_SUPABASE_READS = false)",
);

// 5. Cache invalidation on contacts list page
assertContains(
  contactsList,
  "invalidateQueries",
  "5. Cache invalidation on list page",
);

// 6. Detail page reads from Supabase
const contactsDetail = readFile(CONTACTS_DETAIL);
assertContains(
  contactsDetail,
  "useSupabaseContact",
  "6. Detail page uses useSupabaseContact",
);

// 7. Cache invalidation on detail page
assertContains(
  contactsDetail,
  "invalidateQueries",
  "7. Cache invalidation on detail page",
);

// 8. PostgreSQL full-text search support
const supabaseHooks = readFile(SUPABASE_HOOKS);
const hasTextSearch =
  supabaseHooks.includes("textSearch") ||
  supabaseHooks.includes("search_vector");
if (hasTextSearch) {
  pass(
    "8. PostgreSQL search support",
    'contains "textSearch" or "search_vector"',
  );
} else {
  fail("8. PostgreSQL search support", 'missing "textSearch"/"search_vector"');
}

// 9. Cache invalidation on create page
const contactsNew = readFile(CONTACTS_NEW);
assertContains(
  contactsNew,
  "invalidateQueries",
  "9. Cache invalidation on create page",
);

// 10. TypeScript compilation
console.log("\n--- TypeScript compilation check ---");
try {
  execSync("npx tsc -p tsconfig.app.json --noEmit", {
    cwd: ROOT,
    stdio: "pipe",
    timeout: 120_000,
  });
  pass("10. TypeScript compilation", "tsc --noEmit exited 0");
} catch (err) {
  const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? "";
  fail(
    "10. TypeScript compilation",
    stderr.split("\n").slice(0, 10).join("\n"),
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);

if (failCount > 0) {
  console.error("S04 verification FAILED.");
  process.exit(1);
} else {
  console.log(
    "All assertions passed. S04 contacts vertical migration verified.",
  );
  process.exit(0);
}
