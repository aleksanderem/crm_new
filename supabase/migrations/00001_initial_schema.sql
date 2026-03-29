-- =============================================================================
-- CRM + Gabinet Initial PostgreSQL Schema
-- Generated from Convex schema (convex/schema.ts + convex/schema/*.ts)
-- Migration: 00001_initial_schema.sql
-- =============================================================================
-- Conventions:
--   • All Convex IDs are TEXT (Convex generates random string IDs, not UUIDs)
--   • Timestamps are BIGINT (Convex stores milliseconds since epoch as number)
--   • Optional fields are nullable
--   • Arrays → TEXT[] or JSONB depending on content
--   • Nested objects → JSONB
--   • v.any() → JSONB
--   • Enums defined as PostgreSQL ENUM types where used in multiple tables,
--     else as TEXT CHECK constraints
--   • searchIndex → GIN index on tsvector column
--   • organizationId present on every tenant table → foundation for RLS
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE currency_enum AS ENUM ('usd', 'eur');
CREATE TYPE interval_enum AS ENUM ('month', 'year');
CREATE TYPE plan_key_enum AS ENUM ('free', 'pro');

CREATE TYPE org_role_enum AS ENUM ('owner', 'admin', 'member', 'viewer');

CREATE TYPE lead_status_enum AS ENUM ('open', 'won', 'lost', 'archived');
CREATE TYPE lead_priority_enum AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TYPE document_category_enum AS ENUM (
  'proposal', 'contract', 'invoice', 'presentation', 'report', 'other'
);
CREATE TYPE document_status_enum AS ENUM ('draft', 'sent', 'accepted', 'lost');

CREATE TYPE entity_type_enum AS ENUM (
  'contact', 'company', 'lead', 'document', 'activity',
  'gabinetPatient', 'gabinetTreatment', 'gabinetAppointment',
  'gabinetPackage', 'gabinetDocument', 'gabinetEmployee',
  'product', 'call', 'pipeline'
);

CREATE TYPE custom_field_type_enum AS ENUM (
  'text', 'number', 'date', 'select', 'multiSelect',
  'checkbox', 'url', 'email', 'phone', 'file'
);

CREATE TYPE activity_action_enum AS ENUM (
  'created', 'updated', 'deleted', 'note_added', 'stage_changed',
  'assigned', 'relationship_added', 'relationship_removed',
  'document_uploaded', 'status_changed', 'email_sent', 'email_received',
  'sms_sent', 'sms_received', 'package_assigned'
);

CREATE TYPE email_direction_enum AS ENUM ('inbound', 'outbound');

CREATE TYPE invitation_status_enum AS ENUM ('pending', 'accepted', 'declined', 'expired');

CREATE TYPE product_subscription_status_enum AS ENUM (
  'active', 'trialing', 'past_due', 'canceled', 'incomplete'
);

CREATE TYPE automation_module_enum AS ENUM ('crm', 'gabinet', 'platform');
CREATE TYPE automation_run_status_enum AS ENUM ('pending', 'processed', 'failed', 'skipped');
CREATE TYPE automation_step_status_enum AS ENUM ('pending', 'processed', 'failed', 'skipped');

CREATE TYPE gabinet_gender_enum AS ENUM ('male', 'female', 'other');
CREATE TYPE gabinet_leave_type_enum AS ENUM ('vacation', 'sick', 'personal', 'training', 'other');
CREATE TYPE gabinet_leave_status_enum AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE gabinet_employee_role_enum AS ENUM (
  'doctor', 'nurse', 'therapist', 'receptionist', 'admin', 'other'
);
CREATE TYPE gabinet_appointment_status_enum AS ENUM (
  'pending_confirmation', 'scheduled', 'confirmed',
  'in_progress', 'completed', 'cancelled', 'no_show'
);
CREATE TYPE gabinet_package_usage_status_enum AS ENUM (
  'active', 'completed', 'expired', 'cancelled'
);
CREATE TYPE gabinet_loyalty_tier_enum AS ENUM ('bronze', 'silver', 'gold', 'platinum');
CREATE TYPE gabinet_loyalty_tx_type_enum AS ENUM ('earn', 'spend', 'adjust', 'expire');
CREATE TYPE gabinet_doc_type_enum AS ENUM (
  'consent', 'medical_record', 'prescription', 'referral', 'custom'
);
CREATE TYPE gabinet_doc_status_enum AS ENUM (
  'draft', 'pending_signature', 'signed', 'archived'
);

CREATE TYPE appointment_sms_direction_enum AS ENUM ('inbound', 'outbound');
CREATE TYPE appointment_sms_intent_enum AS ENUM ('confirm', 'cancel', 'unknown');
CREATE TYPE appointment_sms_processing_status_enum AS ENUM (
  'pending', 'processed', 'ignored', 'failed'
);
CREATE TYPE appointment_workflow_event_enum AS ENUM ('appointment_created');
CREATE TYPE appointment_workflow_channel_enum AS ENUM ('email', 'sms');
CREATE TYPE appointment_workflow_status_enum AS ENUM (
  'pending', 'sent', 'failed', 'skipped'
);

CREATE TYPE call_outcome_enum AS ENUM (
  'busy', 'leftVoiceMessage', 'movedConversationForward', 'wrongNumber', 'noAnswer'
);

CREATE TYPE payment_method_enum AS ENUM ('cash', 'card', 'transfer', 'other');
CREATE TYPE payment_status_enum AS ENUM ('pending', 'completed', 'refunded', 'cancelled');

CREATE TYPE mail_provider_type_enum AS ENUM ('google', 'microsoft', 'mailgun', 'resend');
CREATE TYPE mail_provider_status_enum AS ENUM ('active', 'inactive', 'error', 'pending_auth');

CREATE TYPE sms_provider_enum AS ENUM ('smsapi', 'twilio');

CREATE TYPE email_event_status_enum AS ENUM ('pending', 'sent', 'failed', 'skipped');
CREATE TYPE email_sequence_enrollment_status_enum AS ENUM ('active', 'cancelled', 'completed');

CREATE TYPE document_template_category_enum AS ENUM (
  'contract', 'invoice', 'consent', 'referral', 'prescription',
  'report', 'protocol', 'custom'
);
CREATE TYPE document_instance_status_enum AS ENUM (
  'draft', 'pending_review', 'approved', 'pending_signature', 'signed', 'archived'
);
CREATE TYPE signature_request_status_enum AS ENUM ('pending', 'signed', 'expired');
CREATE TYPE verification_method_enum AS ENUM ('click', 'sms', 'email_otp');

CREATE TYPE form_category_enum AS ENUM (
  'consent', 'medical_record', 'prescription', 'referral',
  'contract', 'invoice', 'protocol', 'intake', 'custom'
);
CREATE TYPE form_document_status_enum AS ENUM (
  'draft', 'pending_signature', 'signed', 'completed', 'expired', 'voided'
);
CREATE TYPE signature_method_enum AS ENUM ('click', 'sms', 'email_otp', 'draw');
CREATE TYPE signer_role_enum AS ENUM ('client', 'patient', 'employee', 'external');

CREATE TYPE gabinet_employment_type_enum AS ENUM (
  'umowa_o_prace', 'umowa_zlecenie', 'b2b', 'staz'
);
CREATE TYPE gabinet_equipment_status_enum AS ENUM (
  'available', 'in_use', 'maintenance', 'retired'
);

CREATE TYPE resource_invite_access_enum AS ENUM ('viewer', 'editor');
CREATE TYPE resource_invite_status_enum AS ENUM ('pending', 'accepted', 'revoked');

CREATE TYPE oauth_provider_enum AS ENUM ('google');
CREATE TYPE user_theme_enum AS ENUM ('light', 'dark', 'system');

CREATE TYPE gc_sync_status_enum AS ENUM ('idle', 'syncing', 'error');
CREATE TYPE gc_visibility_enum AS ENUM ('full', 'busy_only', 'hidden');
CREATE TYPE gc_target_module_enum AS ENUM ('crm', 'gabinet');
CREATE TYPE scheduled_activity_source_type_enum AS ENUM ('manual', 'google', 'system');


-- =============================================================================
-- 1. @convex-dev/auth tables (authTables)
--    Convex auth ships: users, sessions, accounts, verificationCodes, etc.
--    We define a minimal compatible set. Convex's own users table is extended
--    in platform.ts, so we unify them here.
-- =============================================================================

-- Auth accounts (from @convex-dev/auth)
CREATE TABLE auth_accounts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,                        -- FK → users.id  (may be null before linking)
  provider      TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  secret        TEXT,                        -- hashed password or token
  email         TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone         TEXT,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  profile       JSONB,                       -- provider-specific profile blob
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    BIGINT,
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

CREATE UNIQUE INDEX auth_accounts_provider_id_idx ON auth_accounts (provider, provider_id);
CREATE INDEX auth_accounts_user_id_idx ON auth_accounts (user_id);
CREATE INDEX auth_accounts_email_idx ON auth_accounts (email);

-- Auth sessions
CREATE TABLE auth_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  expires_at    BIGINT NOT NULL,
  created_at    BIGINT NOT NULL
);

CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);

-- Auth verification codes (email / phone OTP)
CREATE TABLE auth_verification_codes (
  id            TEXT PRIMARY KEY,
  account_id    TEXT,
  email         TEXT,
  phone         TEXT,
  code          TEXT NOT NULL,
  method        TEXT NOT NULL,
  expires_at    BIGINT NOT NULL,
  used_at       BIGINT,
  created_at    BIGINT NOT NULL
);

CREATE INDEX auth_verification_codes_email_idx ON auth_verification_codes (email);

-- Auth rate limits
CREATE TABLE auth_rate_limits (
  id            TEXT PRIMARY KEY,
  identifier    TEXT NOT NULL,
  action        TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  window_start  BIGINT NOT NULL,
  created_at    BIGINT NOT NULL
);

CREATE UNIQUE INDEX auth_rate_limits_identifier_action_idx ON auth_rate_limits (identifier, action);


-- =============================================================================
-- 2. PLATFORM TABLES (platform.ts + authTables users extension)
-- =============================================================================

-- users  (merged: authTables base + platform extension)
CREATE TABLE users (
  id                       TEXT PRIMARY KEY,
  name                     TEXT,
  username                 TEXT,
  image_storage_id         TEXT,                    -- Convex storage ref
  image                    TEXT,
  email                    TEXT,
  email_verification_time  BIGINT,
  phone                    TEXT,
  phone_verification_time  BIGINT,
  is_anonymous             BOOLEAN,
  customer_id              TEXT,
  language                 TEXT,
  theme                    user_theme_enum,
  timezone                 TEXT,
  created_at               BIGINT,
  updated_at               BIGINT
);

CREATE INDEX users_email_idx ON users (email);
CREATE INDEX users_customer_id_idx ON users (customer_id);

-- plans
CREATE TABLE plans (
  id          TEXT PRIMARY KEY,
  key         plan_key_enum NOT NULL,
  stripe_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  seat_limit  INTEGER NOT NULL,
  prices      JSONB NOT NULL   -- { month: { usd: {...}, eur: {...} }, year: {...} }
);

CREATE UNIQUE INDEX plans_key_idx ON plans (key);
CREATE UNIQUE INDEX plans_stripe_id_idx ON plans (stripe_id);

-- subscriptions  (user-level plan subscriptions via Stripe)
CREATE TABLE subscriptions (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id              TEXT NOT NULL REFERENCES plans(id),
  price_stripe_id      TEXT NOT NULL,
  stripe_id            TEXT NOT NULL,
  currency             currency_enum NOT NULL,
  interval             interval_enum NOT NULL,
  status               TEXT NOT NULL,
  current_period_start BIGINT NOT NULL,
  current_period_end   BIGINT NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions (user_id);
CREATE UNIQUE INDEX subscriptions_stripe_id_idx ON subscriptions (stripe_id);

-- platform_products  (module products available for org subscription)
CREATE TABLE platform_products (
  id                TEXT PRIMARY KEY,
  product_id        TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL,
  prices            JSONB NOT NULL,   -- { month: { usd, eur }, year: { usd, eur } }
  stripe_product_id TEXT,
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL
);

CREATE UNIQUE INDEX platform_products_product_id_idx ON platform_products (product_id);
CREATE INDEX platform_products_stripe_product_id_idx ON platform_products (stripe_product_id);

-- =============================================================================
-- 3. ORGANIZATIONS (crm.ts — core multi-tenant anchor)
-- =============================================================================

CREATE TABLE organizations (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  owner_id              TEXT NOT NULL REFERENCES users(id),
  logo                  TEXT,
  website               TEXT,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  onboarding_completed  BOOLEAN
);

CREATE UNIQUE INDEX organizations_slug_idx ON organizations (slug);
CREATE INDEX organizations_owner_id_idx ON organizations (owner_id);

-- product_subscriptions  (per-org module subscriptions)
CREATE TABLE product_subscriptions (
  id                      TEXT PRIMARY KEY,
  organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id              TEXT NOT NULL,
  stripe_subscription_id  TEXT,
  status                  product_subscription_status_enum NOT NULL,
  current_period_start    BIGINT,
  current_period_end      BIGINT,
  cancel_at_period_end    BOOLEAN NOT NULL,
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL
);

CREATE INDEX product_subscriptions_org_idx ON product_subscriptions (organization_id);
CREATE UNIQUE INDEX product_subscriptions_org_product_idx ON product_subscriptions (organization_id, product_id);
CREATE INDEX product_subscriptions_stripe_sub_id_idx ON product_subscriptions (stripe_subscription_id);

-- team_memberships
CREATE TABLE team_memberships (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            org_role_enum NOT NULL,
  invited_by      TEXT REFERENCES users(id),
  joined_at       BIGINT NOT NULL
);

CREATE INDEX team_memberships_user_id_idx ON team_memberships (user_id);
CREATE INDEX team_memberships_org_id_idx ON team_memberships (organization_id);
CREATE UNIQUE INDEX team_memberships_org_user_idx ON team_memberships (organization_id, user_id);

-- org_settings
CREATE TABLE org_settings (
  id                           TEXT PRIMARY KEY,
  organization_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  allow_custom_lost_reason     BOOLEAN NOT NULL,
  lost_reason_required         BOOLEAN NOT NULL,
  default_currency             TEXT,
  timezone                     TEXT,
  resource_sharing_enabled     BOOLEAN,
  reminder_enabled             BOOLEAN,
  reminder_hours_before        INTEGER,
  appointment_workflow_config  TEXT,
  created_at                   BIGINT NOT NULL,
  updated_at                   BIGINT NOT NULL
);

CREATE UNIQUE INDEX org_settings_org_id_idx ON org_settings (organization_id);

-- org_permissions  (RBAC permission overrides per role)
CREATE TABLE org_permissions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('member', 'viewer')),
  permissions     JSONB NOT NULL,
  updated_by      TEXT NOT NULL REFERENCES users(id),
  updated_at      BIGINT NOT NULL
);

CREATE INDEX org_permissions_org_id_idx ON org_permissions (organization_id);
CREATE UNIQUE INDEX org_permissions_org_role_idx ON org_permissions (organization_id, role);

-- invitations
CREATE TABLE invitations (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            org_role_enum NOT NULL,
  token           TEXT NOT NULL,
  status          invitation_status_enum NOT NULL,
  invited_by      TEXT NOT NULL REFERENCES users(id),
  expires_at      BIGINT NOT NULL,
  accepted_at     BIGINT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX invitations_org_id_idx ON invitations (organization_id);
CREATE UNIQUE INDEX invitations_token_idx ON invitations (token);
CREATE INDEX invitations_email_org_idx ON invitations (email, organization_id);

-- resource_invites  (external guest access to specific resources)
CREATE TABLE resource_invites (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  user_id         TEXT REFERENCES users(id),
  resource_type   TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  access_level    resource_invite_access_enum NOT NULL,
  invited_by      TEXT NOT NULL REFERENCES users(id),
  token           TEXT NOT NULL,
  status          resource_invite_status_enum NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX resource_invites_org_id_idx ON resource_invites (organization_id);
CREATE UNIQUE INDEX resource_invites_token_idx ON resource_invites (token);
CREATE INDEX resource_invites_email_idx ON resource_invites (email);
CREATE INDEX resource_invites_resource_idx ON resource_invites (resource_type, resource_id);
CREATE INDEX resource_invites_org_resource_idx ON resource_invites (organization_id, resource_type, resource_id);

-- notifications
CREATE TABLE notifications (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  link            TEXT,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      BIGINT NOT NULL
);

CREATE INDEX notifications_user_created_at_idx ON notifications (user_id, created_at);
CREATE INDEX notifications_user_read_idx ON notifications (user_id, is_read, created_at);
CREATE INDEX notifications_org_id_idx ON notifications (organization_id);

-- audit_log
CREATE TABLE audit_log (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  action          TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       TEXT,
  details         TEXT,
  ip_address      TEXT,
  created_at      BIGINT NOT NULL
);

CREATE INDEX audit_log_org_created_at_idx ON audit_log (organization_id, created_at);
CREATE INDEX audit_log_org_action_idx ON audit_log (organization_id, action, created_at);
CREATE INDEX audit_log_org_user_idx ON audit_log (organization_id, user_id, created_at);

-- recently_viewed
CREATE TABLE recently_viewed (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  entity_label    TEXT NOT NULL,
  viewed_at       BIGINT NOT NULL
);

CREATE INDEX recently_viewed_user_type_idx ON recently_viewed (organization_id, user_id, entity_type, viewed_at);
CREATE INDEX recently_viewed_entity_idx ON recently_viewed (entity_id);

-- =============================================================================
-- 4. TAGS & CATEGORIES (schema.ts tagAndCategoryTables)
-- =============================================================================

CREATE TABLE tag_definitions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL,
  sort_order      INTEGER NOT NULL,
  is_deleted      BOOLEAN,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX tag_definitions_org_idx ON tag_definitions (organization_id);
CREATE UNIQUE INDEX tag_definitions_org_name_idx ON tag_definitions (organization_id, name);

CREATE TABLE category_definitions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     entity_type_enum NOT NULL,
  name            TEXT NOT NULL,
  parent_id       TEXT REFERENCES category_definitions(id),
  color           TEXT,
  icon            TEXT,
  sort_order      INTEGER NOT NULL,
  is_deleted      BOOLEAN,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX category_definitions_org_entity_idx ON category_definitions (organization_id, entity_type);
CREATE INDEX category_definitions_parent_idx ON category_definitions (parent_id);


-- =============================================================================
-- 5. CRM CORE TABLES
-- =============================================================================

-- contacts
CREATE TABLE contacts (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL,
  last_name       TEXT,
  email           TEXT,
  phone           TEXT,
  title           TEXT,
  avatar_url      TEXT,
  notes           TEXT,
  tags            TEXT[],
  tag_ids         TEXT[],
  category_id     TEXT REFERENCES category_definitions(id),
  source          TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  -- Full-text search vector
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
  ) STORED
);

CREATE INDEX contacts_org_idx ON contacts (organization_id);
CREATE INDEX contacts_org_email_idx ON contacts (organization_id, email);
CREATE INDEX contacts_search_idx ON contacts USING GIN (search_vector);

-- companies
CREATE TABLE companies (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  domain          TEXT,
  industry        TEXT,
  size            TEXT,
  website         TEXT,
  phone           TEXT,
  address         JSONB,   -- { street, city, state, zip, country }
  notes           TEXT,
  tags            TEXT[],
  tag_ids         TEXT[],
  category_id     TEXT REFERENCES category_definitions(id),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(domain, ''))
  ) STORED
);

CREATE INDEX companies_org_idx ON companies (organization_id);
CREATE INDEX companies_org_domain_idx ON companies (organization_id, domain);
CREATE INDEX companies_search_idx ON companies USING GIN (search_vector);

-- pipelines
CREATE TABLE pipelines (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  type            TEXT,
  is_default      BOOLEAN,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX pipelines_org_idx ON pipelines (organization_id);

-- pipeline_stages
CREATE TABLE pipeline_stages (
  id              TEXT PRIMARY KEY,
  pipeline_id     TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,
  "order"         INTEGER NOT NULL,
  is_won_stage    BOOLEAN,
  is_lost_stage   BOOLEAN,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX pipeline_stages_pipeline_order_idx ON pipeline_stages (pipeline_id, "order");
CREATE INDEX pipeline_stages_org_idx ON pipeline_stages (organization_id);

-- pipeline_stage_actions
CREATE TABLE pipeline_stage_actions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  action_type     TEXT NOT NULL CHECK (action_type = 'create_activity'),
  config          JSONB NOT NULL,  -- { activityTypeId, title, description, dueInDays, assignToOwner }
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX pipeline_stage_actions_stage_idx ON pipeline_stage_actions (stage_id);
CREATE INDEX pipeline_stage_actions_org_idx ON pipeline_stage_actions (organization_id);

-- leads  (deals)
CREATE TABLE leads (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  value               NUMERIC,
  currency            TEXT,
  status              lead_status_enum NOT NULL,
  priority            lead_priority_enum,
  expected_close_date BIGINT,
  source              TEXT,
  company_id          TEXT REFERENCES companies(id),
  assigned_to         TEXT REFERENCES users(id),
  pipeline_stage_id   TEXT REFERENCES pipeline_stages(id),
  stage_order         INTEGER,
  notes               TEXT,
  tags                TEXT[],
  tag_ids             TEXT[],
  category_id         TEXT REFERENCES category_definitions(id),
  won_at              BIGINT,
  lost_at             BIGINT,
  lost_reason         TEXT,
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL,
  search_vector       TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, ''))
  ) STORED
);

CREATE INDEX leads_org_idx ON leads (organization_id);
CREATE INDEX leads_org_status_idx ON leads (organization_id, status);
CREATE INDEX leads_pipeline_stage_order_idx ON leads (pipeline_stage_id, stage_order);
CREATE INDEX leads_assigned_to_idx ON leads (assigned_to);
CREATE INDEX leads_company_id_idx ON leads (company_id);
CREATE INDEX leads_search_idx ON leads USING GIN (search_vector);

-- documents  (CRM documents — proposals, contracts, etc.)
CREATE TABLE documents (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  file_id         TEXT,
  file_url        TEXT,
  mime_type       TEXT,
  file_size       BIGINT,
  category        document_category_enum,
  tags            TEXT[],
  tag_ids         TEXT[],
  category_id     TEXT REFERENCES category_definitions(id),
  status          document_status_enum,
  amount          NUMERIC,
  sent_at         BIGINT,
  accepted_at     BIGINT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, ''))
  ) STORED
);

CREATE INDEX documents_org_idx ON documents (organization_id);
CREATE INDEX documents_org_category_idx ON documents (organization_id, category);
CREATE INDEX documents_org_status_idx ON documents (organization_id, status);
CREATE INDEX documents_search_idx ON documents USING GIN (search_vector);

-- activity_type_definitions
CREATE TABLE activity_type_definitions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  name            TEXT NOT NULL,
  icon            TEXT NOT NULL,
  color           TEXT,
  is_system       BOOLEAN NOT NULL,
  "order"         INTEGER NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX activity_type_definitions_org_order_idx ON activity_type_definitions (organization_id, "order");
CREATE UNIQUE INDEX activity_type_definitions_org_key_idx ON activity_type_definitions (organization_id, key);

-- custom_field_definitions
CREATE TABLE custom_field_definitions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     entity_type_enum NOT NULL,
  name            TEXT NOT NULL,
  field_key       TEXT NOT NULL,
  field_type      custom_field_type_enum NOT NULL,
  options         TEXT[],
  is_required     BOOLEAN,
  "order"         INTEGER NOT NULL,
  "group"         TEXT,
  activity_type_key TEXT,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX custom_field_definitions_org_entity_order_idx ON custom_field_definitions (organization_id, entity_type, "order");
CREATE UNIQUE INDEX custom_field_definitions_org_key_idx ON custom_field_definitions (organization_id, entity_type, field_key);
CREATE INDEX custom_field_definitions_org_entity_activity_type_idx ON custom_field_definitions (organization_id, entity_type, activity_type_key, "order");

-- custom_field_values
CREATE TABLE custom_field_values (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  field_definition_id   TEXT NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  entity_type           entity_type_enum NOT NULL,
  entity_id             TEXT NOT NULL,
  value                 JSONB,
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL
);

CREATE INDEX custom_field_values_entity_idx ON custom_field_values (entity_type, entity_id);
CREATE INDEX custom_field_values_field_def_idx ON custom_field_values (field_definition_id);
CREATE UNIQUE INDEX custom_field_values_org_entity_field_idx ON custom_field_values (organization_id, entity_type, entity_id, field_definition_id);

-- object_relationships  (polymorphic M:N linking)
CREATE TABLE object_relationships (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type       TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  target_type       TEXT NOT NULL,
  target_id         TEXT NOT NULL,
  relationship_type TEXT,
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        BIGINT NOT NULL
);

CREATE INDEX object_relationships_source_idx ON object_relationships (source_type, source_id);
CREATE INDEX object_relationships_target_idx ON object_relationships (target_type, target_id);
CREATE INDEX object_relationships_org_idx ON object_relationships (organization_id);
CREATE INDEX object_relationships_source_target_idx ON object_relationships (organization_id, source_type, source_id, target_type);

-- activities  (timeline / audit stream)
CREATE TABLE activities (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  action          activity_action_enum NOT NULL,
  description     TEXT NOT NULL,
  metadata        JSONB,
  performed_by    TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL
);

CREATE INDEX activities_entity_idx ON activities (entity_type, entity_id);
CREATE INDEX activities_org_created_at_idx ON activities (organization_id, created_at);
CREATE INDEX activities_user_created_at_idx ON activities (performed_by, created_at);

-- notes
CREATE TABLE notes (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  is_pinned       BOOLEAN,
  parent_note_id  TEXT REFERENCES notes(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX notes_entity_idx ON notes (entity_type, entity_id);
CREATE INDEX notes_org_idx ON notes (organization_id);

-- products
CREATE TABLE products (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sku             TEXT NOT NULL,
  unit_price      NUMERIC NOT NULL,
  tax_rate        NUMERIC NOT NULL,
  is_active       BOOLEAN NOT NULL,
  description     TEXT,
  tag_ids         TEXT[],
  category_id     TEXT REFERENCES category_definitions(id),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, ''))
  ) STORED
);

CREATE INDEX products_org_idx ON products (organization_id);
CREATE UNIQUE INDEX products_org_sku_idx ON products (organization_id, sku);
CREATE INDEX products_search_idx ON products USING GIN (search_vector);

-- deal_products
CREATE TABLE deal_products (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  deal_id         TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id),
  quantity        NUMERIC NOT NULL,
  unit_price      NUMERIC NOT NULL,
  discount        NUMERIC,
  created_at      BIGINT NOT NULL
);

CREATE INDEX deal_products_deal_idx ON deal_products (deal_id);
CREATE INDEX deal_products_product_idx ON deal_products (product_id);
CREATE INDEX deal_products_org_idx ON deal_products (organization_id);

-- calls
CREATE TABLE calls (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outcome         call_outcome_enum NOT NULL,
  call_date       BIGINT NOT NULL,
  note            TEXT,
  duration        INTEGER,
  tag_ids         TEXT[],
  category_id     TEXT REFERENCES category_definitions(id),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX calls_org_idx ON calls (organization_id);
CREATE INDEX calls_org_date_idx ON calls (organization_id, call_date);
CREATE INDEX calls_org_outcome_idx ON calls (organization_id, outcome);

-- lost_reasons
CREATE TABLE lost_reasons (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  "order"         INTEGER NOT NULL,
  is_active       BOOLEAN NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX lost_reasons_org_idx ON lost_reasons (organization_id);

-- sources
CREATE TABLE sources (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  "order"         INTEGER NOT NULL,
  is_active       BOOLEAN NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX sources_org_idx ON sources (organization_id);

-- saved_views
CREATE TABLE saved_views (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  name            TEXT NOT NULL,
  filters         JSONB,
  columns         TEXT[],
  sort_field      TEXT,
  sort_direction  TEXT,
  is_default      BOOLEAN,
  is_system       BOOLEAN NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  "order"         INTEGER NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX saved_views_org_entity_type_idx ON saved_views (organization_id, entity_type);

-- =============================================================================
-- 6. EMAIL MODULE
-- =============================================================================

-- email_templates
CREATE TABLE email_templates (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  subject          TEXT NOT NULL,
  body             TEXT NOT NULL,
  content_json     TEXT,
  rendered_html    TEXT,
  slug             TEXT,
  category         TEXT,
  module           TEXT,
  event_type       TEXT,
  is_system        BOOLEAN,
  locale           TEXT,
  required_sources TEXT[],
  variables        JSONB NOT NULL,   -- [{ key, label, source }]
  created_by       TEXT NOT NULL REFERENCES users(id),
  is_active        BOOLEAN NOT NULL,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE INDEX email_templates_org_idx ON email_templates (organization_id);
CREATE INDEX email_templates_org_active_idx ON email_templates (organization_id, is_active);
CREATE INDEX email_templates_org_module_idx ON email_templates (organization_id, module);
CREATE INDEX email_templates_org_slug_locale_idx ON email_templates (organization_id, slug, locale);

-- email_layouts
CREATE TABLE email_layouts (
  id                       TEXT PRIMARY KEY,
  organization_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  header_blocks            TEXT NOT NULL,
  footer_blocks            TEXT NOT NULL,
  background_color         TEXT NOT NULL,
  content_background_color TEXT NOT NULL,
  primary_color            TEXT NOT NULL,
  logo_url                 TEXT,
  company_name             TEXT,
  footer_text              TEXT,
  updated_by               TEXT NOT NULL REFERENCES users(id),
  updated_at               BIGINT NOT NULL
);

CREATE UNIQUE INDEX email_layouts_org_idx ON email_layouts (organization_id);

-- email_accounts
CREATE TABLE email_accounts (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_name       TEXT NOT NULL,
  from_email      TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX email_accounts_org_idx ON email_accounts (organization_id);

-- mail_providers
CREATE TABLE mail_providers (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  provider_type    mail_provider_type_enum NOT NULL,
  oauth_tokens     JSONB,   -- { accessToken, refreshToken, expiresAt, scope }
  api_config       JSONB,   -- { apiKey, domain, region }
  from_name        TEXT NOT NULL,
  from_email       TEXT NOT NULL,
  reply_to_email   TEXT,
  capabilities     JSONB NOT NULL,   -- { canSend, canReceive, canSync }
  is_default       BOOLEAN NOT NULL,
  is_shared        BOOLEAN NOT NULL,
  assigned_user_ids TEXT[],
  status           mail_provider_status_enum NOT NULL,
  last_sync_at     BIGINT,
  last_error       TEXT,
  status_message   TEXT,
  connected_by     TEXT REFERENCES users(id),
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE INDEX mail_providers_org_idx ON mail_providers (organization_id);
CREATE INDEX mail_providers_org_default_idx ON mail_providers (organization_id, is_default);
CREATE INDEX mail_providers_org_type_idx ON mail_providers (organization_id, provider_type);
CREATE INDEX mail_providers_org_status_idx ON mail_providers (organization_id, status);
CREATE INDEX mail_providers_org_email_idx ON mail_providers (organization_id, from_email);

-- emails
CREATE TABLE emails (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id         TEXT NOT NULL,
  message_id        TEXT NOT NULL,
  in_reply_to       TEXT,
  direction         email_direction_enum NOT NULL,
  "from"            TEXT NOT NULL,
  "to"              TEXT[] NOT NULL,
  cc                TEXT[],
  bcc               TEXT[],
  subject           TEXT NOT NULL,
  body_html         TEXT,
  body_text         TEXT,
  snippet           TEXT,
  is_read           BOOLEAN NOT NULL,
  is_starred        BOOLEAN,
  contact_id        TEXT REFERENCES contacts(id),
  company_id        TEXT REFERENCES companies(id),
  lead_id           TEXT REFERENCES leads(id),
  provider          TEXT,
  mail_provider_id  TEXT REFERENCES mail_providers(id),
  gmail_message_id  TEXT,
  gmail_thread_id   TEXT,
  sent_by           TEXT REFERENCES users(id),
  template_id       TEXT REFERENCES email_templates(id),
  patient_id        TEXT,   -- FK → gabinet_patients (forward ref)
  appointment_id    TEXT,   -- FK → gabinet_appointments (forward ref)
  employee_id       TEXT,   -- FK → gabinet_employees (forward ref)
  sent_at           BIGINT NOT NULL,
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL,
  search_vector     TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(subject, ''))
  ) STORED
);

CREATE INDEX emails_org_sent_at_idx ON emails (organization_id, sent_at);
CREATE INDEX emails_org_thread_idx ON emails (organization_id, thread_id);
CREATE UNIQUE INDEX emails_gmail_message_id_idx ON emails (gmail_message_id) WHERE gmail_message_id IS NOT NULL;
CREATE INDEX emails_contact_sent_at_idx ON emails (contact_id, sent_at);
CREATE INDEX emails_company_sent_at_idx ON emails (company_id, sent_at);
CREATE INDEX emails_lead_sent_at_idx ON emails (lead_id, sent_at);
CREATE UNIQUE INDEX emails_message_id_idx ON emails (message_id);
CREATE INDEX emails_org_template_idx ON emails (organization_id, template_id);
CREATE INDEX emails_patient_sent_at_idx ON emails (patient_id, sent_at);
CREATE INDEX emails_appointment_sent_at_idx ON emails (appointment_id, sent_at);
CREATE INDEX emails_employee_sent_at_idx ON emails (employee_id, sent_at);
CREATE INDEX emails_org_provider_sent_at_idx ON emails (organization_id, mail_provider_id, sent_at);
CREATE INDEX emails_search_idx ON emails USING GIN (search_vector);

-- email_event_types
CREATE TABLE email_event_types (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  module          automation_module_enum NOT NULL,
  display_name    TEXT NOT NULL,
  description     TEXT,
  payload_schema  TEXT,
  is_active       BOOLEAN NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX email_event_types_org_idx ON email_event_types (organization_id);
CREATE INDEX email_event_types_org_module_idx ON email_event_types (organization_id, module);
CREATE UNIQUE INDEX email_event_types_org_type_idx ON email_event_types (organization_id, event_type);

-- email_event_bindings
CREATE TABLE email_event_bindings (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  template_id     TEXT NOT NULL REFERENCES email_templates(id),
  enabled         BOOLEAN NOT NULL,
  priority        INTEGER NOT NULL,
  conditions      TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX email_event_bindings_org_idx ON email_event_bindings (organization_id);
CREATE INDEX email_event_bindings_org_event_type_idx ON email_event_bindings (organization_id, event_type);
CREATE INDEX email_event_bindings_org_enabled_idx ON email_event_bindings (organization_id, enabled);

-- email_event_log
CREATE TABLE email_event_log (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL,
  binding_id          TEXT REFERENCES email_event_bindings(id),
  template_id         TEXT REFERENCES email_templates(id),
  recipient_email     TEXT NOT NULL,
  recipient_name      TEXT,
  status              email_event_status_enum NOT NULL,
  payload             TEXT,
  source              TEXT,
  related_entity_type TEXT,
  related_entity_id   TEXT,
  idempotency_key     TEXT,
  rendered_subject    TEXT,
  rendered_body       TEXT,
  error_message       TEXT,
  triggered_by        TEXT REFERENCES users(id),
  processed_at        BIGINT,
  created_at          BIGINT NOT NULL
);

CREATE INDEX email_event_log_org_idx ON email_event_log (organization_id);
CREATE INDEX email_event_log_org_status_idx ON email_event_log (organization_id, status);
CREATE INDEX email_event_log_org_event_type_idx ON email_event_log (organization_id, event_type);
CREATE INDEX email_event_log_org_created_at_idx ON email_event_log (organization_id, created_at);
CREATE INDEX email_event_log_org_idempotency_idx ON email_event_log (organization_id, idempotency_key);

-- email_sequences
CREATE TABLE email_sequences (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  trigger_event_type TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL,
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE INDEX email_sequences_org_idx ON email_sequences (organization_id);

-- email_sequence_steps
CREATE TABLE email_sequence_steps (
  id              TEXT PRIMARY KEY,
  sequence_id     TEXT NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "order"         INTEGER NOT NULL,
  delay_ms        BIGINT NOT NULL,
  template_id     TEXT NOT NULL REFERENCES email_templates(id),
  condition_json  TEXT,
  created_at      BIGINT NOT NULL
);

CREATE INDEX email_sequence_steps_sequence_idx ON email_sequence_steps (sequence_id);
CREATE INDEX email_sequence_steps_org_idx ON email_sequence_steps (organization_id);

-- email_sequence_enrollments
CREATE TABLE email_sequence_enrollments (
  id              TEXT PRIMARY KEY,
  sequence_id     TEXT NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name  TEXT,
  payload         TEXT,
  current_step    INTEGER NOT NULL,
  status          email_sequence_enrollment_status_enum NOT NULL,
  enrolled_at     BIGINT NOT NULL,
  completed_at    BIGINT,
  cancelled_at    BIGINT
);

CREATE INDEX email_sequence_enrollments_sequence_idx ON email_sequence_enrollments (sequence_id);
CREATE INDEX email_sequence_enrollments_org_idx ON email_sequence_enrollments (organization_id);

-- email_brand_config
CREATE TABLE email_brand_config (
  id                       TEXT PRIMARY KEY,
  organization_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logo_storage_id          TEXT,
  logo_url                 TEXT,
  company_name             TEXT,
  primary_color            TEXT NOT NULL,
  background_color         TEXT NOT NULL,
  content_background_color TEXT NOT NULL,
  text_color               TEXT NOT NULL,
  secondary_text_color     TEXT NOT NULL,
  accent_color             TEXT NOT NULL,
  footer_text              TEXT,
  social_links             JSONB,   -- { website, facebook, instagram, linkedin }
  created_by               TEXT NOT NULL REFERENCES users(id),
  created_at               BIGINT NOT NULL,
  updated_by               TEXT NOT NULL REFERENCES users(id),
  updated_at               BIGINT NOT NULL
);

CREATE UNIQUE INDEX email_brand_config_org_idx ON email_brand_config (organization_id);

-- =============================================================================
-- 7. OAUTH & CALENDAR SYNC
-- =============================================================================

-- oauth_connections
CREATE TABLE oauth_connections (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider             oauth_provider_enum NOT NULL,
  provider_account_id  TEXT NOT NULL,
  user_id              TEXT REFERENCES users(id),
  access_token         TEXT NOT NULL,
  refresh_token        TEXT NOT NULL,
  expires_at           BIGINT NOT NULL,
  scope                TEXT NOT NULL,
  token_type           TEXT NOT NULL,
  is_active            BOOLEAN NOT NULL,
  last_synced_at       BIGINT,
  connected_by         TEXT NOT NULL REFERENCES users(id),
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
);

CREATE INDEX oauth_connections_org_idx ON oauth_connections (organization_id);
CREATE INDEX oauth_connections_org_provider_idx ON oauth_connections (organization_id, provider, is_active);
CREATE INDEX oauth_connections_user_provider_idx ON oauth_connections (user_id, provider, is_active);
CREATE INDEX oauth_connections_user_org_provider_idx ON oauth_connections (user_id, organization_id, provider, is_active);

-- google_calendar_sync_configs
CREATE TABLE google_calendar_sync_configs (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id),
  connection_id         TEXT NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
  google_calendar_id    TEXT NOT NULL,
  google_calendar_name  TEXT NOT NULL,
  is_org_default        BOOLEAN NOT NULL,
  target_module         gc_target_module_enum NOT NULL,
  target_activity_type  TEXT,
  visibility            gc_visibility_enum NOT NULL,
  sync_enabled          BOOLEAN NOT NULL,
  last_sync_token       TEXT,
  last_sync_at          BIGINT,
  sync_status           gc_sync_status_enum,
  sync_error            TEXT
);

CREATE INDEX google_calendar_sync_configs_org_user_idx ON google_calendar_sync_configs (organization_id, user_id);
CREATE INDEX google_calendar_sync_configs_org_default_idx ON google_calendar_sync_configs (organization_id, is_org_default);
CREATE INDEX google_calendar_sync_configs_sync_enabled_idx ON google_calendar_sync_configs (sync_enabled, last_sync_at);

-- scheduled_activities
CREATE TABLE scheduled_activities (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  activity_type         TEXT NOT NULL,
  due_date              BIGINT NOT NULL,
  end_date              BIGINT,
  is_completed          BOOLEAN NOT NULL,
  completed_at          BIGINT,
  owner_id              TEXT NOT NULL REFERENCES users(id),
  description           TEXT,
  linked_entity_type    TEXT,
  linked_entity_id      TEXT,
  location              TEXT,
  meeting_url           TEXT,
  google_event_id       TEXT,
  google_calendar_id    TEXT,
  last_google_sync_at   BIGINT,
  requires_completion   BOOLEAN,
  source_type           scheduled_activity_source_type_enum,
  sync_config_id        TEXT REFERENCES google_calendar_sync_configs(id),
  visibility_override   gc_visibility_enum,
  module_ref            JSONB,   -- { moduleId, entityType, entityId }
  resource_id           TEXT REFERENCES users(id),
  tag_ids               TEXT[],
  category_id           TEXT REFERENCES category_definitions(id),
  created_by            TEXT NOT NULL REFERENCES users(id),
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL
);

CREATE INDEX scheduled_activities_org_idx ON scheduled_activities (organization_id);
CREATE INDEX scheduled_activities_org_due_date_idx ON scheduled_activities (organization_id, due_date);
CREATE INDEX scheduled_activities_owner_idx ON scheduled_activities (owner_id);
CREATE INDEX scheduled_activities_org_type_idx ON scheduled_activities (organization_id, activity_type);
CREATE INDEX scheduled_activities_org_completed_idx ON scheduled_activities (organization_id, is_completed);
CREATE INDEX scheduled_activities_org_resource_idx ON scheduled_activities (organization_id, resource_id);
CREATE INDEX scheduled_activities_org_resource_due_idx ON scheduled_activities (organization_id, resource_id, due_date);
CREATE INDEX scheduled_activities_org_google_event_idx ON scheduled_activities (organization_id, google_event_id);

-- payments
CREATE TABLE payments (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id       TEXT,   -- FK → gabinet_patients (forward ref)
  appointment_id   TEXT,   -- FK → gabinet_appointments (forward ref)
  package_usage_id TEXT,   -- FK → gabinet_package_usage (forward ref)
  amount           NUMERIC NOT NULL,
  currency         TEXT NOT NULL,
  payment_method   payment_method_enum NOT NULL,
  status           payment_status_enum NOT NULL,
  paid_at          BIGINT,
  notes            TEXT,
  created_by       TEXT NOT NULL REFERENCES users(id),
  created_at       BIGINT NOT NULL,
  updated_at       BIGINT NOT NULL
);

CREATE INDEX payments_org_idx ON payments (organization_id);
CREATE INDEX payments_org_status_idx ON payments (organization_id, status);
CREATE INDEX payments_org_patient_idx ON payments (organization_id, patient_id);
CREATE INDEX payments_appointment_idx ON payments (appointment_id);

-- org_sms_config
CREATE TABLE org_sms_config (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        sms_provider_enum NOT NULL,
  api_token       TEXT NOT NULL,
  api_secret      TEXT,
  sender_id       TEXT,
  from_number     TEXT,
  is_active       BOOLEAN NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE UNIQUE INDEX org_sms_config_org_idx ON org_sms_config (organization_id);
CREATE INDEX org_sms_config_provider_from_number_idx ON org_sms_config (provider, from_number);
CREATE INDEX org_sms_config_provider_sender_id_idx ON org_sms_config (provider, sender_id);

-- =============================================================================
-- 8. GABINET (MEDICAL OFFICE) TABLES
-- =============================================================================

-- gabinet_locations
CREATE TABLE gabinet_locations (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         JSONB,   -- { street, city, postalCode, country }
  phone           TEXT,
  email           TEXT,
  color           TEXT,
  is_active       BOOLEAN NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT,
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, ''))
  ) STORED
);

CREATE INDEX gabinet_locations_org_idx ON gabinet_locations (organization_id);
CREATE INDEX gabinet_locations_search_idx ON gabinet_locations USING GIN (search_vector);

-- gabinet_rooms
CREATE TABLE gabinet_rooms (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id     TEXT NOT NULL REFERENCES gabinet_locations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  floor           TEXT,
  is_active       BOOLEAN NOT NULL,
  created_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_rooms_org_idx ON gabinet_rooms (organization_id);
CREATE INDEX gabinet_rooms_location_idx ON gabinet_rooms (location_id);

-- gabinet_equipment
CREATE TABLE gabinet_equipment (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT,
  serial_number        TEXT,
  current_location_id  TEXT REFERENCES gabinet_locations(id),
  current_room_id      TEXT REFERENCES gabinet_rooms(id),
  status               gabinet_equipment_status_enum NOT NULL,
  created_by           TEXT NOT NULL REFERENCES users(id),
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT,
  search_vector        TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, ''))
  ) STORED
);

CREATE INDEX gabinet_equipment_org_idx ON gabinet_equipment (organization_id);
CREATE INDEX gabinet_equipment_org_location_idx ON gabinet_equipment (organization_id, current_location_id);
CREATE INDEX gabinet_equipment_org_room_idx ON gabinet_equipment (organization_id, current_room_id);
CREATE INDEX gabinet_equipment_search_idx ON gabinet_equipment USING GIN (search_vector);

-- gabinet_equipment_transfers
CREATE TABLE gabinet_equipment_transfers (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  equipment_id     TEXT NOT NULL REFERENCES gabinet_equipment(id) ON DELETE CASCADE,
  from_location_id TEXT REFERENCES gabinet_locations(id),
  to_location_id   TEXT NOT NULL REFERENCES gabinet_locations(id),
  to_room_id       TEXT REFERENCES gabinet_rooms(id),
  transferred_by   TEXT NOT NULL REFERENCES users(id),
  transferred_at   BIGINT NOT NULL,
  notes            TEXT
);

CREATE INDEX gabinet_equipment_transfers_equipment_idx ON gabinet_equipment_transfers (equipment_id);
CREATE INDEX gabinet_equipment_transfers_org_idx ON gabinet_equipment_transfers (organization_id);
CREATE INDEX gabinet_equipment_transfers_org_time_idx ON gabinet_equipment_transfers (organization_id, transferred_at);

-- gabinet_treatments
CREATE TABLE gabinet_treatments (
  id                              TEXT PRIMARY KEY,
  organization_id                 TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                            TEXT NOT NULL,
  description                     TEXT,
  category                        TEXT,
  duration                        INTEGER NOT NULL,
  price                           NUMERIC NOT NULL,
  currency                        TEXT,
  tax_rate                        NUMERIC,
  required_equipment              TEXT[],
  required_equipment_ids          TEXT[],
  contraindications               TEXT,
  preparation_instructions        TEXT,
  aftercare_instructions          TEXT,
  is_active                       BOOLEAN NOT NULL,
  requires_approval               BOOLEAN,
  color                           TEXT,
  sort_order                      INTEGER,
  treatment_count                 INTEGER,
  parameters                      JSONB,   -- [{ name, type, value, description, unit, options, isRequired }]
  required_document_template_ids  TEXT[],
  required_form_templates         JSONB,   -- [{ templateId, timing }]
  short_description               TEXT,
  image                           TEXT,    -- Convex storage id
  tag_ids                         TEXT[],
  category_id                     TEXT REFERENCES category_definitions(id),
  created_by                      TEXT NOT NULL REFERENCES users(id),
  created_at                      BIGINT NOT NULL,
  updated_at                      BIGINT NOT NULL,
  search_vector                   TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, ''))
  ) STORED
);

CREATE INDEX gabinet_treatments_org_idx ON gabinet_treatments (organization_id);
CREATE INDEX gabinet_treatments_org_category_idx ON gabinet_treatments (organization_id, category);
CREATE INDEX gabinet_treatments_org_active_idx ON gabinet_treatments (organization_id, is_active);
CREATE INDEX gabinet_treatments_search_idx ON gabinet_treatments USING GIN (search_vector);

-- gabinet_treatment_variants
CREATE TABLE gabinet_treatment_variants (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  treatment_id    TEXT NOT NULL REFERENCES gabinet_treatments(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  price           NUMERIC,
  duration        INTEGER,
  description     TEXT,
  short_description TEXT,
  image           TEXT,    -- Convex storage id
  is_active       BOOLEAN,
  sort_order      INTEGER
);

CREATE INDEX gabinet_treatment_variants_treatment_idx ON gabinet_treatment_variants (treatment_id);
CREATE INDEX gabinet_treatment_variants_org_idx ON gabinet_treatment_variants (organization_id);

-- gabinet_employees
CREATE TABLE gabinet_employees (
  id                      TEXT PRIMARY KEY,
  organization_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id                 TEXT NOT NULL REFERENCES users(id),
  first_name              TEXT,
  last_name               TEXT,
  role                    gabinet_employee_role_enum NOT NULL,
  specialization          TEXT,
  qualified_treatment_ids TEXT[] NOT NULL,
  license_number          TEXT,
  hire_date               TEXT,
  is_active               BOOLEAN NOT NULL,
  color                   TEXT,
  notes                   TEXT,
  phone                   TEXT,
  email                   TEXT,
  date_of_birth           TEXT,
  pesel                   TEXT,
  address                 JSONB,   -- { street, city, postalCode }
  employment_type         gabinet_employment_type_enum,
  end_date                TEXT,
  position                TEXT,
  department              TEXT,
  skills                  TEXT[],
  years_of_experience     INTEGER,
  certifications          JSONB,   -- [{ name, dateObtained, expiryDate }]
  base_salary             NUMERIC,
  commission_percent      NUMERIC,
  bank_account            TEXT,
  tag_ids                 TEXT[],
  category_id             TEXT REFERENCES category_definitions(id),
  created_by              TEXT NOT NULL REFERENCES users(id),
  created_at              BIGINT NOT NULL,
  updated_at              BIGINT NOT NULL
);

CREATE INDEX gabinet_employees_org_idx ON gabinet_employees (organization_id);
CREATE UNIQUE INDEX gabinet_employees_org_user_idx ON gabinet_employees (organization_id, user_id);
CREATE INDEX gabinet_employees_org_active_idx ON gabinet_employees (organization_id, is_active);
CREATE INDEX gabinet_employees_org_role_idx ON gabinet_employees (organization_id, role);

-- gabinet_leave_types
CREATE TABLE gabinet_leave_types (
  id                TEXT PRIMARY KEY,
  organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  color             TEXT,
  is_paid           BOOLEAN NOT NULL,
  annual_quota_days INTEGER,
  requires_approval BOOLEAN NOT NULL,
  is_active         BOOLEAN NOT NULL,
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_at        BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL
);

CREATE INDEX gabinet_leave_types_org_idx ON gabinet_leave_types (organization_id);
CREATE INDEX gabinet_leave_types_org_active_idx ON gabinet_leave_types (organization_id, is_active);

-- gabinet_leave_balances
CREATE TABLE gabinet_leave_balances (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL REFERENCES gabinet_employees(id) ON DELETE CASCADE,
  leave_type_id   TEXT NOT NULL REFERENCES gabinet_leave_types(id),
  year            INTEGER NOT NULL,
  total_days      NUMERIC NOT NULL,
  used_days       NUMERIC NOT NULL,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_leave_balances_org_idx ON gabinet_leave_balances (organization_id);
CREATE INDEX gabinet_leave_balances_org_employee_idx ON gabinet_leave_balances (organization_id, employee_id);
CREATE UNIQUE INDEX gabinet_leave_balances_org_emp_type_year_idx ON gabinet_leave_balances (organization_id, employee_id, leave_type_id, year);

-- gabinet_working_hours
CREATE TABLE gabinet_working_hours (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  is_open         BOOLEAN NOT NULL,
  break_start     TEXT,
  break_end       TEXT,
  location_id     TEXT REFERENCES gabinet_locations(id),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_working_hours_org_idx ON gabinet_working_hours (organization_id);
CREATE INDEX gabinet_working_hours_org_day_idx ON gabinet_working_hours (organization_id, day_of_week);
CREATE INDEX gabinet_working_hours_org_location_idx ON gabinet_working_hours (organization_id, location_id);

-- gabinet_employee_schedules
CREATE TABLE gabinet_employee_schedules (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  is_working      BOOLEAN NOT NULL,
  break_start     TEXT,
  break_end       TEXT,
  effective_from  TEXT,
  effective_to    TEXT,
  location_id     TEXT REFERENCES gabinet_locations(id),
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_employee_schedules_org_idx ON gabinet_employee_schedules (organization_id);
CREATE INDEX gabinet_employee_schedules_org_user_idx ON gabinet_employee_schedules (organization_id, user_id);
CREATE INDEX gabinet_employee_schedules_org_user_day_idx ON gabinet_employee_schedules (organization_id, user_id, day_of_week);

-- gabinet_leaves
CREATE TABLE gabinet_leaves (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  type            gabinet_leave_type_enum NOT NULL,
  leave_type_id   TEXT REFERENCES gabinet_leave_types(id),
  start_date      TEXT NOT NULL,
  end_date        TEXT NOT NULL,
  start_time      TEXT,
  end_time        TEXT,
  status          gabinet_leave_status_enum NOT NULL,
  reason          TEXT,
  approved_by     TEXT REFERENCES users(id),
  approved_at     BIGINT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_leaves_org_idx ON gabinet_leaves (organization_id);
CREATE INDEX gabinet_leaves_org_user_idx ON gabinet_leaves (organization_id, user_id);
CREATE INDEX gabinet_leaves_org_status_idx ON gabinet_leaves (organization_id, status);
CREATE INDEX gabinet_leaves_org_date_idx ON gabinet_leaves (organization_id, start_date);

-- gabinet_overtime
CREATE TABLE gabinet_overtime (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id),
  date            TEXT NOT NULL,
  hours           NUMERIC NOT NULL,
  reason          TEXT,
  status          gabinet_leave_status_enum NOT NULL,
  approved_by     TEXT REFERENCES users(id),
  approved_at     BIGINT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_overtime_org_idx ON gabinet_overtime (organization_id);
CREATE INDEX gabinet_overtime_org_user_idx ON gabinet_overtime (organization_id, user_id);

-- gabinet_patients
CREATE TABLE gabinet_patients (
  id                         TEXT PRIMARY KEY,
  organization_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id                 TEXT REFERENCES contacts(id),
  first_name                 TEXT NOT NULL,
  last_name                  TEXT NOT NULL,
  pesel                      TEXT,
  date_of_birth              TEXT,
  gender                     gabinet_gender_enum,
  email                      TEXT NOT NULL,
  phone                      TEXT,
  address                    JSONB,   -- { street, city, postalCode }
  medical_notes              TEXT,
  allergies                  TEXT,
  blood_type                 TEXT,
  emergency_contact_name     TEXT,
  emergency_contact_phone    TEXT,
  referral_source            TEXT,
  referred_by_patient_id     TEXT REFERENCES gabinet_patients(id),
  is_active                  BOOLEAN NOT NULL,
  tags                       TEXT[],
  tag_ids                    TEXT[],
  category_id                TEXT REFERENCES category_definitions(id),
  custom_fields              JSONB,
  created_by                 TEXT NOT NULL REFERENCES users(id),
  created_at                 BIGINT NOT NULL,
  updated_at                 BIGINT NOT NULL,
  search_vector              TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))
  ) STORED
);

CREATE INDEX gabinet_patients_org_idx ON gabinet_patients (organization_id);
CREATE INDEX gabinet_patients_org_email_idx ON gabinet_patients (organization_id, email);
CREATE INDEX gabinet_patients_org_pesel_idx ON gabinet_patients (organization_id, pesel);
CREATE INDEX gabinet_patients_org_contact_idx ON gabinet_patients (organization_id, contact_id);
CREATE INDEX gabinet_patients_search_idx ON gabinet_patients USING GIN (search_vector);

-- gabinet_appointments
CREATE TABLE gabinet_appointments (
  id                         TEXT PRIMARY KEY,
  organization_id            TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id                 TEXT NOT NULL REFERENCES gabinet_patients(id),
  treatment_id               TEXT REFERENCES gabinet_treatments(id),
  employee_id                TEXT NOT NULL REFERENCES users(id),
  date                       TEXT NOT NULL,
  start_time                 TEXT NOT NULL,
  end_time                   TEXT NOT NULL,
  status                     gabinet_appointment_status_enum NOT NULL,
  notes                      TEXT,
  internal_notes             TEXT,
  body_chart_data            TEXT,
  treatment_parameter_values TEXT,
  interview_notes            TEXT,
  clinical_remarks           TEXT,
  photos                     JSONB,   -- [{ storageId, type, caption, uploadedAt }]
  color                      TEXT,
  is_recurring               BOOLEAN NOT NULL,
  recurring_rule             JSONB,   -- { frequency, count, until }
  recurring_group_id         TEXT,
  recurring_index            INTEGER,
  prepayment_required        BOOLEAN,
  prepayment_amount          NUMERIC,
  prepayment_status          TEXT,
  prepayment_paid_at         BIGINT,
  package_usage_id           TEXT,    -- FK → gabinet_package_usage (forward ref)
  scheduled_activity_id      TEXT REFERENCES scheduled_activities(id),
  reminder_sent_at           BIGINT,
  send_reminder              BOOLEAN,
  cancelled_at               BIGINT,
  cancelled_by               TEXT REFERENCES users(id),
  cancellation_reason        TEXT,
  booked_from_portal         BOOLEAN,
  booked_by_patient_id       TEXT REFERENCES gabinet_patients(id),
  location_id                TEXT REFERENCES gabinet_locations(id),
  room_id                    TEXT REFERENCES gabinet_rooms(id),
  tag_ids                    TEXT[],
  category_id                TEXT REFERENCES category_definitions(id),
  requires_completion        BOOLEAN,
  created_by                 TEXT NOT NULL REFERENCES users(id),
  created_at                 BIGINT NOT NULL,
  updated_at                 BIGINT NOT NULL
);

CREATE INDEX gabinet_appointments_org_idx ON gabinet_appointments (organization_id);
CREATE INDEX gabinet_appointments_org_date_idx ON gabinet_appointments (organization_id, date);
CREATE INDEX gabinet_appointments_org_patient_idx ON gabinet_appointments (organization_id, patient_id);
CREATE INDEX gabinet_appointments_org_employee_idx ON gabinet_appointments (organization_id, employee_id);
CREATE INDEX gabinet_appointments_org_employee_date_idx ON gabinet_appointments (organization_id, employee_id, date);
CREATE INDEX gabinet_appointments_org_status_idx ON gabinet_appointments (organization_id, status);
CREATE INDEX gabinet_appointments_org_treatment_idx ON gabinet_appointments (organization_id, treatment_id);
CREATE INDEX gabinet_appointments_org_recurring_group_idx ON gabinet_appointments (organization_id, recurring_group_id);
CREATE INDEX gabinet_appointments_org_room_date_idx ON gabinet_appointments (organization_id, room_id, date);
CREATE INDEX gabinet_appointments_requires_completion_idx ON gabinet_appointments (organization_id, requires_completion);

-- gabinet_treatment_packages
CREATE TABLE gabinet_treatment_packages (
  id                               TEXT PRIMARY KEY,
  organization_id                  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                             TEXT NOT NULL,
  description                      TEXT,
  treatments                       JSONB NOT NULL,   -- [{ treatmentId, quantity }]
  total_price                      NUMERIC NOT NULL,
  currency                         TEXT,
  discount_percent                 NUMERIC,
  validity_days                    INTEGER,
  is_active                        BOOLEAN NOT NULL,
  loyalty_points_awarded           INTEGER,
  auto_generated_for_treatment_id  TEXT REFERENCES gabinet_treatments(id),
  created_by                       TEXT NOT NULL REFERENCES users(id),
  created_at                       BIGINT NOT NULL,
  updated_at                       BIGINT NOT NULL
);

CREATE INDEX gabinet_treatment_packages_org_idx ON gabinet_treatment_packages (organization_id);
CREATE INDEX gabinet_treatment_packages_org_active_idx ON gabinet_treatment_packages (organization_id, is_active);
CREATE INDEX gabinet_treatment_packages_org_auto_treatment_idx ON gabinet_treatment_packages (organization_id, auto_generated_for_treatment_id);

-- gabinet_package_usage
CREATE TABLE gabinet_package_usage (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id      TEXT NOT NULL REFERENCES gabinet_patients(id),
  package_id      TEXT NOT NULL REFERENCES gabinet_treatment_packages(id),
  purchased_at    BIGINT NOT NULL,
  expires_at      BIGINT,
  status          gabinet_package_usage_status_enum NOT NULL,
  treatments_used JSONB NOT NULL,   -- [{ treatmentId, usedCount, totalCount }]
  paid_amount     NUMERIC NOT NULL,
  payment_method  TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_package_usage_org_idx ON gabinet_package_usage (organization_id);
CREATE INDEX gabinet_package_usage_org_patient_idx ON gabinet_package_usage (organization_id, patient_id);
CREATE INDEX gabinet_package_usage_org_status_idx ON gabinet_package_usage (organization_id, status);
CREATE INDEX gabinet_package_usage_org_patient_package_idx ON gabinet_package_usage (organization_id, patient_id, package_id);

-- gabinet_loyalty_points
CREATE TABLE gabinet_loyalty_points (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id      TEXT NOT NULL REFERENCES gabinet_patients(id) ON DELETE CASCADE,
  balance         INTEGER NOT NULL,
  lifetime_earned INTEGER NOT NULL,
  lifetime_spent  INTEGER NOT NULL,
  tier            gabinet_loyalty_tier_enum,
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_loyalty_points_org_idx ON gabinet_loyalty_points (organization_id);
CREATE UNIQUE INDEX gabinet_loyalty_points_org_patient_idx ON gabinet_loyalty_points (organization_id, patient_id);

-- gabinet_loyalty_transactions
CREATE TABLE gabinet_loyalty_transactions (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id      TEXT NOT NULL REFERENCES gabinet_patients(id),
  type            gabinet_loyalty_tx_type_enum NOT NULL,
  points          INTEGER NOT NULL,
  reason          TEXT NOT NULL,
  reference_type  TEXT,
  reference_id    TEXT,
  balance_after   INTEGER NOT NULL,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL
);

CREATE INDEX gabinet_loyalty_transactions_org_idx ON gabinet_loyalty_transactions (organization_id);
CREATE INDEX gabinet_loyalty_transactions_org_patient_idx ON gabinet_loyalty_transactions (organization_id, patient_id);

-- gabinet_document_templates
CREATE TABLE gabinet_document_templates (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  type                gabinet_doc_type_enum NOT NULL,
  content             TEXT NOT NULL,
  requires_signature  BOOLEAN NOT NULL,
  is_active           BOOLEAN NOT NULL,
  sort_order          INTEGER,
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);

CREATE INDEX gabinet_document_templates_org_idx ON gabinet_document_templates (organization_id);
CREATE INDEX gabinet_document_templates_org_type_idx ON gabinet_document_templates (organization_id, type);

-- gabinet_documents
CREATE TABLE gabinet_documents (
  id                 TEXT PRIMARY KEY,
  organization_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id         TEXT NOT NULL REFERENCES gabinet_patients(id),
  appointment_id     TEXT REFERENCES gabinet_appointments(id),
  template_id        TEXT REFERENCES gabinet_document_templates(id),
  title              TEXT NOT NULL,
  type               gabinet_doc_type_enum NOT NULL,
  content            TEXT NOT NULL,
  status             gabinet_doc_status_enum NOT NULL,
  signature_data     TEXT,
  signed_at          BIGINT,
  signed_by_patient  BOOLEAN,
  signed_by_employee TEXT REFERENCES users(id),
  file_storage_id    TEXT,
  file_name          TEXT,
  file_mime_type     TEXT,
  tag_ids            TEXT[],
  category_id        TEXT REFERENCES category_definitions(id),
  created_by         TEXT NOT NULL REFERENCES users(id),
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);

CREATE INDEX gabinet_documents_org_idx ON gabinet_documents (organization_id);
CREATE INDEX gabinet_documents_org_patient_idx ON gabinet_documents (organization_id, patient_id);
CREATE INDEX gabinet_documents_org_status_idx ON gabinet_documents (organization_id, status);
CREATE INDEX gabinet_documents_appointment_idx ON gabinet_documents (appointment_id);

-- gabinet_portal_sessions
CREATE TABLE gabinet_portal_sessions (
  id                   TEXT PRIMARY KEY,
  patient_id           TEXT NOT NULL REFERENCES gabinet_patients(id) ON DELETE CASCADE,
  organization_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash           TEXT NOT NULL,
  otp_hash             TEXT,
  otp_expires_at       BIGINT,
  is_active            BOOLEAN NOT NULL,
  last_accessed_at     BIGINT NOT NULL,
  created_at           BIGINT NOT NULL,
  expires_at           BIGINT NOT NULL,
  otp_send_count       INTEGER,
  otp_send_window_start BIGINT,
  verify_fail_count    INTEGER,
  locked_until         BIGINT
);

CREATE UNIQUE INDEX gabinet_portal_sessions_token_idx ON gabinet_portal_sessions (token_hash);
CREATE INDEX gabinet_portal_sessions_patient_idx ON gabinet_portal_sessions (patient_id);
CREATE INDEX gabinet_portal_sessions_org_idx ON gabinet_portal_sessions (organization_id);

-- appointment_reminders
CREATE TABLE appointment_reminders (
  id                     TEXT PRIMARY KEY,
  organization_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id         TEXT NOT NULL REFERENCES gabinet_appointments(id) ON DELETE CASCADE,
  type                   TEXT NOT NULL CHECK (type IN ('email', 'sms', 'notification')),
  scheduled_for          BIGINT NOT NULL,
  sent_at                BIGINT,
  status                 TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  scheduled_function_id  TEXT,
  created_at             BIGINT NOT NULL
);

CREATE INDEX appointment_reminders_org_idx ON appointment_reminders (organization_id);
CREATE INDEX appointment_reminders_appointment_idx ON appointment_reminders (appointment_id);
CREATE INDEX appointment_reminders_org_status_idx ON appointment_reminders (organization_id, status);

-- appointment_workflow_history
CREATE TABLE appointment_workflow_history (
  id                 TEXT PRIMARY KEY,
  organization_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id     TEXT NOT NULL REFERENCES gabinet_appointments(id) ON DELETE CASCADE,
  workflow_event     appointment_workflow_event_enum NOT NULL,
  channel            appointment_workflow_channel_enum NOT NULL,
  direction          TEXT NOT NULL CHECK (direction = 'outbound'),
  source             TEXT NOT NULL,
  recipient          TEXT NOT NULL,
  recipient_name     TEXT,
  status             appointment_workflow_status_enum NOT NULL,
  rendered_subject   TEXT,
  rendered_body      TEXT,
  email_event_log_id TEXT REFERENCES email_event_log(id),
  error_message      TEXT,
  idempotency_key    TEXT NOT NULL,
  processed_at       BIGINT,
  created_at         BIGINT NOT NULL,
  updated_at         BIGINT NOT NULL
);

CREATE INDEX appointment_workflow_history_org_created_at_idx ON appointment_workflow_history (organization_id, created_at);
CREATE INDEX appointment_workflow_history_appointment_created_at_idx ON appointment_workflow_history (appointment_id, created_at);
CREATE UNIQUE INDEX appointment_workflow_history_idempotency_idx ON appointment_workflow_history (idempotency_key);

-- appointment_sms_events
CREATE TABLE appointment_sms_events (
  id                          TEXT PRIMARY KEY,
  organization_id             TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id              TEXT REFERENCES gabinet_appointments(id),
  patient_id                  TEXT REFERENCES gabinet_patients(id),
  normalized_phone            TEXT NOT NULL,
  direction                   appointment_sms_direction_enum NOT NULL,
  provider                    TEXT NOT NULL,
  event_type                  TEXT NOT NULL,
  provider_message_id         TEXT,
  correlation_key             TEXT,
  reply_to_event_id           TEXT REFERENCES appointment_sms_events(id),
  raw_body                    TEXT,
  normalized_body             TEXT,
  parsed_intent               appointment_sms_intent_enum,
  processing_status           appointment_sms_processing_status_enum NOT NULL,
  processing_error            TEXT,
  webhook_signature_verified  BOOLEAN,
  metadata                    TEXT,
  idempotency_key             TEXT NOT NULL,
  processed_at                BIGINT,
  created_at                  BIGINT NOT NULL,
  updated_at                  BIGINT NOT NULL
);

CREATE INDEX appointment_sms_events_appointment_created_at_idx ON appointment_sms_events (appointment_id, created_at);
CREATE INDEX appointment_sms_events_org_phone_created_at_idx ON appointment_sms_events (organization_id, normalized_phone, created_at);
CREATE INDEX appointment_sms_events_provider_message_id_idx ON appointment_sms_events (provider, provider_message_id);
CREATE INDEX appointment_sms_events_processing_status_idx ON appointment_sms_events (processing_status, created_at);
CREATE UNIQUE INDEX appointment_sms_events_idempotency_idx ON appointment_sms_events (idempotency_key);
CREATE INDEX appointment_sms_events_correlation_key_idx ON appointment_sms_events (correlation_key, created_at);
CREATE INDEX appointment_sms_events_reply_to_idx ON appointment_sms_events (reply_to_event_id, created_at);


-- =============================================================================
-- 9. DOCUMENT TEMPLATES & INSTANCES (gabinet.ts documentTemplates section)
-- =============================================================================

-- document_templates  (cross-module template engine)
CREATE TABLE document_templates (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  category            document_template_category_enum NOT NULL,
  content             TEXT NOT NULL,
  module              TEXT NOT NULL,
  required_sources    TEXT[] NOT NULL,
  requires_signature  BOOLEAN NOT NULL,
  signature_slots     JSONB NOT NULL,   -- [{ id, role, label, verificationMethod, signerType }]
  access_control      JSONB NOT NULL,   -- { mode, roles, userIds }
  version             INTEGER NOT NULL,
  parent_template_id  TEXT REFERENCES document_templates(id),
  status              TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);

CREATE INDEX document_templates_org_idx ON document_templates (organization_id);
CREATE INDEX document_templates_org_module_idx ON document_templates (organization_id, module);
CREATE INDEX document_templates_org_status_idx ON document_templates (organization_id, status);
CREATE INDEX document_templates_org_category_idx ON document_templates (organization_id, category);
CREATE INDEX document_templates_parent_idx ON document_templates (parent_template_id);

-- document_template_fields
CREATE TABLE document_template_fields (
  id             TEXT PRIMARY KEY,
  template_id    TEXT NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  label          TEXT NOT NULL,
  type           TEXT NOT NULL CHECK (type IN (
    'text','textarea','number','date','select','checkbox',
    'signature','currency','phone','email','pesel'
  )),
  sort_order     INTEGER NOT NULL,
  "group"        TEXT,
  options        JSONB,        -- [{ label, value }]
  default_value  TEXT,
  binding        JSONB,        -- { source, field }
  validation     JSONB,        -- { required, min, max, pattern, minLength, maxLength }
  placeholder    TEXT,
  help_text      TEXT,
  width          TEXT NOT NULL CHECK (width IN ('full', 'half'))
);

CREATE INDEX document_template_fields_template_idx ON document_template_fields (template_id);
CREATE UNIQUE INDEX document_template_fields_template_key_idx ON document_template_fields (template_id, field_key);

-- document_instances
CREATE TABLE document_instances (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type                  TEXT CHECK (type IN ('template', 'file')),
  template_id           TEXT REFERENCES document_templates(id),
  template_version      INTEGER,
  rendered_content      TEXT,
  field_values          JSONB,
  resolved_sources      JSONB,
  file_id               TEXT,
  file_url              TEXT,
  file_name             TEXT,
  mime_type             TEXT,
  file_size             BIGINT,
  category              TEXT,
  title                 TEXT NOT NULL,
  status                document_instance_status_enum NOT NULL,
  module                TEXT,
  signatures            JSONB NOT NULL,   -- [{ slotId, slotLabel, ... }]
  pdf_file_id           TEXT,
  created_by            TEXT NOT NULL REFERENCES users(id),
  created_at            BIGINT NOT NULL,
  updated_at            BIGINT NOT NULL,
  assigned_reviewer_id  TEXT REFERENCES users(id),
  assigned_reviewer_name TEXT,
  reviewed_by           TEXT REFERENCES users(id),
  reviewed_at           BIGINT,
  approved_by           TEXT REFERENCES users(id),
  approved_at           BIGINT,
  search_vector         TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, ''))
  ) STORED
);

CREATE INDEX document_instances_org_idx ON document_instances (organization_id);
CREATE INDEX document_instances_org_status_idx ON document_instances (organization_id, status);
CREATE INDEX document_instances_org_module_idx ON document_instances (organization_id, module);
CREATE INDEX document_instances_template_idx ON document_instances (template_id);
CREATE INDEX document_instances_search_idx ON document_instances USING GIN (search_vector);

-- signature_requests
CREATE TABLE signature_requests (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id           TEXT NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  slot_id               TEXT NOT NULL,
  token                 TEXT NOT NULL,
  signer_email          TEXT,
  signer_name           TEXT,
  signer_phone          TEXT,
  signer_user_id        TEXT REFERENCES users(id),
  verification_method   verification_method_enum NOT NULL,
  status                signature_request_status_enum NOT NULL,
  otp_hash              TEXT,
  otp_sent_at           BIGINT,
  otp_attempts          INTEGER,
  expires_at            BIGINT NOT NULL,
  signed_at             BIGINT,
  created_at            BIGINT NOT NULL
);

CREATE UNIQUE INDEX signature_requests_token_idx ON signature_requests (token);
CREATE INDEX signature_requests_instance_idx ON signature_requests (instance_id);
CREATE INDEX signature_requests_org_idx ON signature_requests (organization_id);

-- =============================================================================
-- 10. FORM TEMPLATES & DOCUMENTS (documents.ts)
-- =============================================================================

-- form_templates
CREATE TABLE form_templates (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT,
  category             form_category_enum NOT NULL,
  folder_path          TEXT,
  template_type        TEXT CHECK (template_type IN ('pdfme', 'document')),
  form_json            TEXT NOT NULL,
  content_json         TEXT,
  theme_json           TEXT,
  modules              TEXT[] NOT NULL,
  entity_types         TEXT[] NOT NULL,
  variable_bindings    TEXT,
  requires_signature   BOOLEAN NOT NULL,
  signature_config     JSONB,   -- { method, signerRole, reminderEnabled, reminderIntervalHours }
  access_roles         TEXT[],
  version              INTEGER NOT NULL,
  is_active            BOOLEAN NOT NULL,
  created_by           TEXT NOT NULL REFERENCES users(id),
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL,
  search_vector        TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, ''))
  ) STORED
);

CREATE INDEX form_templates_org_idx ON form_templates (organization_id);
CREATE INDEX form_templates_org_category_idx ON form_templates (organization_id, category);
CREATE INDEX form_templates_search_idx ON form_templates USING GIN (search_vector);

-- form_documents
CREATE TABLE form_documents (
  id                             TEXT PRIMARY KEY,
  organization_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id                    TEXT NOT NULL REFERENCES form_templates(id),
  title                          TEXT NOT NULL,
  response_data                  TEXT NOT NULL,
  entity_type                    TEXT NOT NULL,
  entity_id                      TEXT NOT NULL,
  scope_entities                 TEXT,
  status                         form_document_status_enum NOT NULL,
  signature_data                 TEXT,
  signed_at                      BIGINT,
  signed_by_name                 TEXT,
  signed_by_email                TEXT,
  signed_by_ip                   TEXT,
  signature_verification_method  TEXT,
  signing_token                  TEXT,
  signing_token_expires_at       BIGINT,
  signing_email_sent_at          BIGINT,
  signing_reminder_count         INTEGER,
  timing                         TEXT CHECK (timing IN ('before_start', 'after_completion')),
  auto_generated                 BOOLEAN,
  pdf_storage_id                 TEXT,
  pdf_generated_at               BIGINT,
  created_by                     TEXT NOT NULL REFERENCES users(id),
  created_at                     BIGINT NOT NULL,
  updated_at                     BIGINT NOT NULL
);

CREATE INDEX form_documents_org_idx ON form_documents (organization_id);
CREATE INDEX form_documents_entity_idx ON form_documents (entity_type, entity_id);
CREATE INDEX form_documents_org_status_idx ON form_documents (organization_id, status);
CREATE INDEX form_documents_template_idx ON form_documents (template_id);
CREATE INDEX form_documents_signing_token_idx ON form_documents (signing_token);

-- =============================================================================
-- 11. AUTOMATION TABLES
-- =============================================================================

-- automation_rules
CREATE TABLE automation_rules (
  id                  TEXT PRIMARY KEY,
  organization_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  module              automation_module_enum NOT NULL,
  event_type          TEXT NOT NULL,
  entity_type         TEXT,
  trigger             JSONB,   -- AutomationTriggerDefinition
  graph               JSONB,   -- AutomationGraph { nodes, edges }
  definition_version  INTEGER,
  conditions          JSONB NOT NULL,   -- AutomationCondition[]
  actions             JSONB NOT NULL,   -- AutomationRuleAction[]
  enabled             BOOLEAN NOT NULL,
  created_by          TEXT NOT NULL REFERENCES users(id),
  created_at          BIGINT NOT NULL,
  updated_at          BIGINT NOT NULL
);

CREATE INDEX automation_rules_org_created_at_idx ON automation_rules (organization_id, created_at);
CREATE INDEX automation_rules_org_enabled_idx ON automation_rules (organization_id, enabled);
CREATE INDEX automation_rules_org_module_idx ON automation_rules (organization_id, module);
CREATE INDEX automation_rules_org_event_type_idx ON automation_rules (organization_id, event_type);

-- automation_runs
CREATE TABLE automation_runs (
  id                     TEXT PRIMARY KEY,
  organization_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id                TEXT REFERENCES automation_rules(id),
  module                 automation_module_enum NOT NULL,
  event_type             TEXT NOT NULL,
  entity_type            TEXT,
  entity_id              TEXT,
  event_idempotency_key  TEXT NOT NULL,
  correlation_key        TEXT,
  payload_snapshot       TEXT NOT NULL,
  actor_user_id          TEXT REFERENCES users(id),
  status                 automation_run_status_enum NOT NULL,
  error_message          TEXT,
  occurred_at            BIGINT NOT NULL,
  processed_at           BIGINT,
  created_at             BIGINT NOT NULL,
  updated_at             BIGINT NOT NULL
);

CREATE INDEX automation_runs_org_created_at_idx ON automation_runs (organization_id, created_at);
CREATE INDEX automation_runs_org_status_idx ON automation_runs (organization_id, status);
CREATE INDEX automation_runs_org_event_type_idx ON automation_runs (organization_id, event_type);
CREATE INDEX automation_runs_entity_idx ON automation_runs (entity_type, entity_id, created_at);
CREATE UNIQUE INDEX automation_runs_event_idempotency_key_idx ON automation_runs (event_idempotency_key);
CREATE INDEX automation_runs_rule_created_at_idx ON automation_runs (rule_id, created_at);

-- automation_run_steps
CREATE TABLE automation_run_steps (
  id                       TEXT PRIMARY KEY,
  organization_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id                   TEXT NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  rule_id                  TEXT REFERENCES automation_rules(id),
  action_index             INTEGER NOT NULL,
  action_type              TEXT NOT NULL,
  idempotency_key          TEXT NOT NULL,
  status                   automation_step_status_enum NOT NULL,
  recipient                TEXT,
  recipient_name           TEXT,
  linked_entity_type       TEXT,
  linked_entity_id         TEXT,
  rendered_subject         TEXT,
  rendered_body            TEXT,
  metadata_snapshot        TEXT,
  error_message            TEXT,
  email_event_log_id       TEXT REFERENCES email_event_log(id),
  appointment_sms_event_id TEXT REFERENCES appointment_sms_events(id),
  processed_at             BIGINT,
  created_at               BIGINT NOT NULL,
  updated_at               BIGINT NOT NULL
);

CREATE INDEX automation_run_steps_run_action_idx ON automation_run_steps (run_id, action_index);
CREATE INDEX automation_run_steps_org_created_at_idx ON automation_run_steps (organization_id, created_at);
CREATE UNIQUE INDEX automation_run_steps_idempotency_idx ON automation_run_steps (idempotency_key);

-- =============================================================================
-- 12. DEFERRED FOREIGN KEY ADDITIONS
--     (for tables that reference each other with forward dependencies)
-- =============================================================================

-- emails → gabinet_patients / gabinet_appointments / gabinet_employees
ALTER TABLE emails ADD CONSTRAINT emails_patient_id_fk
  FOREIGN KEY (patient_id) REFERENCES gabinet_patients(id) ON DELETE SET NULL;
ALTER TABLE emails ADD CONSTRAINT emails_appointment_id_fk
  FOREIGN KEY (appointment_id) REFERENCES gabinet_appointments(id) ON DELETE SET NULL;
ALTER TABLE emails ADD CONSTRAINT emails_employee_id_fk
  FOREIGN KEY (employee_id) REFERENCES gabinet_employees(id) ON DELETE SET NULL;

-- payments → gabinet_patients / gabinet_appointments / gabinet_package_usage
ALTER TABLE payments ADD CONSTRAINT payments_patient_id_fk
  FOREIGN KEY (patient_id) REFERENCES gabinet_patients(id) ON DELETE SET NULL;
ALTER TABLE payments ADD CONSTRAINT payments_appointment_id_fk
  FOREIGN KEY (appointment_id) REFERENCES gabinet_appointments(id) ON DELETE SET NULL;
ALTER TABLE payments ADD CONSTRAINT payments_package_usage_id_fk
  FOREIGN KEY (package_usage_id) REFERENCES gabinet_package_usage(id) ON DELETE SET NULL;

-- gabinet_appointments → gabinet_package_usage
ALTER TABLE gabinet_appointments ADD CONSTRAINT gabinet_appointments_package_usage_id_fk
  FOREIGN KEY (package_usage_id) REFERENCES gabinet_package_usage(id) ON DELETE SET NULL;

-- auth_accounts → users
ALTER TABLE auth_accounts ADD CONSTRAINT auth_accounts_user_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- =============================================================================
-- 13. ROW LEVEL SECURITY (RLS) — Foundation
--     Each tenant table is protected so only members of that organization
--     can see or modify its rows. The JWT must carry a claim:
--       request.jwt.claims ->> 'organization_id'
--     or the app layer sets a local variable:
--       SET LOCAL app.current_organization_id = '<org_id>';
--     Policies here use the session-variable approach (works with Supabase
--     service-role bypass and anon/authenticated roles equally).
-- =============================================================================

-- Helper function: return current org from local variable
CREATE OR REPLACE FUNCTION current_org_id() RETURNS TEXT
  LANGUAGE sql STABLE
  AS $$
    SELECT current_setting('app.current_organization_id', true)
  $$;

-- Helper function: return current user id from JWT sub or local variable
CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT
  LANGUAGE sql STABLE
  AS $$
    SELECT coalesce(
      current_setting('app.current_user_id', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    )
  $$;

-- Macro: enable RLS + add standard org-scoped SELECT/INSERT/UPDATE/DELETE policies
-- Called per table below.

-- organizations
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON organizations
  USING (id = current_org_id());

-- team_memberships
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON team_memberships
  USING (organization_id = current_org_id());

-- org_settings
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON org_settings
  USING (organization_id = current_org_id());

-- org_permissions
ALTER TABLE org_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON org_permissions
  USING (organization_id = current_org_id());

-- invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON invitations
  USING (organization_id = current_org_id());

-- resource_invites
ALTER TABLE resource_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON resource_invites
  USING (organization_id = current_org_id());

-- product_subscriptions
ALTER TABLE product_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON product_subscriptions
  USING (organization_id = current_org_id());

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON notifications
  USING (organization_id = current_org_id());

-- audit_log
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON audit_log
  USING (organization_id = current_org_id());

-- recently_viewed
ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON recently_viewed
  USING (organization_id = current_org_id());

-- tag_definitions
ALTER TABLE tag_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON tag_definitions
  USING (organization_id = current_org_id());

-- category_definitions
ALTER TABLE category_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON category_definitions
  USING (organization_id = current_org_id());

-- contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON contacts
  USING (organization_id = current_org_id());

-- companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON companies
  USING (organization_id = current_org_id());

-- pipelines
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON pipelines
  USING (organization_id = current_org_id());

-- pipeline_stages
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON pipeline_stages
  USING (organization_id = current_org_id());

-- pipeline_stage_actions
ALTER TABLE pipeline_stage_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON pipeline_stage_actions
  USING (organization_id = current_org_id());

-- leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON leads
  USING (organization_id = current_org_id());

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON documents
  USING (organization_id = current_org_id());

-- activity_type_definitions
ALTER TABLE activity_type_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON activity_type_definitions
  USING (organization_id = current_org_id());

-- custom_field_definitions
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON custom_field_definitions
  USING (organization_id = current_org_id());

-- custom_field_values
ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON custom_field_values
  USING (organization_id = current_org_id());

-- object_relationships
ALTER TABLE object_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON object_relationships
  USING (organization_id = current_org_id());

-- activities
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON activities
  USING (organization_id = current_org_id());

-- notes
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON notes
  USING (organization_id = current_org_id());

-- products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON products
  USING (organization_id = current_org_id());

-- deal_products
ALTER TABLE deal_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON deal_products
  USING (organization_id = current_org_id());

-- calls
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON calls
  USING (organization_id = current_org_id());

-- lost_reasons
ALTER TABLE lost_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON lost_reasons
  USING (organization_id = current_org_id());

-- sources
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON sources
  USING (organization_id = current_org_id());

-- saved_views
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON saved_views
  USING (organization_id = current_org_id());

-- email_templates
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_templates
  USING (organization_id = current_org_id());

-- email_layouts
ALTER TABLE email_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_layouts
  USING (organization_id = current_org_id());

-- email_accounts
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_accounts
  USING (organization_id = current_org_id());

-- mail_providers
ALTER TABLE mail_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON mail_providers
  USING (organization_id = current_org_id());

-- emails
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON emails
  USING (organization_id = current_org_id());

-- email_event_types
ALTER TABLE email_event_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_event_types
  USING (organization_id = current_org_id());

-- email_event_bindings
ALTER TABLE email_event_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_event_bindings
  USING (organization_id = current_org_id());

-- email_event_log
ALTER TABLE email_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_event_log
  USING (organization_id = current_org_id());

-- email_sequences
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_sequences
  USING (organization_id = current_org_id());

-- email_sequence_steps
ALTER TABLE email_sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_sequence_steps
  USING (organization_id = current_org_id());

-- email_sequence_enrollments
ALTER TABLE email_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_sequence_enrollments
  USING (organization_id = current_org_id());

-- email_brand_config
ALTER TABLE email_brand_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON email_brand_config
  USING (organization_id = current_org_id());

-- oauth_connections
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON oauth_connections
  USING (organization_id = current_org_id());

-- google_calendar_sync_configs
ALTER TABLE google_calendar_sync_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON google_calendar_sync_configs
  USING (organization_id = current_org_id());

-- scheduled_activities
ALTER TABLE scheduled_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON scheduled_activities
  USING (organization_id = current_org_id());

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON payments
  USING (organization_id = current_org_id());

-- org_sms_config
ALTER TABLE org_sms_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON org_sms_config
  USING (organization_id = current_org_id());

-- gabinet_locations
ALTER TABLE gabinet_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_locations
  USING (organization_id = current_org_id());

-- gabinet_rooms
ALTER TABLE gabinet_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_rooms
  USING (organization_id = current_org_id());

-- gabinet_equipment
ALTER TABLE gabinet_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_equipment
  USING (organization_id = current_org_id());

-- gabinet_equipment_transfers
ALTER TABLE gabinet_equipment_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_equipment_transfers
  USING (organization_id = current_org_id());

-- gabinet_treatments
ALTER TABLE gabinet_treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_treatments
  USING (organization_id = current_org_id());

-- gabinet_treatment_variants
ALTER TABLE gabinet_treatment_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_treatment_variants
  USING (organization_id = current_org_id());

-- gabinet_employees
ALTER TABLE gabinet_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_employees
  USING (organization_id = current_org_id());

-- gabinet_leave_types
ALTER TABLE gabinet_leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_leave_types
  USING (organization_id = current_org_id());

-- gabinet_leave_balances
ALTER TABLE gabinet_leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_leave_balances
  USING (organization_id = current_org_id());

-- gabinet_working_hours
ALTER TABLE gabinet_working_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_working_hours
  USING (organization_id = current_org_id());

-- gabinet_employee_schedules
ALTER TABLE gabinet_employee_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_employee_schedules
  USING (organization_id = current_org_id());

-- gabinet_leaves
ALTER TABLE gabinet_leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_leaves
  USING (organization_id = current_org_id());

-- gabinet_overtime
ALTER TABLE gabinet_overtime ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_overtime
  USING (organization_id = current_org_id());

-- gabinet_patients
ALTER TABLE gabinet_patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_patients
  USING (organization_id = current_org_id());

-- gabinet_appointments
ALTER TABLE gabinet_appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_appointments
  USING (organization_id = current_org_id());

-- gabinet_treatment_packages
ALTER TABLE gabinet_treatment_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_treatment_packages
  USING (organization_id = current_org_id());

-- gabinet_package_usage
ALTER TABLE gabinet_package_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_package_usage
  USING (organization_id = current_org_id());

-- gabinet_loyalty_points
ALTER TABLE gabinet_loyalty_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_loyalty_points
  USING (organization_id = current_org_id());

-- gabinet_loyalty_transactions
ALTER TABLE gabinet_loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_loyalty_transactions
  USING (organization_id = current_org_id());

-- gabinet_document_templates
ALTER TABLE gabinet_document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_document_templates
  USING (organization_id = current_org_id());

-- gabinet_documents
ALTER TABLE gabinet_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_documents
  USING (organization_id = current_org_id());

-- gabinet_portal_sessions
ALTER TABLE gabinet_portal_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON gabinet_portal_sessions
  USING (organization_id = current_org_id());

-- appointment_reminders
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON appointment_reminders
  USING (organization_id = current_org_id());

-- appointment_workflow_history
ALTER TABLE appointment_workflow_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON appointment_workflow_history
  USING (organization_id = current_org_id());

-- appointment_sms_events
ALTER TABLE appointment_sms_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON appointment_sms_events
  USING (organization_id = current_org_id());

-- document_templates
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON document_templates
  USING (organization_id = current_org_id());

-- document_instances
ALTER TABLE document_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON document_instances
  USING (organization_id = current_org_id());

-- signature_requests
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON signature_requests
  USING (organization_id = current_org_id());

-- form_templates
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON form_templates
  USING (organization_id = current_org_id());

-- form_documents
ALTER TABLE form_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON form_documents
  USING (organization_id = current_org_id());

-- automation_rules
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON automation_rules
  USING (organization_id = current_org_id());

-- automation_runs
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON automation_runs
  USING (organization_id = current_org_id());

-- automation_run_steps
ALTER TABLE automation_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON automation_run_steps
  USING (organization_id = current_org_id());
