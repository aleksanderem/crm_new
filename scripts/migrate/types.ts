/**
 * Migration Framework Types
 *
 * Defines the configuration shape for migrating tables from Convex (JSONL export)
 * to PostgreSQL (Supabase).
 */

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

/**
 * Maps a single Convex field to a PostgreSQL column.
 *
 * - `source`: camelCase field name in the Convex JSONL (e.g. "firstName")
 * - `target`: snake_case column name in PostgreSQL (e.g. "first_name")
 * - `transform`: optional function to convert the value (e.g. array → JSONB,
 *   Convex ID string → TEXT, epoch float → BIGINT)
 */
export interface FieldMapping {
  source: string;
  target: string;
  transform?: (value: unknown, row: Record<string, unknown>) => unknown;
}

// ---------------------------------------------------------------------------
// Table migration config
// ---------------------------------------------------------------------------

/**
 * Declares how one Convex table maps to one PostgreSQL table.
 *
 * `sourceTable`   — Convex table name as it appears in the export ZIP
 *                   (directory name, e.g. "contacts")
 * `targetTable`   — PostgreSQL table name (e.g. "contacts")
 * `fields`        — ordered list of field mappings
 * `skipRow`       — optional predicate; return true to skip the row
 * `postTransform` — optional hook to mutate the mapped row before insert
 */
export interface TableMigrationConfig {
  sourceTable: string;
  targetTable: string;
  fields: FieldMapping[];
  /** Return true to skip this row during migration. */
  skipRow?: (row: Record<string, unknown>) => boolean;
  /** Mutate or enrich the mapped row just before insertion. */
  postTransform?: (
    mapped: Record<string, unknown>,
    raw: Record<string, unknown>,
  ) => Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dependency graph
// ---------------------------------------------------------------------------

/**
 * Declares the insertion order based on FK dependencies.
 *
 * Each entry is a target table name. Tables listed earlier are inserted first.
 * If table A has a FK to table B, B must appear before A in the array.
 */
export type InsertionOrder = string[];

// ---------------------------------------------------------------------------
// Migration results
// ---------------------------------------------------------------------------

/** Per-table migration statistics. */
export interface TableMigrationResult {
  sourceTable: string;
  targetTable: string;
  rowsRead: number;
  rowsInserted: number;
  rowsSkipped: number;
  errors: MigrationError[];
  durationMs: number;
}

/** A single row-level error. */
export interface MigrationError {
  rowIndex: number;
  convexId: string | null;
  message: string;
}

/** Full migration run summary. */
export interface MigrationResult {
  tables: TableMigrationResult[];
  totalRowsRead: number;
  totalRowsInserted: number;
  totalErrors: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Migration registry (populated by config.ts)
// ---------------------------------------------------------------------------

/** The full migration plan: ordered table configs. */
export interface MigrationPlan {
  insertionOrder: InsertionOrder;
  configs: Map<string, TableMigrationConfig>;
}
