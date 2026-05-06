#!/usr/bin/env node
/**
 * gen-db-types.mjs
 *
 * Parses supabase/migrations/00001_initial_schema.sql and generates
 * src/lib/supabase/database.types.ts with Row/Insert/Update for every table.
 *
 * SQL column → TypeScript mapping rules:
 *   TEXT                → string
 *   TEXT[]              → string[]
 *   INTEGER             → number
 *   BIGINT              → number   (Convex stores ms-epoch as number)
 *   NUMERIC             → number
 *   BOOLEAN             → boolean
 *   JSONB               → unknown  (caller casts as needed)
 *   TSVECTOR            → (skipped — generated column)
 *   <enum_name>         → string   (union of literal values would be ideal but
 *                                    the enum definitions are complex; string is
 *                                    safe and matches Supabase codegen behavior)
 *
 * NOT NULL without DEFAULT → required in Insert, optional (?) in Update
 * NULL-able              → `| null`, optional in Insert & Update
 * DEFAULT / GENERATED    → optional in Insert
 * PRIMARY KEY (id)       → optional in Insert (may be auto-generated)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const sql = readFileSync(
  resolve(ROOT, "supabase/migrations/00001_initial_schema.sql"),
  "utf-8",
);

// ─── Collect ENUM types ───────────────────────────────────────────────────────
/** @type {Map<string, string[]>} */
const enums = new Map();
const enumRe =
  /CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(\s*([\s\S]*?)\);/gi;
for (const m of sql.matchAll(enumRe)) {
  const name = m[1];
  const values = [...m[2].matchAll(/'([^']+)'/g)].map((v) => v[1]);
  enums.set(name, values);
}

// ─── Parse CREATE TABLE blocks ────────────────────────────────────────────────
/**
 * @typedef {{ name: string, tsType: string, nullable: boolean, hasDefault: boolean, isPk: boolean, isGenerated: boolean }} Col
 * @typedef {{ tableName: string, columns: Col[] }} Table
 */

/** @type {Table[]} */
const tables = [];

const tableRe =
  /CREATE\s+TABLE\s+(\w+)\s*\(\s*([\s\S]*?)\n\);/gi;

for (const m of sql.matchAll(tableRe)) {
  const tableName = m[1];
  const body = m[2];

  /** @type {Col[]} */
  const columns = [];
  // Split lines, filter out constraints / indexes
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/--.*$/, "").trim();
    if (!line || line.startsWith("--")) continue;

    // Skip table-level constraints
    if (/^(CONSTRAINT|CHECK|UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|EXCLUDE)\b/i.test(line)) continue;

    // Column definition pattern: name type ...
    const colMatch = line.match(
      /^"?(\w+)"?\s+([\w\s\[\]()]+?)(\s+(?:NOT\s+NULL|NULL|DEFAULT|PRIMARY\s+KEY|REFERENCES|CHECK|UNIQUE|GENERATED).*)?,?\s*$/i,
    );
    if (!colMatch) continue;

    const colName = colMatch[1];
    let rawType = colMatch[2].trim().toUpperCase();
    const rest = (colMatch[3] || "").toUpperCase();

    // Skip GENERATED ALWAYS (tsvector search vectors)
    if (rest.includes("GENERATED ALWAYS")) continue;

    const isPk = rest.includes("PRIMARY KEY");
    const nullable = isPk ? false : !rest.includes("NOT NULL");
    const hasDefault = rest.includes("DEFAULT") || rest.includes("GENERATED");

    // Map SQL type → TS type
    let tsType = "string";
    if (rawType.startsWith("TEXT[]")) {
      tsType = "string[]";
    } else if (rawType === "TEXT" || rawType === "TEXT NOT NULL") {
      tsType = "string";
    } else if (rawType === "INTEGER" || rawType === "INT") {
      tsType = "number";
    } else if (rawType === "BIGINT") {
      tsType = "number";
    } else if (rawType === "NUMERIC" || rawType.startsWith("NUMERIC(")) {
      tsType = "number";
    } else if (rawType === "BOOLEAN") {
      tsType = "boolean";
    } else if (rawType === "JSONB") {
      tsType = "unknown";
    } else if (rawType === "TSVECTOR") {
      // skip entirely
      continue;
    } else {
      // Check for known enum types (lowercase)
      const lowerType = rawType.toLowerCase();
      if (enums.has(lowerType)) {
        tsType = "string"; // Could be union; string is safe
      } else {
        tsType = "string"; // fallback
      }
    }

    columns.push({ name: colName, tsType, nullable, hasDefault, isPk, isGenerated: false });
  }

  if (columns.length > 0) {
    tables.push({ tableName, columns });
  }
}

// ─── Emit TypeScript ──────────────────────────────────────────────────────────

const lines = [];
lines.push(`/**`);
lines.push(` * Supabase Database Types`);
lines.push(` *`);
lines.push(` * AUTO-GENERATED from supabase/migrations/00001_initial_schema.sql`);
lines.push(` * by scripts/gen-db-types.mjs — DO NOT EDIT MANUALLY.`);
lines.push(` *`);
lines.push(` * Re-generate: npx tsx scripts/gen-db-types.mjs`);
lines.push(` *   (or: node scripts/gen-db-types.mjs)`);
lines.push(` *`);
lines.push(` * Follows the standard Supabase Database type envelope:`);
lines.push(` *   Database → public → Tables → <table> → Row / Insert / Update`);
lines.push(` */`);
lines.push(``);
lines.push(`export interface Database {`);
lines.push(`  public: {`);
lines.push(`    Tables: {`);

for (const table of tables) {
  lines.push(`      ${table.tableName}: {`);

  // ── Row ──
  lines.push(`        Row: {`);
  for (const col of table.columns) {
    const nullSuffix = col.nullable ? " | null" : "";
    lines.push(`          ${col.name}: ${col.tsType}${nullSuffix};`);
  }
  lines.push(`        };`);

  // ── Insert ──
  lines.push(`        Insert: {`);
  for (const col of table.columns) {
    const optional = col.isPk || col.nullable || col.hasDefault ? "?" : "";
    const nullSuffix = col.nullable ? " | null" : "";
    lines.push(`          ${col.name}${optional}: ${col.tsType}${nullSuffix};`);
  }
  lines.push(`        };`);

  // ── Update ──
  lines.push(`        Update: {`);
  for (const col of table.columns) {
    const nullSuffix = col.nullable ? " | null" : "";
    lines.push(`          ${col.name}?: ${col.tsType}${nullSuffix};`);
  }
  lines.push(`        };`);

  lines.push(`      };`);
}

lines.push(`    };`);
lines.push(`    Views: Record<string, never>;`);
lines.push(`    Functions: Record<string, never>;`);
lines.push(`    Enums: Record<string, never>;`);
lines.push(`    CompositeTypes: Record<string, never>;`);
lines.push(`  };`);
lines.push(`}`);
lines.push(``);

// ── Convenience aliases (preserve backward compat) ──
lines.push(`/** Convenience alias for a contacts row */`);
lines.push(`export type Contact = Database["public"]["Tables"]["contacts"]["Row"];`);
lines.push(`export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];`);
lines.push(`export type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];`);
lines.push(``);

// ── Additional S01 entity aliases ──
const entityAliases = [
  { table: "companies", singular: "Company" },
  { table: "products", singular: "Product" },
  { table: "notes", singular: "Note" },
  { table: "activities", singular: "Activity" },
  { table: "calls", singular: "Call" },
  { table: "documents", singular: "Document" },
  { table: "sources", singular: "Source" },
  { table: "saved_views", singular: "SavedView" },
  { table: "lost_reasons", singular: "LostReason" },
  { table: "custom_field_definitions", singular: "CustomFieldDefinition" },
  { table: "custom_field_values", singular: "CustomFieldValue" },
  { table: "object_relationships", singular: "ObjectRelationship" },
];

for (const { table, singular } of entityAliases) {
  lines.push(`export type ${singular}Row = Database["public"]["Tables"]["${table}"]["Row"];`);
  lines.push(`export type ${singular}Insert = Database["public"]["Tables"]["${table}"]["Insert"];`);
  lines.push(`export type ${singular}Update = Database["public"]["Tables"]["${table}"]["Update"];`);
}

const out = lines.join("\n") + "\n";
const outPath = resolve(ROOT, "src/lib/supabase/database.types.ts");
writeFileSync(outPath, out, "utf-8");

console.log(`✅ Generated ${outPath}`);
console.log(`   Tables: ${tables.length}`);
console.log(`   Row types: ${tables.length} (one per table)`);

// ─── Generate runtime column registry ───────────────────────────────────────
//
// Emitted as a separate sibling file so manual additions to database.types.ts
// (incremental migrations, hand-curated aliases) survive regeneration.
// Used by scripts that build rows dynamically — they can verify produced
// keys against the actual schema instead of trusting a string transformation
// like camelCase → snake_case.
const colsLines = [];
colsLines.push(`/**`);
colsLines.push(` * Supabase Runtime Column Registry`);
colsLines.push(` *`);
colsLines.push(` * AUTO-GENERATED from supabase/migrations/00001_initial_schema.sql`);
colsLines.push(` * by scripts/gen-db-types.mjs — DO NOT EDIT MANUALLY.`);
colsLines.push(` *`);
colsLines.push(` * Re-generate: npx tsx scripts/gen-db-types.mjs`);
colsLines.push(` */`);
colsLines.push(``);
colsLines.push(`/** Set of table names known to the generated schema. */`);
colsLines.push(`export type TableName =`);
const tableNames = tables.map((t) => `  | "${t.tableName}"`);
colsLines.push(tableNames.join("\n") + ";");
colsLines.push(``);
colsLines.push(`/**`);
colsLines.push(` * Column names per table, as a runtime-checkable Set.`);
colsLines.push(` * Generated columns (e.g. tsvector search_vector) are excluded.`);
colsLines.push(` */`);
colsLines.push(`export const TABLE_COLUMNS: Readonly<Record<TableName, ReadonlySet<string>>> = {`);
for (const table of tables) {
  const cols = table.columns.map((c) => `"${c.name}"`).join(", ");
  colsLines.push(`  ${table.tableName}: new Set([${cols}]),`);
}
colsLines.push(`};`);

const colsOut = colsLines.join("\n") + "\n";
const colsPath = resolve(ROOT, "src/lib/supabase/database.columns.ts");
writeFileSync(colsPath, colsOut, "utf-8");

console.log(`✅ Generated ${colsPath}`);
console.log(`   Tables: ${tables.length}`);
