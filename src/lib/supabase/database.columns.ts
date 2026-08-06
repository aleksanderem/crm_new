/**
 * Supabase Runtime Column Registry
 *
 * AUTO-GENERATED from supabase/migrations/ by scripts/gen-db-types.mjs
 * — DO NOT EDIT MANUALLY.
 *
 * Source migrations (applied in order):
 *   • 00001_initial_schema.sql
 *   • 00002_rls_policies.sql
 *   • 00003_add_selected_id_to_saved_views.sql
 *   • 00004_document_components.sql
 *   • 00005_gabinet_treatment_tax_exempt.sql
 *   • 00006_products_tax_exempt.sql
 *   • 00007_form_documents_sort_order.sql
 *   • 00008_payments_patient_credit.sql
 *   • 00009_payments_package_method.sql
 *   • 00010_gabinet_treatment_package_link.sql
 *   • 00011_entity_type_gabinet_event.sql
 *   • 00012_app_schema_version_rpc.sql
 *   • 00013_product_inventory_foundation.sql
 *   • 00014_notifications_metadata.sql
 *   • 00015_gabinet_equipment_parameter_units.sql
 *   • 00016_gabinet_employees_show_in_calendar.sql
 *   • 00017_gabinet_employees_assigned_items.sql
 *   • 00018_form_documents_timing_during_visit.sql
 *   • 00019_products_section.sql
 *   • 00020_products_inventory_fields.sql
 *   • 00021_gabinet_appointments_contraindication_alerts_reviewed.sql
 *   • 00022_gabinet_appointments_price_at_booking.sql
 *   • 00023_payment_method_gratis_barter.sql
 *   • 00024_payments_org_status_paid_at_idx.sql
 *   • 00025_gabinet_treatment_products.sql
 *   • 00026_gabinet_treatment_products_rls.sql
 *   • 00027_gabinet_appointments_location_idx.sql
 *   • 00028_gabinet_payment_methods.sql
 *   • 00029_gabinet_employees_location.sql
 *   • 00030_gabinet_employee_locations.sql
 *   • 00031_add_current_user_id_helper.sql
 *   • 00032_gabinet_patients_preferred_location.sql
 *   • 00033_drop_gabinet_employees_location_id.sql
 *   • 00034_gabinet_appointments_location_rls.sql
 *   • 00035_drop_current_app_user_id.sql
 *   • 00036_gabinet_appointments_write_location_rls.sql
 *   • 00037_team_memberships_admin_role_idx.sql
 *   • 00038_backfill_gabinet_patients_phone_digits_only.sql
 *   • 00039_gabinet_patients_sms_consent.sql
 *   • 00040_drop_legacy_gabinet_documents.sql
 *   • 00041_gabinet_employee_role_add_cosmetologist_manager.sql
 *   • 00042_gabinet_employees_nullable_user_id.sql
 *   • 00043_reminder_channel_settings.sql
 *   • 00044_scope_entities_jsonb.sql
 *   • 00045_backfill_scope_entities_appointment_docs.sql
 *   • 00046_form_documents_org_entity_type_idx.sql
 *   • 00047_gabinet_appointments_variant_id.sql
 *   • 00048_gabinet_appointments_stock_deducted.sql
 *   • 00049_product_stock_movements_location_idx.sql
 *   • 00050_product_purchase_price.sql
 *   • 00051_warehouse_deliveries.sql
 *   • 00052_product_stock_movements_unit_price.sql
 *   • 00053_warehouse_deliveries_total_value.sql
 *   • 00054_delivery_items_prices.sql
 *   • 00055_stock_levels_avg_cost.sql
 *   • 00056_product_stock_movements_avg_cost_after.sql
 *   • 00057_lot_tracking.sql
 *   • 00058_delivery_invoice_pages.sql
 *   • 00059_delivery_analysis_status.sql
 *   • 00060_delivery_matching_proposals.sql
 *   • 00061_delivery_name_mappings.sql
 *   • 00062_delivery_item_decisions.sql
 *   • 00063_document_analysis_jobs.sql
 *   • 00064_gabinet_appointments_package_deducted.sql
 *   • 00065_gabinet_package_usage_gift.sql
 *   • 00066_product_sale_price.sql
 *   • 00067_gabinet_employee_locations_role.sql
 *   • 00068_gabinet_package_usage_by_package_idx.sql
 *   • 00069_gabinet_appointment_treatments.sql
 *   • 00070_appointment_treatments_deduction_flags.sql
 *   • 00071_drop_appointment_deduction_flags.sql
 *   • 00072_gabinet_package_usage_sold_by_employee_id.sql
 *   • 00073_payments_discount_columns.sql
 *   • 00074_gabinet_employees_bio_avatar.sql
 *   • 00075_gabinet_packages_tags_category.sql
 *   • 00076_drop_gabinet_appointments_legacy_treatment_columns.sql
 *   • 00077_gabinet_treatments_hard_delete.sql
 *   • 00078_gabinet_appointments_package_treatment_id.sql
 *   • 00079_invitations_module_columns.sql
 *   • 00080_drop_org_settings_appointment_workflow_config.sql
 *   • 00081_gabinet_locations_fiscal_register_id.sql
 *   • 00082_payments_fiscal_fields.sql
 *   • 00083_gabinet_receipts.sql
 *   • 00084_gabinet_receipt_sequences.sql
 *   • 00085_gabinet_receipt_sequence_fn.sql
 *   • 00086_gabinet_receipts_receipt_type.sql
 *   • 00087_gabinet_receipt_sequence_location_fn.sql
 *   • 00088_gabinet_receipt_atomic_insert_fn.sql
 *   • 00089_gabinet_receipt_orphan_pdf_idx.sql
 *   • 00090_gabinet_patient_retention_policy.sql
 *   • 00091_product_stock_rls.sql
 *   • 00092_gabinet_treatment_products_rls.sql
 *   • 00093_document_components_rls.sql
 *   • 00094_warehouse_deliveries_rls.sql
 *   • 00095_gabinet_appointment_treatments_rls.sql
 *   • 00096_delivery_name_mappings_rls.sql
 *   • 00097_gabinet_receipts_rls.sql
 *   • 00098_gabinet_receipt_sequences_rls.sql
 *   • 00099_users_subscriptions_rls.sql
 *   • 00100_users_is_platform_admin.sql
 *   • 00101_org_sms_config_column_security.sql
 *
 * Re-generate: npx tsx scripts/gen-db-types.mjs
 */

/** Set of table names known to the generated schema. */
export type TableName =
  | "auth_accounts"
  | "auth_sessions"
  | "auth_verification_codes"
  | "auth_rate_limits"
  | "users"
  | "plans"
  | "subscriptions"
  | "platform_products"
  | "organizations"
  | "product_subscriptions"
  | "team_memberships"
  | "org_settings"
  | "org_permissions"
  | "invitations"
  | "resource_invites"
  | "notifications"
  | "audit_log"
  | "recently_viewed"
  | "tag_definitions"
  | "category_definitions"
  | "contacts"
  | "companies"
  | "pipelines"
  | "pipeline_stages"
  | "pipeline_stage_actions"
  | "leads"
  | "documents"
  | "activity_type_definitions"
  | "custom_field_definitions"
  | "custom_field_values"
  | "object_relationships"
  | "activities"
  | "notes"
  | "products"
  | "deal_products"
  | "calls"
  | "lost_reasons"
  | "sources"
  | "saved_views"
  | "email_templates"
  | "email_layouts"
  | "email_accounts"
  | "mail_providers"
  | "emails"
  | "email_event_types"
  | "email_event_bindings"
  | "email_event_log"
  | "email_sequences"
  | "email_sequence_steps"
  | "email_sequence_enrollments"
  | "email_brand_config"
  | "oauth_connections"
  | "google_calendar_sync_configs"
  | "scheduled_activities"
  | "payments"
  | "org_sms_config"
  | "gabinet_locations"
  | "gabinet_rooms"
  | "gabinet_equipment"
  | "gabinet_equipment_transfers"
  | "gabinet_treatments"
  | "gabinet_treatment_variants"
  | "gabinet_employees"
  | "gabinet_leave_types"
  | "gabinet_leave_balances"
  | "gabinet_working_hours"
  | "gabinet_employee_schedules"
  | "gabinet_leaves"
  | "gabinet_overtime"
  | "gabinet_patients"
  | "gabinet_appointments"
  | "gabinet_treatment_packages"
  | "gabinet_package_usage"
  | "gabinet_loyalty_points"
  | "gabinet_loyalty_transactions"
  | "gabinet_document_templates"
  | "gabinet_documents"
  | "gabinet_portal_sessions"
  | "appointment_reminders"
  | "appointment_workflow_history"
  | "appointment_sms_events"
  | "document_templates"
  | "document_template_fields"
  | "document_instances"
  | "signature_requests"
  | "form_templates"
  | "form_documents"
  | "automation_rules"
  | "automation_runs"
  | "automation_run_steps"
  | "document_components"
  | "product_stock_levels"
  | "product_stock_movements"
  | "gabinet_treatment_products"
  | "gabinet_payment_methods"
  | "gabinet_employee_locations"
  | "warehouse_deliveries"
  | "warehouse_delivery_items"
  | "delivery_name_mappings"
  | "document_analysis_jobs"
  | "gabinet_appointment_treatments"
  | "gabinet_receipts"
  | "gabinet_receipt_sequences";

/**
 * Column names per table, as a runtime-checkable Set.
 * Generated columns (e.g. tsvector search_vector) are excluded.
 */
export const TABLE_COLUMNS: Readonly<Record<TableName, ReadonlySet<string>>> = {
  auth_accounts: new Set(["id", "user_id", "provider", "provider_id", "secret", "email", "email_verified", "phone", "phone_verified", "profile", "access_token", "refresh_token", "expires_at", "created_at", "updated_at"]),
  auth_sessions: new Set(["id", "user_id", "expires_at", "created_at"]),
  auth_verification_codes: new Set(["id", "account_id", "email", "phone", "code", "method", "expires_at", "used_at", "created_at"]),
  auth_rate_limits: new Set(["id", "identifier", "action", "attempts", "window_start", "created_at"]),
  users: new Set(["id", "name", "username", "image_storage_id", "image", "email", "email_verification_time", "phone", "phone_verification_time", "is_anonymous", "customer_id", "language", "theme", "timezone", "created_at", "updated_at", "is_platform_admin"]),
  plans: new Set(["id", "key", "stripe_id", "name", "description", "seat_limit", "prices"]),
  subscriptions: new Set(["id", "user_id", "plan_id", "price_stripe_id", "stripe_id", "currency", "interval", "status", "current_period_start", "current_period_end", "cancel_at_period_end"]),
  platform_products: new Set(["id", "product_id", "name", "description", "is_active", "prices", "stripe_product_id", "created_at", "updated_at"]),
  organizations: new Set(["id", "name", "slug", "owner_id", "logo", "website", "created_at", "updated_at", "onboarding_completed"]),
  product_subscriptions: new Set(["id", "organization_id", "product_id", "stripe_subscription_id", "status", "current_period_start", "current_period_end", "cancel_at_period_end", "created_at", "updated_at"]),
  team_memberships: new Set(["id", "user_id", "organization_id", "role", "invited_by", "joined_at"]),
  org_settings: new Set(["id", "organization_id", "allow_custom_lost_reason", "lost_reason_required", "default_currency", "timezone", "resource_sharing_enabled", "reminder_enabled", "reminder_hours_before", "appointment_workflow_config", "created_at", "updated_at", "reminder_sms_48h", "reminder_sms_24h", "reminder_email_48h", "reminder_email_24h", "patient_retention_months"]),
  org_permissions: new Set(["id", "organization_id", "role", "permissions", "updated_by", "updated_at"]),
  invitations: new Set(["id", "organization_id", "email", "role", "token", "status", "invited_by", "expires_at", "accepted_at", "created_at", "updated_at", "module", "module_data"]),
  resource_invites: new Set(["id", "organization_id", "email", "user_id", "resource_type", "resource_id", "access_level", "invited_by", "token", "status", "created_at", "updated_at"]),
  notifications: new Set(["id", "organization_id", "user_id", "type", "title", "message", "link", "is_read", "created_at", "metadata"]),
  audit_log: new Set(["id", "organization_id", "user_id", "action", "entity_type", "entity_id", "details", "ip_address", "created_at"]),
  recently_viewed: new Set(["id", "organization_id", "user_id", "entity_type", "entity_id", "entity_label", "viewed_at"]),
  tag_definitions: new Set(["id", "organization_id", "name", "color", "sort_order", "is_deleted", "created_at", "updated_at"]),
  category_definitions: new Set(["id", "organization_id", "entity_type", "name", "parent_id", "color", "icon", "sort_order", "is_deleted", "created_at", "updated_at"]),
  contacts: new Set(["id", "organization_id", "first_name", "last_name", "email", "phone", "title", "avatar_url", "notes", "tags", "tag_ids", "category_id", "source", "created_by", "created_at", "updated_at"]),
  companies: new Set(["id", "organization_id", "name", "domain", "industry", "size", "website", "phone", "address", "notes", "tags", "tag_ids", "category_id", "created_by", "created_at", "updated_at"]),
  pipelines: new Set(["id", "organization_id", "name", "description", "type", "is_default", "created_by", "created_at", "updated_at"]),
  pipeline_stages: new Set(["id", "pipeline_id", "organization_id", "name", "color", "order", "is_won_stage", "is_lost_stage", "created_at", "updated_at"]),
  pipeline_stage_actions: new Set(["id", "organization_id", "stage_id", "action_type", "config", "created_at", "updated_at"]),
  leads: new Set(["id", "organization_id", "title", "value", "currency", "status", "priority", "expected_close_date", "source", "company_id", "assigned_to", "pipeline_stage_id", "stage_order", "notes", "tags", "tag_ids", "category_id", "won_at", "lost_at", "lost_reason", "created_by", "created_at", "updated_at"]),
  documents: new Set(["id", "organization_id", "name", "description", "file_id", "file_url", "mime_type", "file_size", "category", "tags", "tag_ids", "category_id", "status", "amount", "sent_at", "accepted_at", "created_by", "created_at", "updated_at"]),
  activity_type_definitions: new Set(["id", "organization_id", "key", "name", "icon", "color", "is_system", "order", "created_at", "updated_at"]),
  custom_field_definitions: new Set(["id", "organization_id", "entity_type", "name", "field_key", "field_type", "options", "is_required", "order", "group", "activity_type_key", "created_at", "updated_at"]),
  custom_field_values: new Set(["id", "organization_id", "field_definition_id", "entity_type", "entity_id", "value", "created_at", "updated_at"]),
  object_relationships: new Set(["id", "organization_id", "source_type", "source_id", "target_type", "target_id", "relationship_type", "created_by", "created_at"]),
  activities: new Set(["id", "organization_id", "entity_type", "entity_id", "action", "description", "metadata", "performed_by", "created_at"]),
  notes: new Set(["id", "organization_id", "entity_type", "entity_id", "content", "created_by", "is_pinned", "parent_note_id", "created_at", "updated_at"]),
  products: new Set(["id", "organization_id", "name", "sku", "unit_price", "tax_rate", "is_active", "description", "tag_ids", "category_id", "created_by", "created_at", "updated_at", "tax_exempt", "track_stock", "stock_unit", "product_section", "min_stock", "manufacturer", "catalog_number", "stock_note", "purchase_price", "sale_price"]),
  deal_products: new Set(["id", "organization_id", "deal_id", "product_id", "quantity", "unit_price", "discount", "created_at"]),
  calls: new Set(["id", "organization_id", "outcome", "call_date", "note", "duration", "tag_ids", "category_id", "created_by", "created_at", "updated_at"]),
  lost_reasons: new Set(["id", "organization_id", "label", "order", "is_active", "created_by", "created_at", "updated_at"]),
  sources: new Set(["id", "organization_id", "name", "order", "is_active", "created_by", "created_at", "updated_at"]),
  saved_views: new Set(["id", "organization_id", "entity_type", "name", "filters", "columns", "sort_field", "sort_direction", "is_default", "is_system", "created_by", "order", "created_at", "updated_at", "selected_id"]),
  email_templates: new Set(["id", "organization_id", "name", "subject", "body", "content_json", "rendered_html", "slug", "category", "module", "event_type", "is_system", "locale", "required_sources", "variables", "created_by", "is_active", "created_at", "updated_at"]),
  email_layouts: new Set(["id", "organization_id", "header_blocks", "footer_blocks", "background_color", "content_background_color", "primary_color", "logo_url", "company_name", "footer_text", "updated_by", "updated_at"]),
  email_accounts: new Set(["id", "organization_id", "from_name", "from_email", "is_default", "created_at", "updated_at"]),
  mail_providers: new Set(["id", "organization_id", "name", "provider_type", "oauth_tokens", "api_config", "from_name", "from_email", "reply_to_email", "capabilities", "is_default", "is_shared", "assigned_user_ids", "status", "last_sync_at", "last_error", "status_message", "connected_by", "created_at", "updated_at"]),
  emails: new Set(["id", "organization_id", "thread_id", "message_id", "in_reply_to", "direction", "from", "to", "cc", "bcc", "subject", "body_html", "body_text", "snippet", "is_read", "is_starred", "contact_id", "company_id", "lead_id", "provider", "mail_provider_id", "gmail_message_id", "gmail_thread_id", "sent_by", "template_id", "patient_id", "appointment_id", "employee_id", "sent_at", "created_at", "updated_at"]),
  email_event_types: new Set(["id", "organization_id", "event_type", "module", "display_name", "description", "payload_schema", "is_active", "created_at", "updated_at"]),
  email_event_bindings: new Set(["id", "organization_id", "event_type", "template_id", "enabled", "priority", "conditions", "created_by", "created_at", "updated_at"]),
  email_event_log: new Set(["id", "organization_id", "event_type", "binding_id", "template_id", "recipient_email", "recipient_name", "status", "payload", "source", "related_entity_type", "related_entity_id", "idempotency_key", "rendered_subject", "rendered_body", "error_message", "triggered_by", "processed_at", "created_at"]),
  email_sequences: new Set(["id", "organization_id", "name", "trigger_event_type", "is_active", "created_at", "updated_at"]),
  email_sequence_steps: new Set(["id", "sequence_id", "organization_id", "order", "delay_ms", "template_id", "condition_json", "created_at"]),
  email_sequence_enrollments: new Set(["id", "sequence_id", "organization_id", "recipient_email", "recipient_name", "payload", "current_step", "status", "enrolled_at", "completed_at", "cancelled_at"]),
  email_brand_config: new Set(["id", "organization_id", "logo_storage_id", "logo_url", "company_name", "primary_color", "background_color", "content_background_color", "text_color", "secondary_text_color", "accent_color", "footer_text", "social_links", "created_by", "created_at", "updated_by", "updated_at"]),
  oauth_connections: new Set(["id", "organization_id", "provider", "provider_account_id", "user_id", "access_token", "refresh_token", "expires_at", "scope", "token_type", "is_active", "last_synced_at", "connected_by", "created_at", "updated_at"]),
  google_calendar_sync_configs: new Set(["id", "organization_id", "user_id", "connection_id", "google_calendar_id", "google_calendar_name", "is_org_default", "target_module", "target_activity_type", "visibility", "sync_enabled", "last_sync_token", "last_sync_at", "sync_status", "sync_error"]),
  scheduled_activities: new Set(["id", "organization_id", "title", "activity_type", "due_date", "end_date", "is_completed", "completed_at", "owner_id", "description", "linked_entity_type", "linked_entity_id", "location", "meeting_url", "google_event_id", "google_calendar_id", "last_google_sync_at", "requires_completion", "source_type", "sync_config_id", "visibility_override", "module_ref", "resource_id", "tag_ids", "category_id", "created_by", "created_at", "updated_at"]),
  payments: new Set(["id", "organization_id", "patient_id", "appointment_id", "package_usage_id", "amount", "currency", "payment_method", "status", "paid_at", "notes", "created_by", "created_at", "updated_at", "credit_earned", "credit_applied", "kind", "discount_amount", "discount_percent", "fiscal_receipt_id", "fiscal_status", "fiscal_attempts", "fiscal_error"]),
  org_sms_config: new Set(["id", "organization_id", "provider", "api_token", "api_secret", "sender_id", "from_number", "is_active", "created_at", "updated_at"]),
  gabinet_locations: new Set(["id", "organization_id", "name", "address", "phone", "email", "color", "is_active", "created_by", "created_at", "updated_at", "fiscal_register_id"]),
  gabinet_rooms: new Set(["id", "organization_id", "location_id", "name", "description", "floor", "is_active", "created_at"]),
  gabinet_equipment: new Set(["id", "organization_id", "name", "description", "serial_number", "current_location_id", "current_room_id", "status", "created_by", "created_at", "updated_at", "parameter_units"]),
  gabinet_equipment_transfers: new Set(["id", "organization_id", "equipment_id", "from_location_id", "to_location_id", "to_room_id", "transferred_by", "transferred_at", "notes"]),
  gabinet_treatments: new Set(["id", "organization_id", "name", "description", "category", "duration", "price", "currency", "tax_rate", "required_equipment", "required_equipment_ids", "contraindications", "preparation_instructions", "aftercare_instructions", "is_active", "requires_approval", "color", "sort_order", "treatment_count", "parameters", "required_document_template_ids", "required_form_templates", "short_description", "image", "tag_ids", "category_id", "created_by", "created_at", "updated_at", "tax_exempt", "package_id"]),
  gabinet_treatment_variants: new Set(["id", "organization_id", "treatment_id", "name", "price", "duration", "description", "short_description", "image", "is_active", "sort_order"]),
  gabinet_employees: new Set(["id", "organization_id", "user_id", "first_name", "last_name", "role", "specialization", "qualified_treatment_ids", "license_number", "hire_date", "is_active", "color", "notes", "phone", "email", "date_of_birth", "pesel", "address", "employment_type", "end_date", "position", "department", "skills", "years_of_experience", "certifications", "base_salary", "commission_percent", "bank_account", "tag_ids", "category_id", "created_by", "created_at", "updated_at", "show_in_calendar", "assigned_items", "location_id", "bio", "avatar_url"]),
  gabinet_leave_types: new Set(["id", "organization_id", "name", "color", "is_paid", "annual_quota_days", "requires_approval", "is_active", "created_by", "created_at", "updated_at"]),
  gabinet_leave_balances: new Set(["id", "organization_id", "employee_id", "leave_type_id", "year", "total_days", "used_days", "created_at", "updated_at"]),
  gabinet_working_hours: new Set(["id", "organization_id", "day_of_week", "start_time", "end_time", "is_open", "break_start", "break_end", "location_id", "created_by", "created_at", "updated_at"]),
  gabinet_employee_schedules: new Set(["id", "organization_id", "user_id", "day_of_week", "start_time", "end_time", "is_working", "break_start", "break_end", "effective_from", "effective_to", "location_id", "created_by", "created_at", "updated_at"]),
  gabinet_leaves: new Set(["id", "organization_id", "user_id", "type", "leave_type_id", "start_date", "end_date", "start_time", "end_time", "status", "reason", "approved_by", "approved_at", "created_by", "created_at", "updated_at"]),
  gabinet_overtime: new Set(["id", "organization_id", "user_id", "date", "hours", "reason", "status", "approved_by", "approved_at", "created_by", "created_at", "updated_at"]),
  gabinet_patients: new Set(["id", "organization_id", "contact_id", "first_name", "last_name", "pesel", "date_of_birth", "gender", "email", "phone", "address", "medical_notes", "allergies", "blood_type", "emergency_contact_name", "emergency_contact_phone", "referral_source", "referred_by_patient_id", "is_active", "tags", "tag_ids", "category_id", "custom_fields", "created_by", "created_at", "updated_at", "preferred_location_id", "sms_consent"]),
  gabinet_appointments: new Set(["id", "organization_id", "patient_id", "treatment_id", "employee_id", "date", "start_time", "end_time", "status", "notes", "internal_notes", "body_chart_data", "treatment_parameter_values", "interview_notes", "clinical_remarks", "photos", "color", "is_recurring", "recurring_rule", "recurring_group_id", "recurring_index", "prepayment_required", "prepayment_amount", "prepayment_status", "prepayment_paid_at", "package_usage_id", "scheduled_activity_id", "reminder_sent_at", "send_reminder", "cancelled_at", "cancelled_by", "cancellation_reason", "booked_from_portal", "booked_by_patient_id", "location_id", "room_id", "tag_ids", "category_id", "requires_completion", "created_by", "created_at", "updated_at", "contraindication_alerts_reviewed", "price_at_booking", "reminder_overrides", "variant_id", "stock_deducted", "package_deducted", "package_treatment_id"]),
  gabinet_treatment_packages: new Set(["id", "organization_id", "name", "description", "treatments", "total_price", "currency", "discount_percent", "validity_days", "is_active", "loyalty_points_awarded", "auto_generated_for_treatment_id", "created_by", "created_at", "updated_at", "tag_ids", "category_id"]),
  gabinet_package_usage: new Set(["id", "organization_id", "patient_id", "package_id", "purchased_at", "expires_at", "status", "treatments_used", "paid_amount", "payment_method", "created_by", "created_at", "updated_at", "is_gift", "voucher_code", "gift_recipient_name", "gift_recipient_phone", "gift_recipient_email", "sold_by_employee_id"]),
  gabinet_loyalty_points: new Set(["id", "organization_id", "patient_id", "balance", "lifetime_earned", "lifetime_spent", "tier", "created_at", "updated_at"]),
  gabinet_loyalty_transactions: new Set(["id", "organization_id", "patient_id", "type", "points", "reason", "reference_type", "reference_id", "balance_after", "created_by", "created_at"]),
  gabinet_document_templates: new Set(["id", "organization_id", "name", "type", "content", "requires_signature", "is_active", "sort_order", "created_by", "created_at", "updated_at"]),
  gabinet_documents: new Set(["id", "organization_id", "patient_id", "appointment_id", "template_id", "title", "type", "content", "status", "signature_data", "signed_at", "signed_by_patient", "signed_by_employee", "file_storage_id", "file_name", "file_mime_type", "tag_ids", "category_id", "created_by", "created_at", "updated_at"]),
  gabinet_portal_sessions: new Set(["id", "patient_id", "organization_id", "token_hash", "otp_hash", "otp_expires_at", "is_active", "last_accessed_at", "created_at", "expires_at", "otp_send_count", "otp_send_window_start", "verify_fail_count", "locked_until"]),
  appointment_reminders: new Set(["id", "organization_id", "appointment_id", "type", "scheduled_for", "sent_at", "status", "scheduled_function_id", "created_at"]),
  appointment_workflow_history: new Set(["id", "organization_id", "appointment_id", "workflow_event", "channel", "direction", "source", "recipient", "recipient_name", "status", "rendered_subject", "rendered_body", "email_event_log_id", "error_message", "idempotency_key", "processed_at", "created_at", "updated_at"]),
  appointment_sms_events: new Set(["id", "organization_id", "appointment_id", "patient_id", "normalized_phone", "direction", "provider", "event_type", "provider_message_id", "correlation_key", "reply_to_event_id", "raw_body", "normalized_body", "parsed_intent", "processing_status", "processing_error", "webhook_signature_verified", "metadata", "idempotency_key", "processed_at", "created_at", "updated_at"]),
  document_templates: new Set(["id", "organization_id", "name", "description", "category", "content", "module", "required_sources", "requires_signature", "signature_slots", "access_control", "version", "parent_template_id", "status", "created_by", "created_at", "updated_at"]),
  document_template_fields: new Set(["id", "template_id", "field_key", "label", "type", "sort_order", "group", "options", "default_value", "binding", "validation", "placeholder", "help_text", "width"]),
  document_instances: new Set(["id", "organization_id", "type", "template_id", "template_version", "rendered_content", "field_values", "resolved_sources", "file_id", "file_url", "file_name", "mime_type", "file_size", "category", "title", "status", "module", "signatures", "pdf_file_id", "created_by", "created_at", "updated_at", "assigned_reviewer_id", "assigned_reviewer_name", "reviewed_by", "reviewed_at", "approved_by", "approved_at"]),
  signature_requests: new Set(["id", "organization_id", "instance_id", "slot_id", "token", "signer_email", "signer_name", "signer_phone", "signer_user_id", "verification_method", "status", "otp_hash", "otp_sent_at", "otp_attempts", "expires_at", "signed_at", "created_at"]),
  form_templates: new Set(["id", "organization_id", "name", "description", "category", "folder_path", "template_type", "form_json", "content_json", "theme_json", "modules", "entity_types", "variable_bindings", "requires_signature", "signature_config", "access_roles", "version", "is_active", "created_by", "created_at", "updated_at"]),
  form_documents: new Set(["id", "organization_id", "template_id", "title", "response_data", "entity_type", "entity_id", "scope_entities", "status", "signature_data", "signed_at", "signed_by_name", "signed_by_email", "signed_by_ip", "signature_verification_method", "signing_token", "signing_token_expires_at", "signing_email_sent_at", "signing_reminder_count", "timing", "auto_generated", "pdf_storage_id", "pdf_generated_at", "created_by", "created_at", "updated_at", "sort_order"]),
  automation_rules: new Set(["id", "organization_id", "name", "description", "module", "event_type", "entity_type", "trigger", "graph", "definition_version", "conditions", "actions", "enabled", "created_by", "created_at", "updated_at"]),
  automation_runs: new Set(["id", "organization_id", "rule_id", "module", "event_type", "entity_type", "entity_id", "event_idempotency_key", "correlation_key", "payload_snapshot", "actor_user_id", "status", "error_message", "occurred_at", "processed_at", "created_at", "updated_at"]),
  automation_run_steps: new Set(["id", "organization_id", "run_id", "rule_id", "action_index", "action_type", "idempotency_key", "status", "recipient", "recipient_name", "linked_entity_type", "linked_entity_id", "rendered_subject", "rendered_body", "metadata_snapshot", "error_message", "email_event_log_id", "appointment_sms_event_id", "processed_at", "created_at", "updated_at"]),
  document_components: new Set(["id", "organization_id", "scope", "created_by", "name", "description", "category", "content_json", "protected", "position_constraint", "version", "is_active", "created_at", "updated_at"]),
  product_stock_levels: new Set(["id", "organization_id", "product_id", "location_id", "quantity", "updated_at", "avg_cost"]),
  product_stock_movements: new Set(["id", "organization_id", "product_id", "location_id", "delta", "balance_after", "reason", "source_type", "source_id", "note", "performed_by", "created_at", "unit_price", "avg_cost_after", "lot_number", "expiry_date"]),
  gabinet_treatment_products: new Set(["id", "organization_id", "treatment_id", "product_id", "product_section", "quantity", "unit", "created_at", "updated_at"]),
  gabinet_payment_methods: new Set(["id", "organization_id", "key", "name", "is_system", "is_active", "order", "available_for_settlement", "available_for_sales", "available_for_refund", "locks_amount_to_treatment_price", "is_package_coverage", "created_by", "created_at", "updated_at"]),
  gabinet_employee_locations: new Set(["id", "organization_id", "employee_id", "location_id", "is_primary", "created_at", "role"]),
  warehouse_deliveries: new Set(["id", "organization_id", "supplier_name", "invoice_number", "delivery_date", "location_id", "notes", "status", "created_by", "created_at", "updated_at", "total_value", "total_value_gross", "invoice_pages", "analysis_status", "analysis_result", "analysis_completed_at", "analysis_error", "matching_proposals", "item_decisions"]),
  warehouse_delivery_items: new Set(["id", "organization_id", "delivery_id", "product_id", "quantity", "unit_price", "vat_rate", "movement_id", "created_at", "unit_price_gross", "line_value_net", "line_value_gross", "vat_code", "lot_number", "expiry_date"]),
  delivery_name_mappings: new Set(["id", "organization_id", "invoice_name", "product_id", "created_at"]),
  document_analysis_jobs: new Set(["id", "organization_id", "kind", "pages", "context", "status", "result_json", "error_message", "created_by", "created_at", "updated_at", "completed_at"]),
  gabinet_appointment_treatments: new Set(["id", "organization_id", "appointment_id", "treatment_id", "variant_id", "price_at_booking", "sort_order", "created_at", "updated_at", "stock_deducted", "package_deducted"]),
  gabinet_receipts: new Set(["id", "organization_id", "payment_id", "appointment_id", "patient_id", "receipt_number", "issued_at", "organization_name", "organization_nip", "organization_address", "payment_method", "items_json", "fiscal_receipt_id", "pdf_storage_id", "pdf_url", "created_by", "created_at", "updated_at", "location_id", "status", "receipt_type"]),
  gabinet_receipt_sequences: new Set(["id", "organization_id", "location_id", "year", "last_number", "updated_at"]),
};
