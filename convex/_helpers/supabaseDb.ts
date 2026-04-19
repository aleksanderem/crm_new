import { createServiceRoleClient, upsertWithFkRetry } from "../supabase/client";

const TABLE_MAP: Record<string, string> = {
  contacts: "contacts",
  companies: "companies",
  leads: "leads",
  products: "products",
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
  notifications: "notifications",
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
  gabinetTreatments: "gabinet_treatments",
  gabinetTreatmentVariants: "gabinet_treatment_variants",
  gabinetEmployees: "gabinet_employees",
  gabinetLocations: "gabinet_locations",
  gabinetRooms: "gabinet_rooms",
  gabinetEquipment: "gabinet_equipment",
  gabinetEquipmentTransfers: "gabinet_equipment_transfers",
  gabinetWorkingHours: "gabinet_working_hours",
  gabinetEmployeeSchedules: "gabinet_employee_schedules",
  gabinetLeaves: "gabinet_leaves",
  gabinetLeaveTypes: "gabinet_leave_types",
  gabinetLeaveBalances: "gabinet_leave_balances",
  gabinetTreatmentPackages: "gabinet_packages",
  gabinetPackageUsage: "gabinet_package_usage",
  gabinetLoyaltyPoints: "gabinet_loyalty_points",
  gabinetLoyaltyTransactions: "gabinet_loyalty_transactions",
  gabinetDocumentTemplates: "gabinet_document_templates",
  gabinetDocuments: "gabinet_documents",
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

export function createSupabaseDb() {
  const client = createServiceRoleClient();

  return {
    async get(table: string, id: string): Promise<Record<string, unknown> | null> {
      const { data, error } = await client
        .from(resolveTable(table))
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`supabaseDb.get(${table}, ${id}): ${error.message}`);
      return data ? mapRowFromSnake(data) : null;
    },

    async getMany(table: string, ids: string[]): Promise<Record<string, unknown>[]> {
      if (ids.length === 0) return [];
      const { data, error } = await client
        .from(resolveTable(table))
        .select("*")
        .in("id", ids);
      if (error) throw new Error(`supabaseDb.getMany(${table}): ${error.message}`);
      return (data ?? []).map(mapRowFromSnake);
    },

    async insert(
      table: string,
      row: Record<string, unknown>,
    ): Promise<string> {
      const id = row._id ? String(row._id) : crypto.randomUUID();
      const snakeRow = mapRowToSnake(row);
      snakeRow.id = id;
      const result = await upsertWithFkRetry(client, resolveTable(table), snakeRow);
      return result.id;
    },

    async patch(
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
    },

    async delete(table: string, id: string): Promise<void> {
      const { error } = await client
        .from(resolveTable(table))
        .delete()
        .eq("id", id);
      if (error) throw new Error(`supabaseDb.delete(${table}, ${id}): ${error.message}`);
    },

    query(table: string) {
      const pgTable = resolveTable(table);
      return new SupabaseQueryBuilder(client, pgTable);
    },

    raw() {
      return client;
    },
  };
}

class SupabaseQueryBuilder {
  private client: ReturnType<typeof createServiceRoleClient>;
  private table: string;
  private filters: Array<(q: any) => any> = [];
  private orderField: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

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

  order(field: string, ascending = true) {
    this.orderField = toSnakeCase(field);
    this.orderAsc = ascending;
    return this;
  }

  take(n: number) {
    this.limitN = n;
    return this;
  }

  async collect(): Promise<Record<string, unknown>[]> {
    let q = this.client.from(this.table).select("*");
    for (const f of this.filters) q = f(q);
    if (this.orderField) q = q.order(this.orderField, { ascending: this.orderAsc });
    if (this.limitN) q = q.limit(this.limitN);
    const { data, error } = await q;
    if (error) throw new Error(`supabaseDb.query(${this.table}).collect(): ${error.message}`);
    return (data ?? []).map(mapRowFromSnake);
  }

  async first(): Promise<Record<string, unknown> | null> {
    let q = this.client.from(this.table).select("*");
    for (const f of this.filters) q = f(q);
    if (this.orderField) q = q.order(this.orderField, { ascending: this.orderAsc });
    q = q.limit(1);
    const { data, error } = await q;
    if (error) throw new Error(`supabaseDb.query(${this.table}).first(): ${error.message}`);
    return data && data.length > 0 ? mapRowFromSnake(data[0]) : null;
  }

  async unique(): Promise<Record<string, unknown> | null> {
    return this.first();
  }
}

export type SupabaseDb = ReturnType<typeof createSupabaseDb>;
