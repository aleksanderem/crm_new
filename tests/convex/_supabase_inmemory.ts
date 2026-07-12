/**
 * In-memory mock for `@cvx/_helpers/supabaseDb` and `@cvx/supabase/client`.
 *
 * Many Convex actions (payments, gabinet/appointments, gabinet/patients,
 * documents, etc.) read/write through `createSupabaseDb()` instead of
 * `ctx.db`. Internal dual-write actions in `convex/supabase/*` use the
 * raw `createServiceRoleClient()` / `upsertWithFkRetry()` helpers. Both
 * throw "SUPABASE_URL not configured" under vitest.
 *
 * This module provides:
 *   - createInMemorySupabaseDb() — same API as createSupabaseDb()
 *   - createStubServiceRoleClient() — a tiny no-op stand-in for the raw client
 *   - stubUpsertWithFkRetry() — best-effort upsert that just echoes the id
 *   - resetInMemoryStore() — clears all tables (called in beforeEach)
 *
 * Wired up globally via `tests/convex/_setup.ts` (vitest setupFile).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, unknown> & { id?: string };

const inMemoryStore = new Map<string, Map<string, Row>>();

function getTable(name: string): Map<string, Row> {
  let t = inMemoryStore.get(name);
  if (!t) {
    t = new Map();
    inMemoryStore.set(name, t);
  }
  return t;
}

export function resetInMemoryStore() {
  inMemoryStore.clear();
}

function withConvexId<T extends Row>(row: T): T {
  if (!("_id" in row) && row.id !== undefined) {
    return { ...row, _id: row.id } as T;
  }
  return row;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mem_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function createInMemorySupabaseDb() {
  return {
    async get<T = Record<string, unknown>>(
      table: string,
      id: string,
    ): Promise<T | null> {
      const row = getTable(table).get(id);
      return row ? (withConvexId({ ...row }) as T) : null;
    },

    async getMany<T = Record<string, unknown>>(
      table: string,
      ids: string[],
    ): Promise<T[]> {
      if (ids.length === 0) return [];
      const t = getTable(table);
      const out: T[] = [];
      for (const id of ids) {
        const row = t.get(id);
        if (row) out.push(withConvexId({ ...row }) as T);
      }
      return out;
    },

    async insert(
      table: string,
      row: Record<string, unknown>,
    ): Promise<string> {
      const id = row._id
        ? String(row._id)
        : row.id
          ? String(row.id)
          : randomId();
      const stored: Row = { ...row, id };
      delete (stored as any)._id;
      getTable(table).set(id, stored);
      return id;
    },

    async patch(
      table: string,
      id: string,
      updates: Record<string, unknown>,
    ): Promise<void> {
      const t = getTable(table);
      const existing = t.get(id);
      if (!existing) {
        throw new Error(
          `supabaseDb(inmemory).patch(${table}, ${id}): row not found`,
        );
      }
      const next: Row = { ...existing, ...updates, id };
      delete (next as any)._id;
      t.set(id, next);
    },

    async delete(table: string, id: string): Promise<void> {
      getTable(table).delete(id);
    },

    query<T = Record<string, unknown>>(table: string) {
      return new InMemoryQueryBuilder<T>(table);
    },

    raw() {
      return createInMemoryRawClient();
    },
  };
}

// Snake → camel conversion used to bridge the raw client (which uses
// PostgREST-style snake_case identifiers) to the in-memory store (which
// keeps tables/rows in Convex camelCase). The merge action is the only
// caller of `db.raw()` so we only need this one direction.
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Raw-client stand-in supporting two patterns:
 *
 *   1. SELECT-first read (org-existence checks, CAS reads):
 *        client.from(t).select(cols).eq(field, val).maybeSingle()
 *        client.from(t).select(cols).eq(...).not(...) — awaited directly
 *
 *   2. Write-then-read (merge / CAS update):
 *        client.from(t).update({...}).eq(...).select("id")
 *        client.from(t).delete().eq(...).eq(...)        — awaited directly
 *
 * Returns `{ data, error }` matching PostgREST semantics. `data` contains
 * the matched rows (all fields, camelCase keys matching the in-memory store).
 */
function createInMemoryRawClient() {
  return {
    from(table: string) {
      return new InMemoryRawQuery(snakeToCamel(table));
    },
  };
}

class InMemoryRawQuery {
  private table: string;
  private mode: "select" | "update" | "delete" = "select";
  private updatePayload: Record<string, unknown> | null = null;
  private filters: Array<(row: Row) => boolean> = [];

  constructor(table: string) {
    this.table = table;
  }

  update(values: Record<string, unknown>) {
    this.mode = "update";
    const camelValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      camelValues[snakeToCamel(k)] = v;
    }
    this.updatePayload = camelValues;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  /** Builder step — records that columns should be projected (or switches to
   *  read-after-write for update/delete). Does NOT execute the query. */
  select(_cols?: string) {
    return this;
  }

  eq(field: string, value: unknown) {
    const camelField = snakeToCamel(field);
    this.filters.push((r) => r[camelField] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    const camelField = snakeToCamel(field);
    const set = new Set(values);
    this.filters.push((r) => set.has(r[camelField]));
    return this;
  }

  not(field: string, op: string, value: unknown) {
    const camelField = snakeToCamel(field);
    this.filters.push((r) => {
      if (op === "is") {
        return value === null ? r[camelField] != null : r[camelField] == null;
      }
      return r[camelField] !== value;
    });
    return this;
  }

  private _execute(): { data: Row[]; error: null | { message: string } } {
    const t = getTable(this.table);
    const matched: Row[] = [];
    for (const row of t.values()) {
      if (this.filters.every((f) => f(row))) {
        matched.push(row);
      }
    }
    if (this.mode === "update" && this.updatePayload) {
      for (const row of matched) {
        const id = String(row.id);
        const next: Row = { ...row, ...this.updatePayload, id };
        t.set(id, next);
      }
    } else if (this.mode === "delete") {
      for (const row of matched) {
        t.delete(String(row.id));
      }
    }
    return { data: matched.map((r) => ({ ...r })), error: null };
  }

  /** Makes the builder directly awaitable: `await client.from(t).delete().eq(...)` */
  then(
    onfulfilled?: (value: { data: Row[]; error: null | { message: string } }) => any,
    onrejected?: (reason: any) => any,
  ) {
    return Promise.resolve(this._execute()).then(onfulfilled, onrejected);
  }

  async maybeSingle<T = Row>(): Promise<{ data: T | null; error: null }> {
    const { data } = this._execute();
    return { data: (data.length > 0 ? data[0] : null) as T | null, error: null };
  }

  async single<T = Row>(): Promise<{ data: T | null; error: null | { message: string } }> {
    const { data } = this._execute();
    if (data.length === 0) return { data: null, error: { message: "No rows found" } };
    return { data: data[0] as T | null, error: null };
  }
}

class InMemoryQueryBuilder<T = Record<string, unknown>> {
  private table: string;
  private filters: Array<(row: Row) => boolean> = [];
  private orderBy: Array<{ field: string; ascending: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;

  constructor(table: string) {
    this.table = table;
  }

  eq(field: string, value: unknown) {
    this.filters.push((r) => r[field] === value);
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push((r) => r[field] !== value);
    return this;
  }

  ilike(field: string, pattern: string) {
    // Convert SQL LIKE pattern to a JS case-insensitive regex
    const regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    const re = new RegExp(`^${regexStr}$`, "i");
    this.filters.push((r) => typeof r[field] === "string" && re.test(r[field] as string));
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push((r) => (r[field] as any) > (value as any));
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push((r) => (r[field] as any) >= (value as any));
    return this;
  }

  lt(field: string, value: unknown) {
    this.filters.push((r) => (r[field] as any) < (value as any));
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push((r) => (r[field] as any) <= (value as any));
    return this;
  }

  or(filterStr: string) {
    // Parse PostgREST OR filter: "col.op.val,col.op.val,..."
    // Column names in the filter string are snake_case; convert to camelCase for in-memory lookup.
    const clauses = filterStr.split(",").map((cond) => {
      const first = cond.indexOf(".");
      const second = cond.indexOf(".", first + 1);
      return {
        field: snakeToCamel(cond.slice(0, first)),
        op: cond.slice(first + 1, second),
        rawValue: cond.slice(second + 1),
      };
    });
    this.filters.push((row) =>
      clauses.some(({ field, op, rawValue }) => {
        const col = row[field];
        switch (op) {
          case "eq":
            return col === rawValue || (typeof col === "number" && col === Number(rawValue));
          case "neq":
            return col !== rawValue && !(typeof col === "number" && col === Number(rawValue));
          case "ilike": {
            if (typeof col !== "string") return false;
            const regexStr = rawValue
              .replace(/[.+^${}()|[\]\\]/g, "\\$&")
              .replace(/%/g, ".*")
              .replace(/_/g, ".");
            return new RegExp(`^${regexStr}$`, "i").test(col);
          }
          case "is":
            if (rawValue === "null") return col == null;
            if (rawValue === "not.null") return col != null;
            return false;
          case "gt":
            return col != null && (col as any) > rawValue;
          case "gte":
            return col != null && (col as any) >= rawValue;
          case "lt":
            return col != null && (col as any) < rawValue;
          case "lte":
            return col != null && (col as any) <= rawValue;
          default:
            return false;
        }
      }),
    );
    return this;
  }

  in(field: string, values: unknown[]) {
    const set = new Set(values);
    this.filters.push((r) => set.has(r[field]));
    return this;
  }

  contains(field: string, value: Record<string, unknown> | unknown[]) {
    this.filters.push((row) => {
      const col = row[field];
      if (col === null || col === undefined) return false;
      if (Array.isArray(value)) {
        if (!Array.isArray(col)) return false;
        const colArr = col as unknown[];
        return value.every((v) => colArr.includes(v));
      }
      if (typeof col !== "object") return false;
      const colObj = col as Record<string, unknown>;
      return Object.entries(value).every(([k, v]) => colObj[k] === v);
    });
    return this;
  }

  order(field: string, ascending = true) {
    this.orderBy.push({ field, ascending });
    return this;
  }

  take(n: number) {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  offset(n: number) {
    this.rangeFrom = n;
    return this;
  }

  private materialize(): T[] {
    let rows = Array.from(getTable(this.table).values());
    for (const f of this.filters) rows = rows.filter(f);
    if (this.orderBy.length > 0) {
      const orderBy = this.orderBy;
      rows = rows.slice().sort((a, b) => {
        for (const { field, ascending } of orderBy) {
          const va = a[field] as any;
          const vb = b[field] as any;
          if (va === vb) continue;
          const dir = ascending ? 1 : -1;
          if (va == null) return 1;
          if (vb == null) return -1;
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
        }
        return 0;
      });
    }
    if (this.rangeFrom !== null) {
      const from = this.rangeFrom;
      const to =
        this.rangeTo !== null
          ? this.rangeTo
          : this.limitN !== null
            ? from + this.limitN - 1
            : rows.length - 1;
      rows = rows.slice(from, to + 1);
    } else if (this.limitN !== null) {
      rows = rows.slice(0, this.limitN);
    }
    return rows.map((r) => withConvexId({ ...r })) as T[];
  }

  async collect(): Promise<T[]> {
    return this.materialize();
  }

  async first(): Promise<T | null> {
    const rows = this.materialize();
    return rows.length > 0 ? rows[0] : null;
  }

  async unique(): Promise<T | null> {
    return this.first();
  }
}

/**
 * Stub for `createServiceRoleClient()` from `@cvx/supabase/client`.
 *
 * Used by internal dual-write actions in convex/supabase/*. These are
 * best-effort (errors are logged but never break the flow). The stub
 * returns a chainable query builder whose terminal calls resolve to
 * `{ data: null, error: null }` so the actions complete silently.
 */
export function createStubServiceRoleClient() {
  return {
    from(_table: string) {
      return new StubTableQuery();
    },
  };
}

class StubTableQuery {
  select(_cols?: string) {
    return this;
  }
  insert(_row: any) {
    return this;
  }
  upsert(_row: any, _opts?: any) {
    return this;
  }
  update(_row: any) {
    return this;
  }
  delete() {
    return this;
  }
  eq(_field: string, _value: unknown) {
    return this;
  }
  in(_field: string, _values: unknown[]) {
    return this;
  }
  order(_field: string, _opts?: any) {
    return this;
  }
  limit(_n: number) {
    return this;
  }
  async single() {
    return { data: null, error: null };
  }
  async maybeSingle() {
    return { data: null, error: null };
  }
  then(onfulfilled?: any, onrejected?: any) {
    return Promise.resolve({ data: [], error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

export async function stubUpsertWithFkRetry(
  _client: unknown,
  _table: string,
  row: Record<string, unknown>,
): Promise<{ id: string }> {
  return { id: row.id ? String(row.id) : randomId() };
}
