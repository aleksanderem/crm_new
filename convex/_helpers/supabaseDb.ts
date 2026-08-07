import type { TableNames } from "../_generated/dataModel";
import { createServiceRoleClient, upsertWithFkRetry } from "../supabase/client";
import type { SupabaseRow } from "./supabaseRows";

const TABLE_MAP: Record<string, string> = {
  users: "users",
  contacts: "contacts",
  companies: "companies",
  leads: "leads",
  products: "products",
  productStockLevels: "product_stock_levels",
  productStockMovements: "product_stock_movements",
  warehouseDeliveries: "warehouse_deliveries",
  warehouseDeliveryItems: "warehouse_delivery_items",
  deliveryNameMappings: "delivery_name_mappings",
  calls: "calls",
  notes: "notes",
  activities: "activities",
  emails: "emails",
  emailTemplates: "email_templates",
  emailAccounts: "email_accounts",
  emailLayouts: "email_layouts",
  emailBrandConfig: "email_brand_config",
  emailEventTypes: "email_event_types",
  emailEventBindings: "email_event_bindings",
  emailEventLog: "email_event_log",
  emailSequences: "email_sequences",
  emailSequenceSteps: "email_sequence_steps",
  emailSequenceEnrollments: "email_sequence_enrollments",
  pipelines: "pipelines",
  pipelineStages: "pipeline_stages",
  pipelineStageActions: "pipeline_stage_actions",
  scheduledActivities: "scheduled_activities",
  savedViews: "saved_views",
  auditLog: "audit_log",
  customFieldDefinitions: "custom_field_definitions",
  customFieldValues: "custom_field_values",
  objectRelationships: "object_relationships",
  sources: "sources",
  lostReasons: "lost_reasons",
  documents: "documents",
  documentTemplates: "document_templates",
  documentTemplateFields: "document_template_fields",
  documentInstances: "document_instances",
  documentComponents: "document_components",
  documentAnalysisJobs: "document_analysis_jobs",
  formTemplates: "form_templates",
  formDocuments: "form_documents",
  signatureRequests: "signature_requests",
  recentlyViewed: "recently_viewed",
  mailProviders: "mail_providers",
  dealProducts: "deal_products",
  tagDefinitions: "tag_definitions",
  categoryDefinitions: "category_definitions",
  gabinetPatients: "gabinet_patients",
  gabinetAppointments: "gabinet_appointments",
  gabinetAppointmentTreatments: "gabinet_appointment_treatments",
  gabinetTreatments: "gabinet_treatments",
  gabinetTreatmentVariants: "gabinet_treatment_variants",
  gabinetTreatmentProducts: "gabinet_treatment_products",
  gabinetEmployees: "gabinet_employees",
  gabinetEmployeeLocations: "gabinet_employee_locations",
  gabinetLocations: "gabinet_locations",
  gabinetRooms: "gabinet_rooms",
  gabinetEquipment: "gabinet_equipment",
  gabinetEquipmentTransfers: "gabinet_equipment_transfers",
  gabinetWorkingHours: "gabinet_working_hours",
  gabinetEmployeeSchedules: "gabinet_employee_schedules",
  gabinetLeaves: "gabinet_leaves",
  gabinetLeaveTypes: "gabinet_leave_types",
  gabinetPaymentMethods: "gabinet_payment_methods",
  gabinetLeaveBalances: "gabinet_leave_balances",
  gabinetTreatmentPackages: "gabinet_treatment_packages",
  gabinetPackageUsage: "gabinet_package_usage",
  gabinetLoyaltyPoints: "gabinet_loyalty_points",
  gabinetLoyaltyTransactions: "gabinet_loyalty_transactions",
  gabinetLoyaltyTiers: "gabinet_loyalty_tiers",
  gabinetPortalSessions: "gabinet_portal_sessions",
  gabinetOvertime: "gabinet_overtime",
  appointmentReminders: "appointment_reminders",
  appointmentSmsEvents: "appointment_sms_events",
  appointmentWorkflowHistory: "appointment_workflow_history",
  activityTypeDefinitions: "activity_type_definitions",
  orgSmsConfig: "org_sms_config",
  orgSettings: "org_settings",
  orgPermissions: "org_permissions",
  invitations: "invitations",
  payments: "payments",
  googleCalendarSyncConfigs: "google_calendar_sync_configs",
  resourceInvites: "resource_invites",
  automationRules: "automation_rules",
  automationRuns: "automation_runs",
  automationRunSteps: "automation_run_steps",
  organizations: "organizations",
  teamMemberships: "team_memberships",
  gabinetReceipts: "gabinet_receipts",
  gabinetReceiptSequences: "gabinet_receipt_sequences",
};

function toSnakeCase(str: string): string {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function mapRowToSnake(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "_id" || key === "_creationTime") continue;
    result[toSnakeCase(key)] = value ?? null;
  }
  return result;
}

function mapRowFromSnake(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camel] = value;
  }
  if (result.id) {
    result._id = result.id;
  }
  return result;
}

function resolveTable(convexTable: string): string {
  const mapped = TABLE_MAP[convexTable];
  if (!mapped) throw new Error(`Unknown table: ${convexTable}. Add it to TABLE_MAP in supabaseDb.ts`);
  return mapped;
}

// Typed surface for `createSupabaseDb()`.
//
// `query()` returns a `SupabaseQueryBuilder<SupabaseRow<TableName>>` when
// called with a Convex table name, so callers like
// `db.query("gabinetLoyaltyPoints").first()` see real field types and no
// longer need a `(row.balance as number)` cast per access (root cause of
// the #585 typecheck breakage).
//
// A fallback overload preserves explicit-generic call sites
// (`db.query<{ order?: number }>("sources")`) and tables that live only in
// Supabase, like `recentlyViewed` (#544/#567 removed it from the Convex
// schema but the code still reads/writes the Postgres row).
//
// `get` / `getMany` mirror the typed-overload pattern used by `query()`:
// calling them with a Convex table literal yields a `SupabaseRow<TableName>`
// instead of `Record<string, unknown>`, so callers don't need per-field
// `as` casts. A fallback overload with the original loose signature
// preserves explicit-generic call sites (e.g. `db.get<{ orgId: string }>`)
// and Supabase-only tables that don't appear in `TableNames`.
//
// `insert` / `patch` stay loose; typed variants live on `insertRow` /
// `patchRow`. We can't replicate the `get`/`getMany`/`query` overload
// pattern here because the row payload sits in parameter position:
// adding a `row: Partial<SupabaseRow<TableName>>` overload alongside
// the `row: Record<string, unknown>` fallback forces TS to disambiguate
// the two for every call, instantiating `Partial<Doc<T>>` across the
// full 80+ table union. That blows the instantiation budget and
// triggers TS2589 ("type instantiation is excessively deep") in every
// caller of the `SupabaseDb` interface — not just at the insert/patch
// call site (verified with both naive overload and non-distributive
// `[T] extends [TableNames]` wrappers; see #606).
//
// Splitting into distinct method names (`insert` vs `insertRow`) sidesteps
// overload resolution entirely, so callers that want field-level checking
// can opt in via `db.insertRow(...)` / `db.patchRow(...)` without
// destabilizing the rest of the program. The runtime is identical:
// `insertRow` and `patchRow` are just typed aliases of `insert` / `patch`.
// `delete` takes no row payload so it stays loose as well.
export interface SupabaseDb {
  get<TableName extends TableNames>(
    table: TableName,
    id: string,
  ): Promise<SupabaseRow<TableName> | null>;
  get<T = Record<string, unknown>>(table: string, id: string): Promise<T | null>;

  getMany<TableName extends TableNames>(
    table: TableName,
    ids: string[],
  ): Promise<SupabaseRow<TableName>[]>;
  getMany<T = Record<string, unknown>>(
    table: string,
    ids: string[],
  ): Promise<T[]>;

  insert(table: string, row: Record<string, unknown>): Promise<string>;

  insertRow<TableName extends TableNames>(
    table: TableName,
    row: Partial<SupabaseRow<TableName>>,
  ): Promise<string>;

  patch(
    table: string,
    id: string,
    updates: Record<string, unknown>,
  ): Promise<void>;

  patchRow<TableName extends TableNames>(
    table: TableName,
    id: string,
    updates: Partial<SupabaseRow<TableName>>,
  ): Promise<void>;

  delete(table: string, id: string): Promise<void>;

  query<TableName extends TableNames>(
    table: TableName,
  ): SupabaseQueryBuilder<SupabaseRow<TableName>>;
  query<T = Record<string, unknown>>(
    table: string,
  ): SupabaseQueryBuilder<T>;

  raw(): ReturnType<typeof createServiceRoleClient>;

  /** UUID generated at construction time; sent as `x-correlation-id` on every
   *  Supabase request and available for structured log entries so Convex logs
   *  and PostgREST access logs can be correlated. */
  correlationId: string;
}

export function createSupabaseDb(correlationId?: string): SupabaseDb {
  const id = correlationId ?? crypto.randomUUID();
  const client = createServiceRoleClient(id);

  function get<TableName extends TableNames>(
    table: TableName,
    id: string,
  ): Promise<SupabaseRow<TableName> | null>;
  function get<T = Record<string, unknown>>(
    table: string,
    id: string,
  ): Promise<T | null>;
  async function get(table: string, id: string): Promise<unknown> {
    const { data, error } = await client
      .from(resolveTable(table))
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`supabaseDb.get(${table}, ${id}): ${error.message}`);
    return data ? mapRowFromSnake(data) : null;
  }

  function getMany<TableName extends TableNames>(
    table: TableName,
    ids: string[],
  ): Promise<SupabaseRow<TableName>[]>;
  function getMany<T = Record<string, unknown>>(
    table: string,
    ids: string[],
  ): Promise<T[]>;
  async function getMany(table: string, ids: string[]): Promise<unknown[]> {
    if (ids.length === 0) return [];
    const { data, error } = await client
      .from(resolveTable(table))
      .select("*")
      .in("id", ids);
    if (error) throw new Error(`supabaseDb.getMany(${table}): ${error.message}`);
    return (data ?? []).map(mapRowFromSnake);
  }

  async function insert(
    table: string,
    row: Record<string, unknown>,
  ): Promise<string> {
    const id = row._id ? String(row._id) : crypto.randomUUID();
    const snakeRow = mapRowToSnake(row);
    snakeRow.id = id;
    try {
      const result = await upsertWithFkRetry(client, resolveTable(table), snakeRow);
      return result.id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`supabaseDb.insert(${table}): ${msg}`);
    }
  }

  async function patch(
    table: string,
    id: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const snakeUpdates = mapRowToSnake(updates);
    const { error } = await client
      .from(resolveTable(table))
      .update(snakeUpdates)
      .eq("id", id);
    if (error) throw new Error(`supabaseDb.patch(${table}, ${id}): ${error.message}`);
  }

  async function del(table: string, id: string): Promise<void> {
    const { error } = await client
      .from(resolveTable(table))
      .delete()
      .eq("id", id);
    if (error) throw new Error(`supabaseDb.delete(${table}, ${id}): ${error.message}`);
  }

  function query<TableName extends TableNames>(
    table: TableName,
  ): SupabaseQueryBuilder<SupabaseRow<TableName>>;
  function query<T = Record<string, unknown>>(
    table: string,
  ): SupabaseQueryBuilder<T>;
  function query(table: string): SupabaseQueryBuilder {
    const pgTable = resolveTable(table);
    return new SupabaseQueryBuilder(client, pgTable);
  }

  function raw() {
    return client;
  }

  return {
    get,
    getMany,
    insert,
    insertRow: insert,
    patch,
    patchRow: patch,
    delete: del,
    query,
    raw,
    correlationId: id,
  };
}

class SupabaseQueryBuilder<T = Record<string, unknown>> {
  private client: ReturnType<typeof createServiceRoleClient>;
  private table: string;
  private filters: Array<(q: any) => any> = [];
  private orderBy: Array<{ field: string; ascending: boolean }> = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;

  constructor(client: ReturnType<typeof createServiceRoleClient>, table: string) {
    this.client = client;
    this.table = table;
  }

  eq(field: string, value: unknown) {
    this.filters.push((q) => q.eq(toSnakeCase(field), value));
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push((q) => q.neq(toSnakeCase(field), value));
    return this;
  }

  gt(field: string, value: unknown) {
    this.filters.push((q) => q.gt(toSnakeCase(field), value));
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push((q) => q.gte(toSnakeCase(field), value));
    return this;
  }

  lt(field: string, value: unknown) {
    this.filters.push((q) => q.lt(toSnakeCase(field), value));
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push((q) => q.lte(toSnakeCase(field), value));
    return this;
  }

  ilike(field: string, pattern: string) {
    this.filters.push((q) => q.ilike(toSnakeCase(field), pattern));
    return this;
  }

  /**
   * PostgREST OR filter. `filterStr` must use snake_case column names and
   * PostgREST filter syntax, e.g. `"first_name.ilike.%jo%,last_name.ilike.%jo%"`.
   * Multiple `.or()` calls on the same builder are AND-combined by PostgREST.
   */
  or(filterStr: string) {
    this.filters.push((q) => q.or(filterStr));
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((q) => q.in(toSnakeCase(field), values));
    return this;
  }

  /**
   * JSONB containment filter (`@>` operator). Checks whether the column value
   * contains all key-value pairs in `value` (for objects) or all elements in
   * `value` (for arrays). Only meaningful for JSONB / array columns in Postgres.
   */
  contains(field: string, value: Record<string, unknown> | unknown[]) {
    this.filters.push((q) => q.contains(toSnakeCase(field), value));
    return this;
  }

  order(field: string, ascending = true) {
    this.orderBy.push({ field: toSnakeCase(field), ascending });
    return this;
  }

  take(n: number) {
    this.limitN = n;
    return this;
  }

  /**
   * Inclusive range for offset-based pagination. Mirrors PostgREST's
   * `.range(from, to)` semantics: both endpoints are inclusive, so
   * `range(0, 9)` returns up to 10 rows starting at offset 0.
   */
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  /**
   * Skip the first `n` rows. Combine with `.take(limit)` for paged reads.
   * Implemented on top of `range`; cannot be combined with an explicit
   * `.range()` call.
   */
  offset(n: number) {
    this.rangeFrom = n;
    return this;
  }

  async collect(): Promise<T[]> {
    let q = this.client.from(this.table).select("*");
    for (const f of this.filters) q = f(q);
    for (const { field, ascending } of this.orderBy) {
      q = q.order(field, { ascending });
    }
    if (this.rangeFrom !== null) {
      const from = this.rangeFrom;
      const to =
        this.rangeTo !== null
          ? this.rangeTo
          : this.limitN !== null
            ? from + this.limitN - 1
            : from + 999;
      q = q.range(from, to);
    } else if (this.limitN) {
      q = q.limit(this.limitN);
    }
    const { data, error } = await q;
    if (error) throw new Error(`supabaseDb.query(${this.table}).collect(): ${error.message}`);
    return (data ?? []).map(mapRowFromSnake) as T[];
  }

  async first(): Promise<T | null> {
    let q = this.client.from(this.table).select("*");
    for (const f of this.filters) q = f(q);
    for (const { field, ascending } of this.orderBy) {
      q = q.order(field, { ascending });
    }
    q = q.limit(1);
    const { data, error } = await q;
    if (error) throw new Error(`supabaseDb.query(${this.table}).first(): ${error.message}`);
    return data && data.length > 0 ? (mapRowFromSnake(data[0]) as T) : null;
  }

  async unique(): Promise<T | null> {
    return this.first();
  }
}
