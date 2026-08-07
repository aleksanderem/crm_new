#!/usr/bin/env node
/**
 * gen-db-types.mjs
 *
 * Parses every SQL file in supabase/migrations/ (in lexicographic order)
 * and generates src/lib/supabase/database.types.ts with Row/Insert/Update
 * for every table, plus src/lib/supabase/database.columns.ts with a
 * runtime column registry.
 *
 * Migrations are applied incrementally: 00001 typically defines the initial
 * schema with CREATE TABLE; subsequent files may CREATE TABLE [IF NOT EXISTS]
 * for new tables, ALTER TABLE ... ADD COLUMN for new columns, and so on.
 *
 * Supported DDL:
 *   • CREATE TYPE ... AS ENUM (...)
 *   • CREATE TABLE [IF NOT EXISTS] <name> ( ... )
 *   • ALTER TABLE [IF EXISTS] <name> ADD COLUMN [IF NOT EXISTS] <col> <type> ...
 *   • ALTER TABLE [IF EXISTS] <name> ALTER COLUMN <col> DROP NOT NULL
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

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");
const migrationFiles = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

// ─── ENUM types, tables, and views accumulate across all migrations ──────────
/** @type {Map<string, string[]>} */
const enums = new Map();

/**
 * @typedef {{ name: string, tsType: string, nullable: boolean, hasDefault: boolean, isPk: boolean, isGenerated: boolean, fk?: { referencedTable: string, referencedColumn: string } }} Col
 * @typedef {{ foreignKeyName: string, columns: string[], isOneToOne: boolean, referencedRelation: string, referencedColumns: string[] }} Relationship
 * @typedef {{ tableName: string, columns: Col[], relationships: Relationship[] }} Table
 * @typedef {{ viewName: string, columns: Array<{ name: string, tsType: string, nullable: boolean }> }} View
 */

/** Tables keyed by name to allow incremental updates from ALTER TABLE. */
/** @type {Map<string, Table>} */
const tables = new Map();

/** Views keyed by name. Read-only: only a Row type is emitted. */
/** @type {Map<string, View>} */
const views = new Map();

/**
 * Functions in the `public` schema callable via PostgREST RPC, keyed by name.
 * Only `public.<name>` qualified definitions are collected — unqualified
 * helpers (e.g. RLS helpers that live in the default search_path) are not
 * intended to be invoked from the client and are skipped.
 *
 * @typedef {{ args: Array<{ name: string, tsType: string }>, returnsTs: string }} Fn
 * @type {Map<string, Fn>}
 */
const functions = new Map();

/**
 * Map a raw SQL type token (already upper-cased) to a TS type, or `null`
 * if the column should be skipped (e.g. tsvector generated column).
 *
 * @param {string} rawType
 * @returns {string | null}
 */
function mapSqlType(rawType) {
  if (rawType.startsWith("TEXT[]")) return "string[]";
  if (rawType === "TEXT" || rawType === "TEXT NOT NULL") return "string";
  if (rawType === "INTEGER" || rawType === "INT") return "number";
  if (rawType === "BIGINT") return "number";
  if (rawType === "NUMERIC" || rawType.startsWith("NUMERIC(")) return "number";
  if (rawType === "BOOLEAN") return "boolean";
  if (rawType === "JSONB") return "unknown";
  if (rawType === "TSVECTOR") return null;
  // Known enum (lowercase) → string is safe
  if (enums.has(rawType.toLowerCase())) return "string";
  return "string"; // fallback
}

/**
 * Parse a single column-definition line into a Col, or null if it should be
 * skipped (constraint line, generated column, unparseable, etc.).
 *
 * @param {string} rawLine
 * @returns {Col | null}
 */
function parseColumnLine(rawLine) {
  const line = rawLine.replace(/--.*$/, "").trim();
  if (!line) return null;
  // Skip table-level constraints
  if (/^(CONSTRAINT|CHECK|UNIQUE|PRIMARY\s+KEY|FOREIGN\s+KEY|EXCLUDE)\b/i.test(line)) return null;

  const colMatch = line.match(
    /^"?(\w+)"?\s+([\w\s\[\](,)]+?)(\s+(?:NOT\s+NULL|NULL|DEFAULT|PRIMARY\s+KEY|REFERENCES|CHECK|UNIQUE|GENERATED).*)?,?\s*$/i,
  );
  if (!colMatch) return null;

  const colName = colMatch[1];
  const rawType = colMatch[2].trim().toUpperCase();
  const restRaw = colMatch[3] || "";
  const rest = restRaw.toUpperCase();

  if (rest.includes("GENERATED ALWAYS")) return null;

  const tsType = mapSqlType(rawType);
  if (tsType === null) return null;

  const isPk = rest.includes("PRIMARY KEY");
  const nullable = isPk ? false : !rest.includes("NOT NULL");
  const hasDefault = rest.includes("DEFAULT") || rest.includes("GENERATED");

  // Extract inline REFERENCES clause (preserve original case for table/column names)
  let fk;
  const refMatch = restRaw.match(/REFERENCES\s+"?(\w+)"?\s*\(\s*"?(\w+)"?\s*\)/i);
  if (refMatch) fk = { referencedTable: refMatch[1], referencedColumn: refMatch[2] };

  return { name: colName, tsType, nullable, hasDefault, isPk, isGenerated: false, fk };
}

/**
 * Map a SQL return type token to a TS type, with `void` → `undefined`.
 * Returns `null` to skip emission (e.g. SETOF / TABLE / unsupported shapes).
 *
 * @param {string} rawType
 * @returns {string | null}
 */
function mapReturnType(rawType) {
  const t = rawType.trim().toUpperCase();
  if (t === "VOID") return "undefined";
  return mapSqlType(t);
}

/**
 * Parse a function argument list (text between the outer parens of
 * `CREATE FUNCTION ... ( ... )`). Returns an empty array for `()`.
 * Each argument is `[mode] name type [DEFAULT ...]`.
 *
 * @param {string} argsBlob
 * @returns {Array<{ name: string, tsType: string }>}
 */
function parseFunctionArgs(argsBlob) {
  const trimmed = argsBlob.trim();
  if (!trimmed) return [];
  const args = [];
  for (const rawArg of trimmed.split(",")) {
    const piece = rawArg.trim();
    if (!piece) continue;
    const m = piece.match(/^(?:(?:IN|OUT|INOUT|VARIADIC)\s+)?"?(\w+)"?\s+(.+?)(?:\s+DEFAULT\b.*)?$/i);
    if (!m) continue;
    const tsType = mapSqlType(m[2].trim().toUpperCase());
    if (tsType === null) continue;
    args.push({ name: m[1], tsType });
  }
  return args;
}

/**
 * Split a SELECT column list at top-level commas (ignoring commas inside
 * parentheses) and return trimmed, non-empty items.
 *
 * @param {string} body
 * @returns {string[]}
 */
function splitSelectItems(body) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") { depth++; continue; }
    if (body[i] === ")") { depth--; continue; }
    if (body[i] === "," && depth === 0) {
      items.push(body.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = body.slice(start).trim();
  if (last) items.push(last);
  return items.filter(Boolean);
}

/**
 * Resolve the TypeScript type for a single SELECT item from a view definition.
 * Handles:
 *   - Simple column references (`col` or `table.col`) — looked up from tables
 *   - Computed expressions with aliases (`(expr) AS alias`) — inferred from expr
 *
 * @param {string} item - raw SELECT item text
 * @returns {{ name: string, tsType: string, nullable: boolean } | null}
 */
function parseViewItem(item) {
  // Strip trailing semicolons / whitespace
  const raw = item.replace(/;+\s*$/, "").trim();

  // Check for AS alias
  const asMatch = raw.match(/\bAS\s+"?(\w+)"?\s*$/i);
  if (asMatch) {
    const alias = asMatch[1];
    const exprPart = raw.slice(0, raw.length - asMatch[0].length).trim();
    // Boolean if the expression contains null checks or boolean logic
    if (/\bIS\s+(?:NOT\s+)?NULL\b|\bAND\b|\bOR\b/i.test(exprPart)) {
      return { name: alias, tsType: "boolean", nullable: false };
    }
    // Explicit BOOLEAN cast
    if (/::BOOLEAN\b/i.test(exprPart)) {
      return { name: alias, tsType: "boolean", nullable: false };
    }
    // Numeric casts
    if (/::(?:INT(?:EGER)?|BIGINT|NUMERIC)\b/i.test(exprPart)) {
      return { name: alias, tsType: "number", nullable: true };
    }
    return { name: alias, tsType: "string", nullable: true };
  }

  // Simple column reference: `col` or `schema.col` or `table.col`
  const colMatch = raw.match(/"?(\w+)"?\s*$/);
  if (!colMatch) return null;
  const colName = colMatch[1];

  // Look up the type from known tables
  for (const table of tables.values()) {
    const col = table.columns.find((c) => c.name === colName);
    if (col) return { name: colName, tsType: col.tsType, nullable: col.nullable };
  }

  return { name: colName, tsType: "string", nullable: true };
}

/**
 * Apply a single migration's SQL to the running enum / table / view state.
 * @param {string} sql
 */
function applyMigration(sql) {
  // ─── ENUMs ──
  const enumRe = /CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(\s*([\s\S]*?)\);/gi;
  for (const m of sql.matchAll(enumRe)) {
    const name = m[1];
    const values = [...m[2].matchAll(/'([^']+)'/g)].map((v) => v[1]);
    enums.set(name, values);
  }

  // ─── CREATE TABLE [IF NOT EXISTS] <name> ( ... ); ──
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s*\(\s*([\s\S]*?)\n\s*\)\s*;/gi;
  for (const m of sql.matchAll(tableRe)) {
    const tableName = m[1];
    const body = m[2];

    /** @type {Col[]} */
    const columns = [];
    for (const rawLine of body.split("\n")) {
      const col = parseColumnLine(rawLine);
      if (col) columns.push(col);
    }
    if (columns.length === 0) continue;

    // IF NOT EXISTS semantics: keep the existing definition if already known.
    if (!tables.has(tableName)) {
      /** @type {Relationship[]} */
      const relationships = columns
        .filter((c) => c.fk)
        .map((c) => ({
          foreignKeyName: `${tableName}_${c.name}_fkey`,
          columns: [c.name],
          isOneToOne: false,
          referencedRelation: /** @type {NonNullable<typeof c.fk>} */ (c.fk).referencedTable,
          referencedColumns: [/** @type {NonNullable<typeof c.fk>} */ (c.fk).referencedColumn],
        }));
      tables.set(tableName, { tableName, columns, relationships });
    }
  }

  // ─── ALTER TABLE [IF EXISTS] <name> ADD COLUMN [IF NOT EXISTS] <col> ... ; ──
  // Each ALTER TABLE statement may carry multiple comma-separated actions; we
  // handle the ADD COLUMN ones and ignore others (constraints, RLS, etc.).
  const alterRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?\s+([\s\S]*?);/gi;
  for (const m of sql.matchAll(alterRe)) {
    const tableName = m[1];
    const actions = m[2];
    const table = tables.get(tableName);
    if (!table) continue;

    const addRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([\s\S]*?)(?=,\s*(?:ADD|ALTER|DROP|RENAME|ENABLE|DISABLE)\b|$)/gi;
    for (const a of actions.matchAll(addRe)) {
      const col = parseColumnLine(a[1].trim());
      if (col && !table.columns.some((c) => c.name === col.name)) {
        table.columns.push(col);
        if (col.fk) {
          table.relationships.push({
            foreignKeyName: `${tableName}_${col.name}_fkey`,
            columns: [col.name],
            isOneToOne: false,
            referencedRelation: col.fk.referencedTable,
            referencedColumns: [col.fk.referencedColumn],
          });
        }
      }
    }

    const dropNotNullRe = /ALTER\s+COLUMN\s+"?(\w+)"?\s+DROP\s+NOT\s+NULL/gi;
    for (const a of actions.matchAll(dropNotNullRe)) {
      const colName = a[1];
      const col = table.columns.find((c) => c.name === colName);
      if (col) col.nullable = true;
    }

    const alterTypeRe = /ALTER\s+COLUMN\s+"?(\w+)"?\s+TYPE\s+([\w\s\[\](,)]+?)(?:\s+USING\b.*?)?(?=,\s*(?:ADD|ALTER|DROP|RENAME|ENABLE|DISABLE)\b|$)/gi;
    for (const a of actions.matchAll(alterTypeRe)) {
      const colName = a[1];
      const rawType = a[2].trim().toUpperCase();
      const col = table.columns.find((c) => c.name === colName);
      if (col) {
        const newTsType = mapSqlType(rawType);
        if (newTsType !== null) col.tsType = newTsType;
      }
    }
  }

  // ─── ALTER TABLE <name> ADD CONSTRAINT <name> FOREIGN KEY (<cols>) REFERENCES <table>(<cols>) ──
  // Handles deferred FK additions where the referenced table didn't exist yet at CREATE TABLE time.
  const addFkRe =
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?(\w+)"?\s+ADD\s+CONSTRAINT\s+"?(\w+)"?\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+"?(\w+)"?\s*\(([^)]+)\)/gi;
  for (const m of sql.matchAll(addFkRe)) {
    const tableName = m[1];
    const constraintName = m[2];
    const fkCols = m[3].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    const refTable = m[4];
    const refCols = m[5].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
    const table = tables.get(tableName);
    if (!table) continue;
    // Avoid duplicates (idempotent re-runs)
    if (!table.relationships.some((r) => r.foreignKeyName === constraintName)) {
      table.relationships.push({
        foreignKeyName: constraintName,
        columns: fkCols,
        isOneToOne: false,
        referencedRelation: refTable,
        referencedColumns: refCols,
      });
    }
  }

  // ─── CREATE [OR REPLACE] FUNCTION public.<name>(<args>) RETURNS <type> ──
  // Only public-schema functions are exposed via PostgREST RPC; unqualified
  // helper functions (RLS helpers, triggers) are intentionally skipped.
  const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\."?(\w+)"?\s*\(([^)]*)\)\s+RETURNS\s+([A-Z]+(?:\[\])?)\b/gi;
  for (const m of sql.matchAll(fnRe)) {
    const name = m[1];
    const args = parseFunctionArgs(m[2]);
    const returnsTs = mapReturnType(m[3]);
    if (returnsTs === null) continue;
    functions.set(name, { args, returnsTs });
  }

  // ─── CREATE [OR REPLACE] VIEW <name> [WITH (...)] AS SELECT ... FROM ... ──
  // Captures the body between AS and the closing semicolon, then extracts the
  // SELECT column list (items between SELECT and the first top-level FROM).
  const viewRe =
    /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+"?(\w+)"?\s*(?:WITH\s*\([^)]*\)\s*)?AS\s+([\s\S]+?);/gi;
  for (const m of sql.matchAll(viewRe)) {
    const viewName = m[1];
    const body = m[2];

    // Locate SELECT and the first top-level FROM after it
    const selectIdx = body.search(/\bSELECT\b/i);
    if (selectIdx === -1) continue;

    let depth = 0;
    let fromIdx = -1;
    for (let i = selectIdx + "SELECT".length; i < body.length; i++) {
      if (body[i] === "(") { depth++; continue; }
      if (body[i] === ")") { depth--; continue; }
      if (depth === 0 && /^\bFROM\b/i.test(body.slice(i))) {
        fromIdx = i;
        break;
      }
    }
    if (fromIdx === -1) continue;

    const selectBody = body.slice(selectIdx + "SELECT".length, fromIdx).trim();
    const items = splitSelectItems(selectBody);
    const columns = items.map(parseViewItem).filter(/** @type {(x: any) => x is NonNullable<typeof x>} */ Boolean);

    if (columns.length === 0) continue;
    views.set(viewName, { viewName, columns });
  }
}

for (const file of migrationFiles) {
  const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
  applyMigration(sql);
}

const tablesList = [...tables.values()];

// ─── Emit TypeScript ──────────────────────────────────────────────────────────

const headerSource = migrationFiles.map((f) => ` *   • ${f}`).join("\n");

const lines = [];
lines.push(`/**`);
lines.push(` * Supabase Database Types`);
lines.push(` *`);
lines.push(` * AUTO-GENERATED from supabase/migrations/ by scripts/gen-db-types.mjs`);
lines.push(` * — DO NOT EDIT MANUALLY.`);
lines.push(` *`);
lines.push(` * Source migrations (applied in order):`);
lines.push(headerSource);
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

for (const table of tablesList) {
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

  // ── Relationships ──
  if (table.relationships.length === 0) {
    lines.push(`        Relationships: [];`);
  } else {
    lines.push(`        Relationships: [`);
    for (const rel of table.relationships) {
      lines.push(`          {`);
      lines.push(`            foreignKeyName: "${rel.foreignKeyName}";`);
      lines.push(`            columns: [${rel.columns.map((c) => `"${c}"`).join(", ")}];`);
      lines.push(`            isOneToOne: ${rel.isOneToOne};`);
      lines.push(`            referencedRelation: "${rel.referencedRelation}";`);
      lines.push(`            referencedColumns: [${rel.referencedColumns.map((c) => `"${c}"`).join(", ")}];`);
      lines.push(`          },`);
    }
    lines.push(`        ];`);
  }

  lines.push(`      };`);
}

lines.push(`    };`);
if (views.size === 0) {
  lines.push(`    Views: Record<string, never>;`);
} else {
  lines.push(`    Views: {`);
  for (const view of views.values()) {
    lines.push(`      ${view.viewName}: {`);
    lines.push(`        Row: {`);
    for (const col of view.columns) {
      const nullSuffix = col.nullable ? " | null" : "";
      lines.push(`          ${col.name}: ${col.tsType}${nullSuffix};`);
    }
    lines.push(`        };`);
    lines.push(`        Relationships: [];`);
    lines.push(`      };`);
  }
  lines.push(`    };`);
}
if (functions.size === 0) {
  lines.push(`    Functions: Record<string, never>;`);
} else {
  lines.push(`    Functions: {`);
  for (const [name, fn] of functions) {
    lines.push(`      ${name}: {`);
    if (fn.args.length === 0) {
      lines.push(`        Args: Record<string, never>;`);
    } else {
      lines.push(`        Args: {`);
      for (const arg of fn.args) {
        lines.push(`          ${arg.name}: ${arg.tsType};`);
      }
      lines.push(`        };`);
    }
    lines.push(`        Returns: ${fn.returnsTs};`);
    lines.push(`      };`);
  }
  lines.push(`    };`);
}
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

// ── Entity aliases ──
// Hand-curated singular names — generic singularization can't reliably handle
// "lost_reasons" → "LostReason", "saved_views" → "SavedView", etc.
const entityAliases = [
  // CRM
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
  { table: "leads", singular: "Lead" },
  { table: "pipelines", singular: "Pipeline" },
  { table: "pipeline_stages", singular: "PipelineStage" },
  { table: "pipeline_stage_actions", singular: "PipelineStageAction" },

  // Platform
  { table: "organizations", singular: "Organization" },
  { table: "team_memberships", singular: "TeamMembership" },
  { table: "invitations", singular: "Invitation" },
  { table: "notifications", singular: "Notification" },
  { table: "recently_viewed", singular: "RecentlyViewed" },
  { table: "org_settings", singular: "OrgSettings" },
  { table: "audit_log", singular: "AuditLog" },
  { table: "activity_type_definitions", singular: "ActivityTypeDefinition" },
  { table: "scheduled_activities", singular: "ScheduledActivity" },
  { table: "email_sequences", singular: "EmailSequence" },

  // Gabinet
  { table: "gabinet_patients", singular: "GabinetPatient" },
  { table: "gabinet_treatments", singular: "GabinetTreatment" },
  { table: "gabinet_treatment_variants", singular: "GabinetTreatmentVariant" },
  { table: "gabinet_employees", singular: "GabinetEmployee" },
  { table: "gabinet_locations", singular: "GabinetLocation" },
  { table: "gabinet_rooms", singular: "GabinetRoom" },
  { table: "gabinet_equipment", singular: "GabinetEquipment" },
  { table: "gabinet_equipment_transfers", singular: "GabinetEquipmentTransfer" },
  { table: "gabinet_leave_types", singular: "GabinetLeaveType" },
  { table: "gabinet_leave_balances", singular: "GabinetLeaveBalance" },
  { table: "gabinet_working_hours", singular: "GabinetWorkingHours" },
  { table: "gabinet_employee_schedules", singular: "GabinetEmployeeSchedule" },
  { table: "gabinet_appointments", singular: "GabinetAppointment" },
  { table: "gabinet_leaves", singular: "GabinetLeave" },
  { table: "gabinet_overtime", singular: "GabinetOvertime" },
  { table: "gabinet_document_templates", singular: "GabinetDocumentTemplate" },
  { table: "gabinet_documents", singular: "GabinetDocument" },
  { table: "gabinet_treatment_packages", singular: "GabinetTreatmentPackage" },
  { table: "gabinet_package_usage", singular: "GabinetPackageUsage" },
  { table: "gabinet_loyalty_points", singular: "GabinetLoyaltyPoints" },
  { table: "gabinet_loyalty_transactions", singular: "GabinetLoyaltyTransaction" },
  { table: "gabinet_loyalty_tiers", singular: "GabinetLoyaltyTier" },
  { table: "gabinet_receipts", singular: "GabinetReceipt" },
  { table: "gabinet_cash_transactions", singular: "GabinetCashTransaction" },
  { table: "gabinet_day_closes", singular: "GabinetDayClose" },
  { table: "gabinet_waitlist", singular: "GabinetWaitlist" },

  // CRM extras
  { table: "lead_stage_history", singular: "LeadStageHistory" },
];

for (const { table, singular } of entityAliases) {
  if (!tables.has(table)) continue; // Alias references a not-yet-migrated table.
  lines.push(`export type ${singular}Row = Database["public"]["Tables"]["${table}"]["Row"];`);
  lines.push(`export type ${singular}Insert = Database["public"]["Tables"]["${table}"]["Insert"];`);
  lines.push(`export type ${singular}Update = Database["public"]["Tables"]["${table}"]["Update"];`);
}

const out = lines.join("\n") + "\n";
const outPath = resolve(ROOT, "src/lib/supabase/database.types.ts");
writeFileSync(outPath, out, "utf-8");

console.log(`✅ Generated ${outPath}`);
console.log(`   Migrations: ${migrationFiles.length}`);
console.log(`   Tables: ${tablesList.length}`);
console.log(`   Views: ${views.size}`);
console.log(`   Row types: ${tablesList.length} (one per table)`);
console.log(`   Functions: ${functions.size}`);

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
colsLines.push(` * AUTO-GENERATED from supabase/migrations/ by scripts/gen-db-types.mjs`);
colsLines.push(` * — DO NOT EDIT MANUALLY.`);
colsLines.push(` *`);
colsLines.push(` * Source migrations (applied in order):`);
colsLines.push(headerSource);
colsLines.push(` *`);
colsLines.push(` * Re-generate: npx tsx scripts/gen-db-types.mjs`);
colsLines.push(` */`);
colsLines.push(``);
colsLines.push(`/** Set of table names known to the generated schema. */`);
colsLines.push(`export type TableName =`);
const tableNames = tablesList.map((t) => `  | "${t.tableName}"`);
colsLines.push(tableNames.join("\n") + ";");
colsLines.push(``);
colsLines.push(`/**`);
colsLines.push(` * Column names per table, as a runtime-checkable Set.`);
colsLines.push(` * Generated columns (e.g. tsvector search_vector) are excluded.`);
colsLines.push(` */`);
colsLines.push(`export const TABLE_COLUMNS: Readonly<Record<TableName, ReadonlySet<string>>> = {`);
for (const table of tablesList) {
  const cols = table.columns.map((c) => `"${c.name}"`).join(", ");
  colsLines.push(`  ${table.tableName}: new Set([${cols}]),`);
}
colsLines.push(`};`);

const colsOut = colsLines.join("\n") + "\n";
const colsPath = resolve(ROOT, "src/lib/supabase/database.columns.ts");
writeFileSync(colsPath, colsOut, "utf-8");

console.log(`✅ Generated ${colsPath}`);
console.log(`   Tables: ${tablesList.length}`);
