# Schema Mapping: Convex → PostgreSQL

This document maps every Convex table to its PostgreSQL equivalent and records the translation decisions made for each Convex-specific pattern.

---

## Translation Conventions

| Convex concept | PostgreSQL translation |
|---|---|
| Convex document ID (`v.id(...)`) | `TEXT PRIMARY KEY` — Convex IDs are random base62 strings, not UUIDs |
| `v.number()` timestamp | `BIGINT` — milliseconds since epoch |
| `v.optional(T)` | Nullable column (`T` without `NOT NULL`) |
| `v.array(v.string())` | `TEXT[]` |
| `v.array(v.id(...))` | `TEXT[]` (array of Convex IDs) |
| `v.object({...})` (nested) | `JSONB` — preserves structure, queryable with operators |
| `v.any()` | `JSONB` |
| `v.union(v.literal(...))` | `TEXT` enum or PostgreSQL `ENUM` type |
| `searchIndex` | `TSVECTOR GENERATED ALWAYS AS (...) STORED` + `GIN` index |
| `.index("name", [...])` | `CREATE INDEX` on listed columns |
| `organizationId` FK | Always `TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE` |
| Convex `_storage` ID | `TEXT` (storage ID string, no FK to a files table) |
| Forward-reference FKs | Declared via `ALTER TABLE ... ADD CONSTRAINT` after both tables exist |

---

## Module: Auth (`@convex-dev/auth` authTables)

| Convex table | PostgreSQL table | Notes |
|---|---|---|
| `users` (auth base) | `users` | Merged with platform extension fields |
| auth accounts | `auth_accounts` | Provider OAuth accounts |
| auth sessions | `auth_sessions` | Session tokens |
| auth verification codes | `auth_verification_codes` | OTP/email verification |
| auth rate limits | `auth_rate_limits` | Brute-force protection |

---

## Module: Platform (`convex/schema/platform.ts`)

| Convex table | PostgreSQL table | Notes |
|---|---|---|
| `users` (extension) | `users` | Merged into single `users` table |
| `plans` | `plans` | Stripe plan definitions |
| `subscriptions` | `subscriptions` | User-level Stripe subscriptions |
| `platformProducts` | `platform_products` | Module product catalog |
| `productSubscriptions` | `product_subscriptions` | Per-org module activations |
| `emailEventTypes` | `email_event_types` | Event type registry |
| `emailEventBindings` | `email_event_bindings` | Template→event wiring |
| `emailEventLog` | `email_event_log` | Delivery audit log |
| `emailSequences` | `email_sequences` | Email drip sequences |
| `emailSequenceSteps` | `email_sequence_steps` | Individual steps |
| `emailSequenceEnrollments` | `email_sequence_enrollments` | Per-contact enrollment state |
| `emailBrandConfig` | `email_brand_config` | Per-org email branding |
| `recentlyViewed` | `recently_viewed` | Entity view history per user |

---

## Module: CRM (`convex/schema/crm.ts`)

| Convex table | PostgreSQL table | Notes |
|---|---|---|
| `organizations` | `organizations` | Multi-tenant anchor |
| `teamMemberships` | `team_memberships` | Org role assignments |
| `contacts` | `contacts` | CRM contacts |
| `companies` | `companies` | CRM companies |
| `leads` | `leads` | Deals/leads |
| `documents` | `documents` | CRM documents (proposals, invoices) |
| `pipelines` | `pipelines` | Sales pipelines |
| `pipelineStages` | `pipeline_stages` | Kanban stages |
| `pipelineStageActions` | `pipeline_stage_actions` | Auto-actions on stage enter |
| `customFieldDefinitions` | `custom_field_definitions` | Dynamic field schema |
| `customFieldValues` | `custom_field_values` | Dynamic field data |
| `activityTypeDefinitions` | `activity_type_definitions` | Activity taxonomy |
| `objectRelationships` | `object_relationships` | Polymorphic M:N links |
| `activities` | `activities` | Timeline/audit stream |
| `products` | `products` | Product catalog |
| `dealProducts` | `deal_products` | Line items per deal |
| `calls` | `calls` | Call log |
| `scheduledActivities` | `scheduled_activities` | Calendar events |
| `payments` | `payments` | Payment records |
| `savedViews` | `saved_views` | Persisted filter views |
| `lostReasons` | `lost_reasons` | Deal lost reason options |
| `orgSettings` | `org_settings` | Org-level settings |
| `orgPermissions` | `org_permissions` | RBAC permission overrides |
| `resourceInvites` | `resource_invites` | External guest access tokens |
| `notifications` | `notifications` | In-app notifications |
| `auditLog` | `audit_log` | Compliance audit log |
| `sources` | `sources` | Lead source taxonomy |
| `emails` | `emails` | Email messages |
| `emailAccounts` | `email_accounts` | From-address configs |
| `mailProviders` | `mail_providers` | Connected mail integrations |
| `emailTemplates` | `email_templates` | Email content templates |
| `emailLayouts` | `email_layouts` | Global email wrapper per org |
| `invitations` | `invitations` | Org member invitations |
| `oauthConnections` | `oauth_connections` | OAuth token storage |
| `notes` | `notes` | Entity notes (threaded) |
| `googleCalendarSyncConfigs` | `google_calendar_sync_configs` | GCal sync state |

---

## Module: Gabinet (`convex/schema/gabinet.ts`)

| Convex table | PostgreSQL table | Notes |
|---|---|---|
| `gabinetPatients` | `gabinet_patients` | Patient registry |
| `gabinetTreatments` | `gabinet_treatments` | Treatment catalog |
| `gabinetTreatmentVariants` | `gabinet_treatment_variants` | Treatment variants (price/duration) |
| `gabinetWorkingHours` | `gabinet_working_hours` | Org-level opening hours |
| `gabinetEmployeeSchedules` | `gabinet_employee_schedules` | Per-employee schedules |
| `gabinetLeaves` | `gabinet_leaves` | Leave requests |
| `gabinetOvertime` | `gabinet_overtime` | Overtime records |
| `gabinetEmployees` | `gabinet_employees` | Staff with HR data |
| `gabinetLeaveTypes` | `gabinet_leave_types` | Leave type taxonomy |
| `gabinetLeaveBalances` | `gabinet_leave_balances` | Accrual balances per employee/year |
| `gabinetAppointments` | `gabinet_appointments` | Appointment calendar |
| `gabinetTreatmentPackages` | `gabinet_treatment_packages` | Pre-paid treatment bundles |
| `gabinetPackageUsage` | `gabinet_package_usage` | Per-patient package instances |
| `gabinetLoyaltyPoints` | `gabinet_loyalty_points` | Loyalty balance per patient |
| `gabinetLoyaltyTransactions` | `gabinet_loyalty_transactions` | Loyalty point ledger |
| `gabinetDocumentTemplates` | `gabinet_document_templates` | Legacy consent templates |
| `gabinetDocuments` | `gabinet_documents` | Generated patient documents |
| `documentTemplates` | `document_templates` | Cross-module template engine |
| `documentTemplateFields` | `document_template_fields` | Field definitions per template |
| `documentInstances` | `document_instances` | Rendered/signed instances |
| `signatureRequests` | `signature_requests` | Signing tokens |
| `orgSmsConfig` | `org_sms_config` | SMS provider configuration |
| `appointmentSmsEvents` | `appointment_sms_events` | SMS delivery/reply log |
| `gabinetPortalSessions` | `gabinet_portal_sessions` | Patient self-service portal sessions |
| `appointmentReminders` | `appointment_reminders` | Scheduled reminder jobs |
| `appointmentWorkflowHistory` | `appointment_workflow_history` | Workflow execution log |
| `gabinetLocations` | `gabinet_locations` | Physical clinic locations |
| `gabinetRooms` | `gabinet_rooms` | Rooms within locations |
| `gabinetEquipment` | `gabinet_equipment` | Equipment inventory |
| `gabinetEquipmentTransfers` | `gabinet_equipment_transfers` | Equipment movement log |

---

## Module: Automation (`convex/schema/automation.ts`)

| Convex table | PostgreSQL table | Notes |
|---|---|---|
| `automationRules` | `automation_rules` | Rule definitions with graph/actions |
| `automationRuns` | `automation_runs` | Execution instances |
| `automationRunSteps` | `automation_run_steps` | Per-action step log |

---

## Module: Documents (`convex/schema/documents.ts`)

| Convex table | PostgreSQL table | Notes |
|---|---|---|
| `formTemplates` | `form_templates` | PDFme / TipTap form templates |
| `formDocuments` | `form_documents` | Filled form instances |

---

## Module: Tags & Categories (`convex/schema.ts` inline)

| Convex table | PostgreSQL table | Notes |
|---|---|---|
| `tagDefinitions` | `tag_definitions` | Org-wide color tags |
| `categoryDefinitions` | `category_definitions` | Hierarchical entity categories |

---

## Table Count Summary

| Module | Count |
|---|---|
| Auth (authTables) | 4 |
| Platform | 14 |
| Organizations core | 8 |
| CRM core | 22 |
| Email module | 6 |
| OAuth & Calendar | 3 |
| Gabinet | 27 |
| Automation | 3 |
| Documents (forms) | 2 |
| Tags & Categories | 2 |
| **Total** | **91** |

---

## Key Design Decisions

### IDs as TEXT (not UUID)
Convex generates its own base62 string IDs. Using `TEXT` preserves backward compatibility if Convex data is ever migrated directly. A UUID alternative would require generating new IDs for every row.

### Timestamps as BIGINT
Convex stores all timestamps as JavaScript `Date.getTime()` — milliseconds since epoch. Converting to `TIMESTAMPTZ` in PostgreSQL would require a migration transformer. `BIGINT` preserves exact values without precision loss.

### JSONB for complex objects
Fields like `config`, `metadata`, `conditions`, `actions`, `graph`, and `signatures` are stored as `JSONB`. This mirrors the Convex schema's use of `v.object({...})` and `v.any()`, and enables PostgreSQL's native JSON operators for queries.

### Arrays
Convex `v.array(v.string())` and `v.array(v.id(...))` are stored as PostgreSQL `TEXT[]`. JSONB arrays are used only for arrays of complex objects.

### Search indexes → GIN on tsvector
Convex's `searchIndex` with `searchField` is translated to a `TSVECTOR GENERATED ALWAYS AS (...) STORED` column with a `GIN` index. The `to_tsvector('simple', ...)` function is used to preserve flexibility across languages (the CRM supports Polish).

### RLS via session variable
Row Level Security policies use `current_setting('app.current_organization_id', true)` rather than JWT claims, enabling both:
- Application-layer auth (set via `SET LOCAL`)
- Supabase RLS JWT claims (swap to `auth.uid()` or JWT custom claims)

### Forward-reference FKs
Three circular reference chains required deferred `ALTER TABLE ... ADD CONSTRAINT` statements at the bottom of the file:
1. `emails` → `gabinet_patients`, `gabinet_appointments`, `gabinet_employees`
2. `payments` → `gabinet_patients`, `gabinet_appointments`, `gabinet_package_usage`
3. `gabinet_appointments` → `gabinet_package_usage`
4. `auth_accounts` → `users`

### Enum types
All Convex `v.union(v.literal(...))` with stable value sets are defined as PostgreSQL `ENUM` types at the top of the file. This provides type safety, storage efficiency, and discoverability. The one exception is `activityType` (`v.string()` in Convex) which remains `TEXT` to allow dynamic values.
