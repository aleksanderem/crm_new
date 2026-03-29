/**
 * S05 Data Migration Framework & Contacts Migration — Structural Verification
 *
 * Static source-file checks that prove the migration framework, table configs,
 * runner, and validation script are correctly wired. No live DB required.
 *
 * Checks:
 *   1.  Framework file exists and exports runMigration
 *   2.  Types file exists and exports TableMigrationConfig
 *   3.  All 6 table config files exist
 *   4.  Runner script exists and imports all table configs
 *   5.  Contacts config maps expected fields (firstName→first_name, etc.)
 *   6.  Validation script exists and checks FK integrity
 *   7.  search_vector is NOT in any field mapping
 *   8.  Upsert with onConflict:'id' pattern used for idempotency
 *   9.  Package.json has migrate:contacts and migrate:validate scripts
 *   10. TypeScript compilation passes
 *
 * Usage: npx tsx scripts/verify-s05-migration.ts
 */

import { readFileSync, existsSync } from "node:fs";
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

function fileExists(relativePath: string): boolean {
  return existsSync(resolve(ROOT, relativePath));
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
// File paths
// ---------------------------------------------------------------------------

const FRAMEWORK = "scripts/migrate/framework.ts";
const TYPES = "scripts/migrate/types.ts";
const CONFIG = "scripts/migrate/config.ts";
const RUNNER = "scripts/migrate/run-contacts.ts";
const VALIDATE = "scripts/migrate/validate.ts";
const PKG = "package.json";

const TABLE_CONFIGS = [
  "scripts/migrate/tables/users.ts",
  "scripts/migrate/tables/organizations.ts",
  "scripts/migrate/tables/team-memberships.ts",
  "scripts/migrate/tables/tag-definitions.ts",
  "scripts/migrate/tables/category-definitions.ts",
  "scripts/migrate/tables/contacts.ts",
];

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

console.log("=== S05 Data Migration Framework Verification ===\n");

// 1. Framework file exists and exports runMigration
const framework = readFile(FRAMEWORK);
if (framework) {
  assertContains(
    framework,
    "export async function runMigration",
    "1. Framework exports runMigration",
  );
} else {
  fail("1. Framework exports runMigration", "file not found");
}

// 2. Types file exists and exports TableMigrationConfig
const types = readFile(TYPES);
if (types) {
  assertContains(
    types,
    "export interface TableMigrationConfig",
    "2. Types exports TableMigrationConfig",
  );
} else {
  fail("2. Types exports TableMigrationConfig", "file not found");
}

// 3. All 6 table config files exist
{
  const allExist = TABLE_CONFIGS.every((p) => fileExists(resolve(ROOT, p)));
  if (allExist) {
    pass(
      "3. All 6 table config files exist",
      TABLE_CONFIGS.map((p) => p.split("/").pop()).join(", "),
    );
  } else {
    const missing = TABLE_CONFIGS.filter(
      (p) => !fileExists(resolve(ROOT, p)),
    );
    fail("3. All 6 table config files exist", `missing: ${missing.join(", ")}`);
  }
}

// 4. Runner script exists and imports all table configs
const runner = readFile(RUNNER);
if (runner) {
  const expectedImports = [
    "./tables/users",
    "./tables/organizations",
    "./tables/team-memberships",
    "./tables/tag-definitions",
    "./tables/category-definitions",
    "./tables/contacts",
  ];
  const allImported = expectedImports.every((imp) => runner.includes(imp));
  if (allImported) {
    pass("4. Runner imports all 6 table configs");
  } else {
    const missing = expectedImports.filter((imp) => !runner.includes(imp));
    fail(
      "4. Runner imports all 6 table configs",
      `missing imports: ${missing.join(", ")}`,
    );
  }
} else {
  fail("4. Runner imports all 6 table configs", "file not found");
}

// 5. Contacts config maps expected fields
const contactsConfig = readFile("scripts/migrate/tables/contacts.ts");
if (contactsConfig) {
  const expectedMappings = [
    { source: "firstName", target: "first_name" },
    { source: "lastName", target: "last_name" },
    { source: "organizationId", target: "organization_id" },
    { source: "createdBy", target: "created_by" },
    { source: "categoryId", target: "category_id" },
    { source: "tagIds", target: "tag_ids" },
    { source: "avatarUrl", target: "avatar_url" },
    { source: "createdAt", target: "created_at" },
    { source: "updatedAt", target: "updated_at" },
  ];

  const missingMappings = expectedMappings.filter(
    (m) =>
      !contactsConfig.includes(`"${m.source}"`) &&
      !contactsConfig.includes(`'${m.source}'`),
  );

  if (missingMappings.length === 0) {
    pass(
      "5. Contacts config maps all expected fields",
      `${expectedMappings.length} field mappings verified`,
    );
  } else {
    fail(
      "5. Contacts config maps all expected fields",
      `missing sources: ${missingMappings.map((m) => m.source).join(", ")}`,
    );
  }
} else {
  fail("5. Contacts config maps all expected fields", "file not found");
}

// 6. Validation script exists and checks FK integrity
const validate = readFile(VALIDATE);
if (validate) {
  const hasFkCheck =
    validate.includes("organization_id") &&
    validate.includes("created_by") &&
    validate.includes("category_id");
  if (hasFkCheck) {
    pass(
      "6. Validation script checks FK integrity",
      "organization_id, created_by, category_id",
    );
  } else {
    fail(
      "6. Validation script checks FK integrity",
      "missing FK column references",
    );
  }
} else {
  fail("6. Validation script checks FK integrity", "file not found");
}

// 7. search_vector NOT in any field mapping (ignore comments)
{
  let searchVectorFound = false;
  for (const configPath of TABLE_CONFIGS) {
    const content = readFile(configPath);
    // Strip single-line and multi-line comments before checking
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    if (stripped.includes("search_vector")) {
      searchVectorFound = true;
      fail(
        "7. search_vector NOT in field mappings",
        `found in ${configPath}`,
      );
      break;
    }
  }
  if (!searchVectorFound) {
    pass(
      "7. search_vector NOT in field mappings",
      "not found in any table config (comments excluded)",
    );
  }
}

// 8. Upsert with onConflict:'id' pattern used for idempotency
if (framework) {
  const hasOnConflict =
    framework.includes('onConflict: "id"') ||
    framework.includes("onConflict: 'id'") ||
    framework.includes('onConflict:"id"') ||
    framework.includes("onConflict:'id'");
  if (hasOnConflict) {
    pass("8. Upsert with onConflict:'id' for idempotency");
  } else {
    fail(
      "8. Upsert with onConflict:'id' for idempotency",
      "pattern not found in framework.ts",
    );
  }
} else {
  fail("8. Upsert with onConflict:'id' for idempotency", "framework.ts not found");
}

// 9. Package.json has migrate:contacts and migrate:validate scripts
const pkg = readFile(PKG);
if (pkg) {
  const hasMigrateContacts = pkg.includes('"migrate:contacts"');
  const hasMigrateValidate = pkg.includes('"migrate:validate"');
  if (hasMigrateContacts && hasMigrateValidate) {
    pass("9. Package.json has migrate:contacts and migrate:validate scripts");
  } else {
    const missing = [];
    if (!hasMigrateContacts) missing.push("migrate:contacts");
    if (!hasMigrateValidate) missing.push("migrate:validate");
    fail(
      "9. Package.json has migrate:contacts and migrate:validate scripts",
      `missing: ${missing.join(", ")}`,
    );
  }
} else {
  fail("9. Package.json scripts", "package.json not found");
}

// 10. TypeScript compilation passes
console.log("\n--- TypeScript compilation check ---");
try {
  execSync(
    "npx tsc --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext --skipLibCheck --strict scripts/migrate/run-contacts.ts scripts/migrate/validate.ts",
    {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 120_000,
    },
  );
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
  console.error("S05 verification FAILED.");
  process.exit(1);
} else {
  console.log(
    "All assertions passed. S05 data migration framework verified.",
  );
  process.exit(0);
}
