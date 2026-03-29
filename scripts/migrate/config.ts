/**
 * Migration Config Registry
 *
 * Provides helpers for building per-table field mappings and the central
 * registry that T02 populates with concrete table configs.
 */

import type {
  FieldMapping,
  InsertionOrder,
  MigrationPlan,
  TableMigrationConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Field mapping helpers
// ---------------------------------------------------------------------------

/**
 * Create a simple 1:1 field mapping (camelCase → snake_case) with no
 * value transform.
 */
export function field(source: string, target: string): FieldMapping {
  return { source, target };
}

/**
 * Create a field mapping with a custom value transform.
 */
export function fieldWithTransform(
  source: string,
  target: string,
  transform: (value: unknown, row: Record<string, unknown>) => unknown,
): FieldMapping {
  return { source, target, transform };
}

/**
 * Standard mapping for Convex `_id` → PostgreSQL `id` (TEXT primary key).
 * Convex IDs are strings like "k17abc...", kept as-is.
 */
export function idField(): FieldMapping {
  return field("_id", "id");
}

/**
 * Standard mapping for Convex `_creationTime` → PostgreSQL `created_at`.
 * Convex stores creation time as a float (ms since epoch); we round to BIGINT.
 */
export function creationTimeField(
  target: string = "created_at",
): FieldMapping {
  return fieldWithTransform("_creationTime", target, (v) =>
    typeof v === "number" ? Math.round(v) : v,
  );
}

/**
 * Map a Convex ID reference field (e.g. `organizationId`) to a TEXT FK column.
 * The Convex export stores IDs as plain strings — no transform needed, but
 * this helper documents the intent.
 */
export function refField(source: string, target: string): FieldMapping {
  return field(source, target);
}

/**
 * Map a Convex array field to a PostgreSQL TEXT[] column.
 * Ensures `null` when the source is undefined/null.
 */
export function arrayField(source: string, target: string): FieldMapping {
  return fieldWithTransform(source, target, (v) =>
    Array.isArray(v) ? v : null,
  );
}

/**
 * Map a Convex object/any field to a PostgreSQL JSONB column.
 * Serialises non-null values to JSON; passes null through.
 */
export function jsonbField(source: string, target: string): FieldMapping {
  return fieldWithTransform(source, target, (v) =>
    v != null ? JSON.stringify(v) : null,
  );
}

/**
 * Map a Convex number timestamp to a PostgreSQL BIGINT.
 * Rounds to integer (Convex stores as float).
 */
export function timestampField(source: string, target: string): FieldMapping {
  return fieldWithTransform(source, target, (v) =>
    typeof v === "number" ? Math.round(v) : null,
  );
}

// ---------------------------------------------------------------------------
// Config registry
// ---------------------------------------------------------------------------

const configRegistry = new Map<string, TableMigrationConfig>();
let insertionOrderRegistry: InsertionOrder = [];

/**
 * Register a table migration config. Called by T02 for each table.
 */
export function registerTable(config: TableMigrationConfig): void {
  configRegistry.set(config.targetTable, config);
}

/**
 * Set the FK-dependency insertion order. Called once by T02.
 */
export function setInsertionOrder(order: InsertionOrder): void {
  insertionOrderRegistry = order;
}

/**
 * Build the full migration plan from registered configs.
 * Validates that every table in the insertion order has a config.
 */
export function buildMigrationPlan(): MigrationPlan {
  const missing = insertionOrderRegistry.filter(
    (t) => !configRegistry.has(t),
  );
  if (missing.length > 0) {
    throw new Error(
      `Migration plan invalid: missing configs for tables: ${missing.join(", ")}`,
    );
  }

  return {
    insertionOrder: insertionOrderRegistry,
    configs: new Map(configRegistry),
  };
}

/**
 * Reset the registry (useful for tests).
 */
export function resetRegistry(): void {
  configRegistry.clear();
  insertionOrderRegistry = [];
}
