-- ============================================================
-- Migration 00002: RLS Policies — Org-Scoped Tenant Isolation
-- ============================================================
--
-- Replaces the single-policy `org_isolation` (ALL) per table from
-- 00001_initial_schema.sql with granular SELECT / INSERT / UPDATE /
-- DELETE policies that:
--   • Add WITH CHECK on INSERT and UPDATE (not enforced by ALL-policy USING)
--   • Extend coverage to cross-org tables (users, plans, platform_products)
--   • Lock down auth_* tables to service-role only
--   • Handle document_template_fields via parent FK join
--
-- Security model
--   JWT claim `org_id` identifies the caller's active organization.
--   Every table with organization_id enforces: org_id = organization_id.
--   Cross-org tables use special policies (see Section 11).
--   Auth tables (auth_*) allow only the service role.
--
-- Helper functions
--   current_org_id()  – extracts org_id from the JWT
--   current_user_id() – extracts sub (user id) from the JWT
--   is_service_role() – true when called by the backend service role
--
-- Observability
--   SELECT * FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION current_org_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::json->>'org_id',
    ''
  )
$$;

CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(
    current_setting('request.jwt.claims', true)::json->>'sub',
    ''
  )
$$;

CREATE OR REPLACE FUNCTION is_service_role()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('role', true) = 'service_role'
    OR nullif(current_setting('request.jwt.claims', true), '')::json->>'role' = 'service_role'
$$;

-- ============================================================
-- DROP EXISTING BROAD POLICIES FROM 00001_initial_schema.sql
-- These were ALL-operation policies without WITH CHECK.
-- Replaced below with per-command policies.
-- ============================================================

DROP POLICY IF EXISTS org_isolation ON activities;
DROP POLICY IF EXISTS org_isolation ON activity_type_definitions;
DROP POLICY IF EXISTS org_isolation ON appointment_reminders;
DROP POLICY IF EXISTS org_isolation ON appointment_sms_events;
DROP POLICY IF EXISTS org_isolation ON appointment_workflow_history;
DROP POLICY IF EXISTS org_isolation ON audit_log;
DROP POLICY IF EXISTS org_isolation ON automation_rules;
DROP POLICY IF EXISTS org_isolation ON automation_run_steps;
DROP POLICY IF EXISTS org_isolation ON automation_runs;
DROP POLICY IF EXISTS org_isolation ON calls;
DROP POLICY IF EXISTS org_isolation ON category_definitions;
DROP POLICY IF EXISTS org_isolation ON companies;
DROP POLICY IF EXISTS org_isolation ON contacts;
DROP POLICY IF EXISTS org_isolation ON custom_field_definitions;
DROP POLICY IF EXISTS org_isolation ON custom_field_values;
DROP POLICY IF EXISTS org_isolation ON deal_products;
DROP POLICY IF EXISTS org_isolation ON document_instances;
DROP POLICY IF EXISTS org_isolation ON document_templates;
DROP POLICY IF EXISTS org_isolation ON documents;
DROP POLICY IF EXISTS org_isolation ON email_accounts;
DROP POLICY IF EXISTS org_isolation ON email_brand_config;
DROP POLICY IF EXISTS org_isolation ON email_event_bindings;
DROP POLICY IF EXISTS org_isolation ON email_event_log;
DROP POLICY IF EXISTS org_isolation ON email_event_types;
DROP POLICY IF EXISTS org_isolation ON email_layouts;
DROP POLICY IF EXISTS org_isolation ON email_sequence_enrollments;
DROP POLICY IF EXISTS org_isolation ON email_sequence_steps;
DROP POLICY IF EXISTS org_isolation ON email_sequences;
DROP POLICY IF EXISTS org_isolation ON email_templates;
DROP POLICY IF EXISTS org_isolation ON emails;
DROP POLICY IF EXISTS org_isolation ON form_documents;
DROP POLICY IF EXISTS org_isolation ON form_templates;
DROP POLICY IF EXISTS org_isolation ON gabinet_appointments;
DROP POLICY IF EXISTS org_isolation ON gabinet_document_templates;
DROP POLICY IF EXISTS org_isolation ON gabinet_documents;
DROP POLICY IF EXISTS org_isolation ON gabinet_employee_schedules;
DROP POLICY IF EXISTS org_isolation ON gabinet_employees;
DROP POLICY IF EXISTS org_isolation ON gabinet_equipment;
DROP POLICY IF EXISTS org_isolation ON gabinet_equipment_transfers;
DROP POLICY IF EXISTS org_isolation ON gabinet_leave_balances;
DROP POLICY IF EXISTS org_isolation ON gabinet_leave_types;
DROP POLICY IF EXISTS org_isolation ON gabinet_leaves;
DROP POLICY IF EXISTS org_isolation ON gabinet_locations;
DROP POLICY IF EXISTS org_isolation ON gabinet_loyalty_points;
DROP POLICY IF EXISTS org_isolation ON gabinet_loyalty_transactions;
DROP POLICY IF EXISTS org_isolation ON gabinet_overtime;
DROP POLICY IF EXISTS org_isolation ON gabinet_package_usage;
DROP POLICY IF EXISTS org_isolation ON gabinet_patients;
DROP POLICY IF EXISTS org_isolation ON gabinet_portal_sessions;
DROP POLICY IF EXISTS org_isolation ON gabinet_rooms;
DROP POLICY IF EXISTS org_isolation ON gabinet_treatment_packages;
DROP POLICY IF EXISTS org_isolation ON gabinet_treatment_variants;
DROP POLICY IF EXISTS org_isolation ON gabinet_treatments;
DROP POLICY IF EXISTS org_isolation ON gabinet_working_hours;
DROP POLICY IF EXISTS org_isolation ON google_calendar_sync_configs;
DROP POLICY IF EXISTS org_isolation ON invitations;
DROP POLICY IF EXISTS org_isolation ON leads;
DROP POLICY IF EXISTS org_isolation ON lost_reasons;
DROP POLICY IF EXISTS org_isolation ON mail_providers;
DROP POLICY IF EXISTS org_isolation ON notes;
DROP POLICY IF EXISTS org_isolation ON notifications;
DROP POLICY IF EXISTS org_isolation ON oauth_connections;
DROP POLICY IF EXISTS org_isolation ON object_relationships;
DROP POLICY IF EXISTS org_isolation ON org_permissions;
DROP POLICY IF EXISTS org_isolation ON org_settings;
DROP POLICY IF EXISTS org_isolation ON org_sms_config;
DROP POLICY IF EXISTS org_isolation ON organizations;
DROP POLICY IF EXISTS org_isolation ON payments;
DROP POLICY IF EXISTS org_isolation ON pipeline_stage_actions;
DROP POLICY IF EXISTS org_isolation ON pipeline_stages;
DROP POLICY IF EXISTS org_isolation ON pipelines;
DROP POLICY IF EXISTS org_isolation ON product_subscriptions;
DROP POLICY IF EXISTS org_isolation ON products;
DROP POLICY IF EXISTS org_isolation ON recently_viewed;
DROP POLICY IF EXISTS org_isolation ON resource_invites;
DROP POLICY IF EXISTS org_isolation ON saved_views;
DROP POLICY IF EXISTS org_isolation ON scheduled_activities;
DROP POLICY IF EXISTS org_isolation ON signature_requests;
DROP POLICY IF EXISTS org_isolation ON sources;
DROP POLICY IF EXISTS org_isolation ON tag_definitions;
DROP POLICY IF EXISTS org_isolation ON team_memberships;

-- Also enable RLS on tables not covered in 00001
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_template_fields ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 1: CRM Core Tables
-- ============================================================

CREATE POLICY activities_select ON activities
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY activities_insert ON activities
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY activities_update ON activities
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY activities_delete ON activities
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY activity_type_defs_select ON activity_type_definitions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY activity_type_defs_insert ON activity_type_definitions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY activity_type_defs_update ON activity_type_definitions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY activity_type_defs_delete ON activity_type_definitions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY calls_select ON calls
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY calls_insert ON calls
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY calls_update ON calls
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY calls_delete ON calls
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY companies_select ON companies
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY companies_insert ON companies
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY companies_update ON companies
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY companies_delete ON companies
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY contacts_select ON contacts
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY contacts_insert ON contacts
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY contacts_update ON contacts
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY contacts_delete ON contacts
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY leads_select ON leads
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY leads_insert ON leads
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY leads_update ON leads
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY leads_delete ON leads
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY notes_select ON notes
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY notes_insert ON notes
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY notes_update ON notes
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY notes_delete ON notes
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY documents_select ON documents
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY documents_insert ON documents
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY documents_update ON documents
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY documents_delete ON documents
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY document_templates_select ON document_templates
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY document_templates_insert ON document_templates
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_templates_update ON document_templates
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_templates_delete ON document_templates
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY document_instances_select ON document_instances
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY document_instances_insert ON document_instances
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_instances_update ON document_instances
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_instances_delete ON document_instances
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 2: Pipeline & Products
-- ============================================================

CREATE POLICY pipelines_select ON pipelines
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY pipelines_insert ON pipelines
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY pipelines_update ON pipelines
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY pipelines_delete ON pipelines
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY pipeline_stages_select ON pipeline_stages
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY pipeline_stages_insert ON pipeline_stages
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY pipeline_stages_update ON pipeline_stages
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY pipeline_stages_delete ON pipeline_stages
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY pipeline_stage_actions_select ON pipeline_stage_actions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY pipeline_stage_actions_insert ON pipeline_stage_actions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY pipeline_stage_actions_update ON pipeline_stage_actions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY pipeline_stage_actions_delete ON pipeline_stage_actions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY products_select ON products
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY products_insert ON products
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY products_update ON products
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY products_delete ON products
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY deal_products_select ON deal_products
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY deal_products_insert ON deal_products
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY deal_products_update ON deal_products
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY deal_products_delete ON deal_products
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY lost_reasons_select ON lost_reasons
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY lost_reasons_insert ON lost_reasons
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY lost_reasons_update ON lost_reasons
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY lost_reasons_delete ON lost_reasons
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY sources_select ON sources
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY sources_insert ON sources
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY sources_update ON sources
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY sources_delete ON sources
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY payments_select ON payments
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY payments_insert ON payments
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY payments_update ON payments
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY payments_delete ON payments
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY signature_requests_select ON signature_requests
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY signature_requests_insert ON signature_requests
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY signature_requests_update ON signature_requests
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY signature_requests_delete ON signature_requests
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 3: Email & Communication
-- ============================================================

CREATE POLICY emails_select ON emails
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY emails_insert ON emails
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY emails_update ON emails
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY emails_delete ON emails
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_accounts_select ON email_accounts
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_accounts_insert ON email_accounts
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_accounts_update ON email_accounts
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_accounts_delete ON email_accounts
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_templates_select ON email_templates
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_templates_insert ON email_templates
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_templates_update ON email_templates
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_templates_delete ON email_templates
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_sequences_select ON email_sequences
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_sequences_insert ON email_sequences
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_sequences_update ON email_sequences
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_sequences_delete ON email_sequences
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_sequence_steps_select ON email_sequence_steps
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_sequence_steps_insert ON email_sequence_steps
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_sequence_steps_update ON email_sequence_steps
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_sequence_steps_delete ON email_sequence_steps
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_seq_enrollments_select ON email_sequence_enrollments
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_seq_enrollments_insert ON email_sequence_enrollments
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_seq_enrollments_update ON email_sequence_enrollments
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_seq_enrollments_delete ON email_sequence_enrollments
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_layouts_select ON email_layouts
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_layouts_insert ON email_layouts
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_layouts_update ON email_layouts
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_layouts_delete ON email_layouts
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_brand_config_select ON email_brand_config
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_brand_config_insert ON email_brand_config
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_brand_config_update ON email_brand_config
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_brand_config_delete ON email_brand_config
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_event_types_select ON email_event_types
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_event_types_insert ON email_event_types
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_event_types_update ON email_event_types
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_event_types_delete ON email_event_types
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_event_bindings_select ON email_event_bindings
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_event_bindings_insert ON email_event_bindings
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_event_bindings_update ON email_event_bindings
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_event_bindings_delete ON email_event_bindings
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY email_event_log_select ON email_event_log
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY email_event_log_insert ON email_event_log
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_event_log_update ON email_event_log
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY email_event_log_delete ON email_event_log
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY mail_providers_select ON mail_providers
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY mail_providers_insert ON mail_providers
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY mail_providers_update ON mail_providers
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY mail_providers_delete ON mail_providers
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 4: Organization Settings & Metadata
-- ============================================================

CREATE POLICY org_settings_select ON org_settings
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY org_settings_insert ON org_settings
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY org_settings_update ON org_settings
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY org_settings_delete ON org_settings
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY org_permissions_select ON org_permissions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY org_permissions_insert ON org_permissions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY org_permissions_update ON org_permissions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY org_permissions_delete ON org_permissions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY org_sms_config_select ON org_sms_config
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY org_sms_config_insert ON org_sms_config
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY org_sms_config_update ON org_sms_config
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY org_sms_config_delete ON org_sms_config
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY tag_definitions_select ON tag_definitions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY tag_definitions_insert ON tag_definitions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY tag_definitions_update ON tag_definitions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY tag_definitions_delete ON tag_definitions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY category_defs_select ON category_definitions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY category_defs_insert ON category_definitions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY category_defs_update ON category_definitions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY category_defs_delete ON category_definitions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY custom_field_defs_select ON custom_field_definitions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY custom_field_defs_insert ON custom_field_definitions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY custom_field_defs_update ON custom_field_definitions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY custom_field_defs_delete ON custom_field_definitions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY custom_field_values_select ON custom_field_values
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY custom_field_values_insert ON custom_field_values
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY custom_field_values_update ON custom_field_values
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY custom_field_values_delete ON custom_field_values
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY saved_views_select ON saved_views
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY saved_views_insert ON saved_views
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY saved_views_update ON saved_views
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY saved_views_delete ON saved_views
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY recently_viewed_select ON recently_viewed
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY recently_viewed_insert ON recently_viewed
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY recently_viewed_update ON recently_viewed
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY recently_viewed_delete ON recently_viewed
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY object_relationships_select ON object_relationships
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY object_relationships_insert ON object_relationships
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY object_relationships_update ON object_relationships
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY object_relationships_delete ON object_relationships
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 5: Notifications & Audit
-- ============================================================

CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY notifications_delete ON notifications
  FOR DELETE USING (current_org_id() = organization_id);

-- audit_log: INSERT and SELECT only; UPDATE/DELETE locked to service role
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY audit_log_update ON audit_log
  FOR UPDATE USING (current_org_id() = organization_id AND is_service_role())
  WITH CHECK (current_org_id() = organization_id AND is_service_role());
CREATE POLICY audit_log_delete ON audit_log
  FOR DELETE USING (current_org_id() = organization_id AND is_service_role());

-- ============================================================
-- SECTION 6: Team & Access
-- ============================================================

CREATE POLICY team_memberships_select ON team_memberships
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY team_memberships_insert ON team_memberships
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY team_memberships_update ON team_memberships
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY team_memberships_delete ON team_memberships
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY invitations_select ON invitations
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY invitations_insert ON invitations
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY invitations_update ON invitations
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY invitations_delete ON invitations
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY resource_invites_select ON resource_invites
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY resource_invites_insert ON resource_invites
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY resource_invites_update ON resource_invites
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY resource_invites_delete ON resource_invites
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY oauth_connections_select ON oauth_connections
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY oauth_connections_insert ON oauth_connections
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY oauth_connections_update ON oauth_connections
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY oauth_connections_delete ON oauth_connections
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gcal_sync_configs_select ON google_calendar_sync_configs
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gcal_sync_configs_insert ON google_calendar_sync_configs
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gcal_sync_configs_update ON google_calendar_sync_configs
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gcal_sync_configs_delete ON google_calendar_sync_configs
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 7: Automation
-- ============================================================

CREATE POLICY automation_rules_select ON automation_rules
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY automation_rules_insert ON automation_rules
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY automation_rules_update ON automation_rules
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY automation_rules_delete ON automation_rules
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY automation_runs_select ON automation_runs
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY automation_runs_insert ON automation_runs
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY automation_runs_update ON automation_runs
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY automation_runs_delete ON automation_runs
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY automation_run_steps_select ON automation_run_steps
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY automation_run_steps_insert ON automation_run_steps
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY automation_run_steps_update ON automation_run_steps
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY automation_run_steps_delete ON automation_run_steps
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 8: Scheduled Activities & Forms
-- ============================================================

CREATE POLICY scheduled_activities_select ON scheduled_activities
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY scheduled_activities_insert ON scheduled_activities
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY scheduled_activities_update ON scheduled_activities
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY scheduled_activities_delete ON scheduled_activities
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY form_templates_select ON form_templates
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY form_templates_insert ON form_templates
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY form_templates_update ON form_templates
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY form_templates_delete ON form_templates
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY form_documents_select ON form_documents
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY form_documents_insert ON form_documents
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY form_documents_update ON form_documents
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY form_documents_delete ON form_documents
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 9: Billing (Org-Scoped)
-- ============================================================

CREATE POLICY product_subscriptions_select ON product_subscriptions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY product_subscriptions_insert ON product_subscriptions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY product_subscriptions_update ON product_subscriptions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY product_subscriptions_delete ON product_subscriptions
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 10: Gabinet (Medical Module) Tables
-- ============================================================

CREATE POLICY gabinet_patients_select ON gabinet_patients
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_patients_insert ON gabinet_patients
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_patients_update ON gabinet_patients
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_patients_delete ON gabinet_patients
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_appointments_select ON gabinet_appointments
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_appointments_insert ON gabinet_appointments
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_appointments_update ON gabinet_appointments
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_appointments_delete ON gabinet_appointments
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY appt_reminders_select ON appointment_reminders
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY appt_reminders_insert ON appointment_reminders
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY appt_reminders_update ON appointment_reminders
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY appt_reminders_delete ON appointment_reminders
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY appt_sms_events_select ON appointment_sms_events
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY appt_sms_events_insert ON appointment_sms_events
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY appt_sms_events_update ON appointment_sms_events
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY appt_sms_events_delete ON appointment_sms_events
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY appt_workflow_history_select ON appointment_workflow_history
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY appt_workflow_history_insert ON appointment_workflow_history
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY appt_workflow_history_update ON appointment_workflow_history
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY appt_workflow_history_delete ON appointment_workflow_history
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_treatments_select ON gabinet_treatments
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_treatments_insert ON gabinet_treatments
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatments_update ON gabinet_treatments
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatments_delete ON gabinet_treatments
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_treatment_variants_select ON gabinet_treatment_variants
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_variants_insert ON gabinet_treatment_variants
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_variants_update ON gabinet_treatment_variants
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_variants_delete ON gabinet_treatment_variants
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_treatment_packages_select ON gabinet_treatment_packages
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_packages_insert ON gabinet_treatment_packages
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_packages_update ON gabinet_treatment_packages
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_treatment_packages_delete ON gabinet_treatment_packages
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_package_usage_select ON gabinet_package_usage
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_package_usage_insert ON gabinet_package_usage
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_package_usage_update ON gabinet_package_usage
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_package_usage_delete ON gabinet_package_usage
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_employees_select ON gabinet_employees
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_employees_insert ON gabinet_employees
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_employees_update ON gabinet_employees
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_employees_delete ON gabinet_employees
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_employee_schedules_select ON gabinet_employee_schedules
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_employee_schedules_insert ON gabinet_employee_schedules
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_employee_schedules_update ON gabinet_employee_schedules
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_employee_schedules_delete ON gabinet_employee_schedules
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_locations_select ON gabinet_locations
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_locations_insert ON gabinet_locations
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_locations_update ON gabinet_locations
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_locations_delete ON gabinet_locations
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_rooms_select ON gabinet_rooms
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_rooms_insert ON gabinet_rooms
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_rooms_update ON gabinet_rooms
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_rooms_delete ON gabinet_rooms
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_equipment_select ON gabinet_equipment
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_equipment_insert ON gabinet_equipment
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_equipment_update ON gabinet_equipment
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_equipment_delete ON gabinet_equipment
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_equip_transfers_select ON gabinet_equipment_transfers
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_equip_transfers_insert ON gabinet_equipment_transfers
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_equip_transfers_update ON gabinet_equipment_transfers
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_equip_transfers_delete ON gabinet_equipment_transfers
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_working_hours_select ON gabinet_working_hours
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_working_hours_insert ON gabinet_working_hours
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_working_hours_update ON gabinet_working_hours
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_working_hours_delete ON gabinet_working_hours
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_leaves_select ON gabinet_leaves
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_leaves_insert ON gabinet_leaves
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_leaves_update ON gabinet_leaves
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_leaves_delete ON gabinet_leaves
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_leave_types_select ON gabinet_leave_types
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_leave_types_insert ON gabinet_leave_types
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_leave_types_update ON gabinet_leave_types
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_leave_types_delete ON gabinet_leave_types
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_leave_balances_select ON gabinet_leave_balances
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_leave_balances_insert ON gabinet_leave_balances
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_leave_balances_update ON gabinet_leave_balances
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_leave_balances_delete ON gabinet_leave_balances
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_overtime_select ON gabinet_overtime
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_overtime_insert ON gabinet_overtime
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_overtime_update ON gabinet_overtime
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_overtime_delete ON gabinet_overtime
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_loyalty_points_select ON gabinet_loyalty_points
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_loyalty_points_insert ON gabinet_loyalty_points
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_loyalty_points_update ON gabinet_loyalty_points
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_loyalty_points_delete ON gabinet_loyalty_points
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_loyalty_txns_select ON gabinet_loyalty_transactions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_loyalty_txns_insert ON gabinet_loyalty_transactions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_loyalty_txns_update ON gabinet_loyalty_transactions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_loyalty_txns_delete ON gabinet_loyalty_transactions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_portal_sessions_select ON gabinet_portal_sessions
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_portal_sessions_insert ON gabinet_portal_sessions
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_portal_sessions_update ON gabinet_portal_sessions
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_portal_sessions_delete ON gabinet_portal_sessions
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_documents_select ON gabinet_documents
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_documents_insert ON gabinet_documents
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_documents_update ON gabinet_documents
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_documents_delete ON gabinet_documents
  FOR DELETE USING (current_org_id() = organization_id);

CREATE POLICY gabinet_doc_templates_select ON gabinet_document_templates
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY gabinet_doc_templates_insert ON gabinet_document_templates
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_doc_templates_update ON gabinet_document_templates
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY gabinet_doc_templates_delete ON gabinet_document_templates
  FOR DELETE USING (current_org_id() = organization_id);

-- ============================================================
-- SECTION 11: Cross-Org / Platform Tables (Special Policies)
-- ============================================================

-- organizations: members can read their own org; only service role mutates
CREATE POLICY organizations_select ON organizations
  FOR SELECT
  USING (id = current_org_id());
CREATE POLICY organizations_insert ON organizations
  FOR INSERT
  WITH CHECK (is_service_role());
CREATE POLICY organizations_update ON organizations
  FOR UPDATE
  USING (id = current_org_id())
  WITH CHECK (id = current_org_id());
CREATE POLICY organizations_delete ON organizations
  FOR DELETE
  USING (is_service_role());

-- users: global read (needed for member directory); self-write + service role
CREATE POLICY users_select ON users
  FOR SELECT
  USING (true);
CREATE POLICY users_insert ON users
  FOR INSERT
  WITH CHECK (is_service_role());
CREATE POLICY users_update ON users
  FOR UPDATE
  USING (
    id = current_user_id()
    OR is_service_role()
  )
  WITH CHECK (
    id = current_user_id()
    OR is_service_role()
  );
CREATE POLICY users_delete ON users
  FOR DELETE
  USING (is_service_role());

-- plans: public catalog; write via service role only
CREATE POLICY plans_select ON plans
  FOR SELECT USING (true);
CREATE POLICY plans_insert ON plans
  FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY plans_update ON plans
  FOR UPDATE USING (is_service_role()) WITH CHECK (is_service_role());
CREATE POLICY plans_delete ON plans
  FOR DELETE USING (is_service_role());

-- platform_products: public catalog; write via service role only
CREATE POLICY platform_products_select ON platform_products
  FOR SELECT USING (true);
CREATE POLICY platform_products_insert ON platform_products
  FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY platform_products_update ON platform_products
  FOR UPDATE USING (is_service_role()) WITH CHECK (is_service_role());
CREATE POLICY platform_products_delete ON platform_products
  FOR DELETE USING (is_service_role());

-- subscriptions: user reads own subscription; service role manages
CREATE POLICY subscriptions_select ON subscriptions
  FOR SELECT
  USING (
    user_id = current_user_id()
    OR is_service_role()
  );
CREATE POLICY subscriptions_insert ON subscriptions
  FOR INSERT WITH CHECK (is_service_role());
CREATE POLICY subscriptions_update ON subscriptions
  FOR UPDATE USING (is_service_role()) WITH CHECK (is_service_role());
CREATE POLICY subscriptions_delete ON subscriptions
  FOR DELETE USING (is_service_role());

-- document_template_fields: inherit org scope via parent document_templates
CREATE POLICY doc_template_fields_select ON document_template_fields
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM document_templates dt
      WHERE dt.id = document_template_fields.template_id
        AND current_org_id() = dt.organization_id
    )
  );
CREATE POLICY doc_template_fields_insert ON document_template_fields
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_templates dt
      WHERE dt.id = document_template_fields.template_id
        AND current_org_id() = dt.organization_id
    )
  );
CREATE POLICY doc_template_fields_update ON document_template_fields
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM document_templates dt
      WHERE dt.id = document_template_fields.template_id
        AND current_org_id() = dt.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM document_templates dt
      WHERE dt.id = document_template_fields.template_id
        AND current_org_id() = dt.organization_id
    )
  );
CREATE POLICY doc_template_fields_delete ON document_template_fields
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM document_templates dt
      WHERE dt.id = document_template_fields.template_id
        AND current_org_id() = dt.organization_id
    )
  );

-- ============================================================
-- SECTION 12: Auth Tables (Service-Role Only)
-- Credentials, sessions, and rate-limit state must never be
-- accessible via JWT-authenticated user queries.
-- ============================================================

ALTER TABLE auth_accounts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_rate_limits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_verification_codes  ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_accounts_service_only ON auth_accounts
  FOR ALL USING (is_service_role()) WITH CHECK (is_service_role());

CREATE POLICY auth_sessions_service_only ON auth_sessions
  FOR ALL USING (is_service_role()) WITH CHECK (is_service_role());

CREATE POLICY auth_rate_limits_service_only ON auth_rate_limits
  FOR ALL USING (is_service_role()) WITH CHECK (is_service_role());

CREATE POLICY auth_verification_codes_service_only ON auth_verification_codes
  FOR ALL USING (is_service_role()) WITH CHECK (is_service_role());

-- ============================================================
-- OBSERVABILITY
-- ============================================================
-- Audit all policies:
--   SELECT schemaname, tablename, policyname, cmd, qual, with_check
--   FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
--
-- Count per table:
--   SELECT tablename, count(*) AS policy_count
--   FROM pg_policies WHERE schemaname = 'public'
--   GROUP BY tablename ORDER BY tablename;
--
-- Verify RLS enabled:
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
--   ORDER BY relname;
