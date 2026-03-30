/**
 * Generic Mapper Factory
 *
 * Provides utilities for converting between snake_case PostgreSQL rows
 * and camelCase frontend objects, plus a `createEntityMapper` factory
 * that reduces per-entity boilerplate to a simple field-mapping config.
 */

// ─── Case Conversion Utilities ────────────────────────────────────────────────

/** Convert a single snake_case key to camelCase. */
export function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Convert a single camelCase key to snake_case. */
export function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Convert all keys of an object from snake_case to camelCase.
 * Shallow — does not recurse into nested objects.
 */
export function snakeToCamel<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamelKey(key)] = value;
  }
  return result;
}

/**
 * Convert all keys of an object from camelCase to snake_case.
 * Shallow — does not recurse into nested objects.
 */
export function camelToSnake<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnakeKey(key)] = value;
  }
  return result;
}

// ─── Entity Mapper Factory ────────────────────────────────────────────────────

/**
 * Field mapping configuration for a single entity.
 *
 * Keys are snake_case (Supabase) → values are camelCase (frontend).
 * The `id` → `_id` mapping and `_source: "supabase"` marker are added
 * automatically unless `skipIdMapping` is true.
 *
 * Fields with null values in the row are converted to undefined in the
 * mapped object (matching Convex's optional-field semantics).
 */
export interface EntityMapperConfig {
  /**
   * Map of snake_case column → camelCase field.
   * Only include fields that need explicit mapping.
   * Fields not listed are auto-mapped via snakeToCamelKey.
   */
  fieldMap?: Record<string, string>;

  /**
   * Column names to exclude from the mapped output.
   * Useful for skipping server-only columns (e.g. search_vector).
   */
  exclude?: string[];

  /**
   * If true, skip the automatic `id → _id` mapping.
   * Default: false (id is mapped to _id).
   */
  skipIdMapping?: boolean;
}

export interface EntityMapper<TRow, TMapped> {
  /** Map a Supabase row (snake_case) → frontend object (camelCase). */
  mapFromSupabase: (row: TRow) => TMapped;
  /** Map a frontend write input (camelCase) → Supabase insert/update (snake_case). */
  mapToSupabase: (input: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Create a pair of mapping functions for an entity.
 *
 * ```ts
 * const companyMapper = createEntityMapper<CompanyRow, MappedCompany>({
 *   fieldMap: { id: "_id", organization_id: "organizationId" },
 *   exclude: ["search_vector"],
 * });
 * ```
 */
export function createEntityMapper<
  TRow extends Record<string, unknown>,
  TMapped,
>(config: EntityMapperConfig = {}): EntityMapper<TRow, TMapped> {
  const { fieldMap = {}, exclude = [], skipIdMapping = false } = config;

  // Build reverse map (camelCase → snake_case) for writes
  const reverseMap: Record<string, string> = {};
  for (const [snake, camel] of Object.entries(fieldMap)) {
    reverseMap[camel] = snake;
  }
  if (!skipIdMapping) {
    reverseMap["_id"] = "id";
  }

  const excludeSet = new Set(exclude);

  function mapFromSupabase(row: TRow): TMapped {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      if (excludeSet.has(key)) continue;

      // Determine the output key
      let outKey: string;
      if (!skipIdMapping && key === "id") {
        outKey = "_id";
      } else if (fieldMap[key]) {
        outKey = fieldMap[key];
      } else {
        outKey = snakeToCamelKey(key);
      }

      // Convert null → undefined (Convex optional-field semantics)
      result[outKey] = value === null ? undefined : value;
    }

    result._source = "supabase";
    return result as TMapped;
  }

  function mapToSupabase(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (key === "_source" || key === "_id") continue;

      const outKey = reverseMap[key] ?? camelToSnakeKey(key);
      // Convert undefined → null for Supabase writes
      result[outKey] = value === undefined ? null : value;
    }

    return result;
  }

  return { mapFromSupabase, mapToSupabase };
}
