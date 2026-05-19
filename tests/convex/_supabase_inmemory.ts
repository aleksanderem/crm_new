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
      throw new Error(
        "supabaseDb(inmemory).raw(): raw client access is not available under vitest",
      );
    },
  };
}

class InMemoryQueryBuilder<T = Record<string, unknown>> {
  private table: string;
  private filters: Array<(row: Row) => boolean> = [];
  private orderField: string | null = null;
  private orderAsc = true;
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

  order(field: string, ascending = true) {
    this.orderField = field;
    this.orderAsc = ascending;
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
    if (this.orderField) {
      const field = this.orderField;
      const dir = this.orderAsc ? 1 : -1;
      rows = rows.slice().sort((a, b) => {
        const va = a[field] as any;
        const vb = b[field] as any;
        if (va === vb) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
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
