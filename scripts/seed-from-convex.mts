/**
 * Seed Supabase from Convex export.
 * 
 * Usage: SUPABASE_URL=... SERVICE_KEY=... npx tsx scripts/seed-from-convex.mts /tmp/convex-export
 * 
 * Inserts data in FK order, maps camelCase→snake_case, skips auth tables.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TABLE_COLUMNS, type TableName } from '../src/lib/supabase/database.columns';
import type { Database } from '../src/lib/supabase/database.types';

const url = process.env.SUPABASE_URL!;
const key = process.env.SERVICE_KEY!;
const exportDir = process.argv[2] || '/tmp/convex-export';

const sb: SupabaseClient<Database> = createClient<Database>(url, key, {
  auth: { persistSession: false },
});

// ─── Convex doc & row types ──────────────────────────────────────────────
type ConvexDoc = Record<string, unknown> & { _id: string; _creationTime?: number };
type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert'];

// Per-table override map: transforms keyed by snake_case column names of the
// target Insert type. Using a mapped type ensures callers can't register
// transforms for columns that don't exist on the target table.
type ExtraMap<T extends TableName> = {
  [K in keyof TableInsert<T>]?: (v: unknown) => TableInsert<T>[K];
};

// ─── camelCase → snake_case ──────────────────────────────────────────────
function toSnake(s: string): string {
  return s.replace(/([A-Z])/g, '_$1').toLowerCase();
}

// ─── Read JSONL ──────────────────────────────────────────────────────────
function readTable(name: string): ConvexDoc[] {
  const p = join(exportDir, name, 'documents.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as ConvexDoc);
}

// Columns that are known to exist in Postgres but are stripped from the
// generated types because Postgres computes them (GENERATED ALWAYS). The seed
// script must never write to these — they're auto-populated.
const GENERATED_COLUMNS: ReadonlySet<string> = new Set(['search_vector']);

// ─── Map Convex doc → Supabase row ──────────────────────────────────────
//
// `validColumns` is the set of column names known to the target Supabase
// table (sourced from `TABLE_COLUMNS`). Keys produced by the dynamic
// camelCase→snake_case conversion that fall outside this set are reported
// and dropped — without this, a column rename in the SQL schema would
// silently land as the old key and the upsert would still appear to succeed
// for the unaffected columns.
function mapRow<T extends TableName>(
  table: T,
  doc: ConvexDoc,
  extraMap: ExtraMap<T> = {},
): { row: TableInsert<T>; unknownKeys: string[] } {
  const validColumns = TABLE_COLUMNS[table];
  const row: Record<string, unknown> = {};
  const unknownKeys: string[] = [];
  // The mapped type keys `extraMap` by `keyof TableInsert<T>`, but at runtime
  // we look up by the dynamic snake_case key (a plain `string`). Index through
  // a record view to perform that lookup without losing the public guarantee.
  const lookups = extraMap as Record<string, ((v: unknown) => unknown) | undefined>;

  for (const [k, v] of Object.entries(doc)) {
    if (k === '_creationTime') continue;
    const snakeKey = k === '_id' ? 'id' : toSnake(k);

    // Drop generated columns silently — Postgres recomputes them on insert.
    if (GENERATED_COLUMNS.has(snakeKey)) continue;

    let value: unknown;
    const transform = lookups[snakeKey];
    if (transform) {
      value = transform(v);
    } else if (Array.isArray(v)) {
      // supabase-js serializes native arrays correctly for TEXT[] / JSONB.
      value = v;
    } else if (typeof v === 'object' && v !== null) {
      value = JSON.stringify(v);
    } else {
      value = v;
    }

    if (!validColumns.has(snakeKey)) {
      unknownKeys.push(snakeKey);
      continue;
    }
    row[snakeKey] = value;
  }

  return { row: row as TableInsert<T>, unknownKeys };
}

// ─── Upsert batch ────────────────────────────────────────────────────────
async function upsertBatch<T extends TableName>(
  table: T,
  rows: TableInsert<T>[],
  batchSize = 200,
) {
  if (rows.length === 0) return { ok: 0, err: 0 };
  let ok = 0, err = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).upsert(batch as never, { onConflict: 'id' });
    if (error) {
      // Try one-by-one for the failing batch
      for (const row of batch) {
        const { error: e2 } = await sb.from(table).upsert(row as never, { onConflict: 'id' });
        if (e2) {
          err++;
          const id = (row as { id?: string }).id ?? '<no-id>';
          if (err <= 3) console.log(`    ⚠ ${table} row ${id}: ${e2.message.slice(0, 100)}`);
        } else {
          ok++;
        }
      }
    } else {
      ok += batch.length;
    }
  }
  return { ok, err };
}

// ─── Filter for org ──────────────────────────────────────────────────────
const ORG_ID = 'kx79hvdbedpfd3h7wkd37za67d8292j3';
const USER_ID = 'mn734w9bg99bv05j8gc9p241bd829mrz';

function forOrg(docs: ConvexDoc[]): ConvexDoc[] {
  return docs.filter(d => d.organizationId === ORG_ID);
}

// ─── Seed tables in FK order ─────────────────────────────────────────────
async function seed() {
  console.log(`Seeding Supabase from ${exportDir}`);
  console.log(`Target org: ${ORG_ID}`);
  console.log(`Target user: ${USER_ID}\n`);

  // Disable FK triggers on all tables for bulk insert
  console.log('Disabling FK triggers...');
  const sqlHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'apikey': key };
  
  async function runSQL(query: string): Promise<Array<Record<string, unknown>>> {
    const r = await fetch(`${url}/pg/query`, { method: 'POST', headers: sqlHeaders, body: JSON.stringify({ query }) });
    if (!r.ok) throw new Error(`SQL failed: ${await r.text()}`);
    return r.json() as Promise<Array<Record<string, unknown>>>;
  }

  // Get all tables and disable triggers
  const tables = await runSQL("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  for (const t of tables) {
    const tableName = t.tablename as string;
    await runSQL(`ALTER TABLE public."${tableName}" DISABLE TRIGGER ALL`).catch(() => {});
  }
  console.log(`Disabled triggers on ${tables.length} tables\n`);

  const results: Array<{ table: string; ok: number; err: number }> = [];
  const unknownColumnReports = new Map<string, Set<string>>();

  function reportUnknown(table: string, keys: string[]) {
    if (keys.length === 0) return;
    let bucket = unknownColumnReports.get(table);
    if (!bucket) {
      bucket = new Set();
      unknownColumnReports.set(table, bucket);
    }
    for (const k of keys) bucket.add(k);
  }

  async function seedTable<T extends TableName>(
    pgTable: T,
    convexTable: string,
    filter?: (docs: ConvexDoc[]) => ConvexDoc[],
    extraMap: ExtraMap<T> = {},
    skipCols: ReadonlyArray<string> = [],
  ) {
    let docs = readTable(convexTable);
    if (filter) docs = filter(docs);

    const rows = docs.map(d => {
      const { row, unknownKeys } = mapRow(pgTable, d, extraMap);
      reportUnknown(pgTable, unknownKeys);
      if (skipCols.length > 0) {
        const writable = row as Record<string, unknown>;
        for (const c of skipCols) delete writable[c];
        return writable as TableInsert<T>;
      }
      return row;
    });

    const { ok, err } = await upsertBatch(pgTable, rows);
    results.push({ table: pgTable, ok, err });
    const status = err > 0 ? `${ok} ok, ${err} err` : `${ok} ok`;
    console.log(`  ${pgTable}: ${status}`);
  }

  // ── 1. Users (no FK deps) ──
  console.log('Phase 1: Base tables (no FK deps)');
  {
    // Insert the target user + any users referenced in team memberships
    const allUsers = readTable('users');
    const memberships = readTable('teamMemberships').filter(m => m.organizationId === ORG_ID);
    const neededUserIds = new Set<string>([
      USER_ID,
      ...memberships.map(m => m.userId as string),
    ]);
    const users = allUsers.filter(u => neededUserIds.has(u._id));

    const rows = users.map(u => {
      const { row, unknownKeys } = mapRow('users', u);
      reportUnknown('users', unknownKeys);
      return row;
    });

    const { ok, err } = await upsertBatch('users', rows);
    results.push({ table: 'users', ok, err });
    console.log(`  users: ${ok} ok, ${err} err`);
  }

  // ── 2. Organizations ──
  await seedTable('organizations', 'organizations', docs => docs.filter(x => x._id === ORG_ID));
  
  // ── 3. Team memberships ──
  await seedTable('team_memberships', 'teamMemberships', forOrg);

  // ── 4. Sources, categories, tags ──
  console.log('\nPhase 2: Lookup tables');
  await seedTable('sources', 'sources', forOrg);
  await seedTable('category_definitions', 'categoryDefinitions', forOrg);
  await seedTable('tag_definitions', 'tagDefinitions', forOrg);
  await seedTable('lost_reasons', 'lostReasons', forOrg);
  await seedTable('activity_type_definitions', 'activityTypeDefinitions', forOrg);

  // ── 5. Pipelines & stages ──
  console.log('\nPhase 3: CRM structure');
  await seedTable('pipelines', 'pipelines', forOrg);
  await seedTable('pipeline_stages', 'pipelineStages', forOrg);
  await seedTable('pipeline_stage_actions', 'pipelineStageActions', forOrg);
  await seedTable('products', 'products', forOrg);

  // ── 6. Contacts & companies (have FK to org, user, source, category) ──
  console.log('\nPhase 4: CRM entities');
  await seedTable('contacts', 'contacts', forOrg);
  await seedTable('companies', 'companies', forOrg);
  await seedTable('leads', 'leads', forOrg);
  await seedTable('calls', 'calls', forOrg);

  // ── 7. Activities & notes ──
  console.log('\nPhase 5: Activities & relations');
  await seedTable('activities', 'activities', forOrg);
  await seedTable('notes', 'notes', forOrg);
  await seedTable('object_relationships', 'objectRelationships', forOrg);
  await seedTable('saved_views', 'savedViews', forOrg);
  await seedTable('emails', 'emails', forOrg);
  await seedTable('documents', 'documents', forOrg);
  await seedTable('recently_viewed', 'recentlyViewed', forOrg);

  // ── 8. Email system ──
  console.log('\nPhase 6: Email & automation');
  await seedTable('email_templates', 'emailTemplates', forOrg);
  await seedTable('email_event_types', 'emailEventTypes', forOrg);
  await seedTable('email_event_bindings', 'emailEventBindings', forOrg);
  await seedTable('email_sequences', 'emailSequences', forOrg);
  await seedTable('email_sequence_steps', 'emailSequenceSteps', forOrg);
  await seedTable('email_accounts', 'emailAccounts', forOrg);
  await seedTable('mail_providers', 'mailProviders', forOrg);
  
  // ── 9. Automation ──
  await seedTable('automation_rules', 'automationRules', forOrg);

  // ── 10. Gabinet core ──
  console.log('\nPhase 7: Gabinet');
  await seedTable('gabinet_locations', 'gabinetLocations', forOrg);
  await seedTable('gabinet_rooms', 'gabinetRooms', forOrg);
  await seedTable('gabinet_equipment', 'gabinetEquipment', forOrg);
  await seedTable('gabinet_employees', 'gabinetEmployees', forOrg);
  await seedTable('gabinet_employee_schedules', 'gabinetEmployeeSchedules', forOrg);
  await seedTable('gabinet_working_hours', 'gabinetWorkingHours', forOrg);
  await seedTable('gabinet_leave_types', 'gabinetLeaveTypes', forOrg);
  await seedTable('gabinet_leave_balances', 'gabinetLeaveBalances', forOrg);
  await seedTable('gabinet_leaves', 'gabinetLeaves', forOrg);
  await seedTable('gabinet_treatments', 'gabinetTreatments', forOrg);
  await seedTable('gabinet_treatment_variants', 'gabinetTreatmentVariants', forOrg);
  await seedTable('gabinet_treatment_packages', 'gabinetTreatmentPackages', forOrg);
  await seedTable('gabinet_patients', 'gabinetPatients', forOrg);
  await seedTable('gabinet_appointments', 'gabinetAppointments', forOrg);
  await seedTable('gabinet_documents', 'gabinetDocuments', forOrg);
  await seedTable('gabinet_document_templates', 'gabinetDocumentTemplates', forOrg);
  await seedTable('gabinet_loyalty_points', 'gabinetLoyaltyPoints', forOrg);
  await seedTable('gabinet_loyalty_transactions', 'gabinetLoyaltyTransactions', forOrg);
  await seedTable('gabinet_package_usage', 'gabinetPackageUsage', forOrg);

  // ── 11. Forms & document instances ──
  console.log('\nPhase 8: Forms & documents');
  await seedTable('form_templates', 'formTemplates', forOrg);
  await seedTable('form_documents', 'formDocuments', forOrg);
  await seedTable('document_templates', 'documentTemplates', forOrg);
  await seedTable('document_instances', 'documentInstances', forOrg);
  await seedTable('signature_requests', 'signatureRequests', forOrg);
  
  // ── 12. Scheduled activities ──
  await seedTable('scheduled_activities', 'scheduledActivities', forOrg);
  await seedTable('payments', 'payments', forOrg);
  await seedTable('notifications', 'notifications', forOrg);
  await seedTable('custom_field_definitions', 'customFieldDefinitions', forOrg);

  // ── Summary ──
  console.log('\n═══ Summary ═══');
  let totalOk = 0, totalErr = 0;
  for (const r of results) {
    totalOk += r.ok;
    totalErr += r.err;
  }
  console.log(`Total: ${totalOk} rows inserted, ${totalErr} errors`);
  
  if (totalErr > 0) {
    console.log('\nTables with errors:');
    for (const r of results) {
      if (r.err > 0) console.log(`  ${r.table}: ${r.err} errors`);
    }
  }

  if (unknownColumnReports.size > 0) {
    console.log('\n⚠ Dropped unknown columns (not in Supabase schema):');
    for (const [table, cols] of unknownColumnReports) {
      console.log(`  ${table}: ${[...cols].sort().join(', ')}`);
    }
  }

  // ── Verify contacts specifically ──
  console.log('\n═══ Verification ═══');

  // Re-enable FK triggers
  console.log('\nRe-enabling FK triggers...');
  for (const t of tables) {
    const tableName = t.tablename as string;
    await runSQL(`ALTER TABLE public."${tableName}" ENABLE TRIGGER ALL`).catch(() => {});
  }
  
  const { count: contactCount } = await sb.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_ID);
  console.log(`Contacts in Supabase: ${contactCount}`);
  const { count: companyCount } = await sb.from('companies').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_ID);
  console.log(`Companies in Supabase: ${companyCount}`);
  const { count: patientCount } = await sb.from('gabinet_patients').select('*', { count: 'exact', head: true }).eq('organization_id', ORG_ID);
  console.log(`Patients in Supabase: ${patientCount}`);
}

seed().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
