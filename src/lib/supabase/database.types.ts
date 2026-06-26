/**
 * Supabase Database Types
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
 *
 * Re-generate: npx tsx scripts/gen-db-types.mjs
 *   (or: node scripts/gen-db-types.mjs)
 *
 * Follows the standard Supabase Database type envelope:
 *   Database → public → Tables → <table> → Row / Insert / Update
 */

export interface Database {
  public: {
    Tables: {
      auth_accounts: {
        Row: {
          id: string;
          user_id: string | null;
          provider: string;
          provider_id: string;
          secret: string | null;
          email: string | null;
          email_verified: boolean;
          phone: string | null;
          phone_verified: boolean;
          profile: unknown | null;
          access_token: string | null;
          refresh_token: string | null;
          expires_at: number | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          provider: string;
          provider_id: string;
          secret?: string | null;
          email?: string | null;
          email_verified?: boolean;
          phone?: string | null;
          phone_verified?: boolean;
          profile?: unknown | null;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: number | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          provider?: string;
          provider_id?: string;
          secret?: string | null;
          email?: string | null;
          email_verified?: boolean;
          phone?: string | null;
          phone_verified?: boolean;
          profile?: unknown | null;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: number | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "auth_accounts_user_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      auth_sessions: {
        Row: {
          id: string;
          user_id: string;
          expires_at: number;
          created_at: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          expires_at: number;
          created_at: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          expires_at?: number;
          created_at?: number;
        };
        Relationships: [];
      };
      auth_verification_codes: {
        Row: {
          id: string;
          account_id: string | null;
          email: string | null;
          phone: string | null;
          code: string;
          method: string;
          expires_at: number;
          used_at: number | null;
          created_at: number;
        };
        Insert: {
          id?: string;
          account_id?: string | null;
          email?: string | null;
          phone?: string | null;
          code: string;
          method: string;
          expires_at: number;
          used_at?: number | null;
          created_at: number;
        };
        Update: {
          id?: string;
          account_id?: string | null;
          email?: string | null;
          phone?: string | null;
          code?: string;
          method?: string;
          expires_at?: number;
          used_at?: number | null;
          created_at?: number;
        };
        Relationships: [];
      };
      auth_rate_limits: {
        Row: {
          id: string;
          identifier: string;
          action: string;
          attempts: number;
          window_start: number;
          created_at: number;
        };
        Insert: {
          id?: string;
          identifier: string;
          action: string;
          attempts?: number;
          window_start: number;
          created_at: number;
        };
        Update: {
          id?: string;
          identifier?: string;
          action?: string;
          attempts?: number;
          window_start?: number;
          created_at?: number;
        };
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          name: string | null;
          username: string | null;
          image_storage_id: string | null;
          image: string | null;
          email: string | null;
          email_verification_time: number | null;
          phone: string | null;
          phone_verification_time: number | null;
          is_anonymous: boolean | null;
          customer_id: string | null;
          language: string | null;
          theme: string | null;
          timezone: string | null;
          created_at: number | null;
          updated_at: number | null;
        };
        Insert: {
          id?: string;
          name?: string | null;
          username?: string | null;
          image_storage_id?: string | null;
          image?: string | null;
          email?: string | null;
          email_verification_time?: number | null;
          phone?: string | null;
          phone_verification_time?: number | null;
          is_anonymous?: boolean | null;
          customer_id?: string | null;
          language?: string | null;
          theme?: string | null;
          timezone?: string | null;
          created_at?: number | null;
          updated_at?: number | null;
        };
        Update: {
          id?: string;
          name?: string | null;
          username?: string | null;
          image_storage_id?: string | null;
          image?: string | null;
          email?: string | null;
          email_verification_time?: number | null;
          phone?: string | null;
          phone_verification_time?: number | null;
          is_anonymous?: boolean | null;
          customer_id?: string | null;
          language?: string | null;
          theme?: string | null;
          timezone?: string | null;
          created_at?: number | null;
          updated_at?: number | null;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          key: string;
          stripe_id: string;
          name: string;
          description: string;
          seat_limit: number;
          prices: unknown;
        };
        Insert: {
          id?: string;
          key: string;
          stripe_id: string;
          name: string;
          description: string;
          seat_limit: number;
          prices: unknown;
        };
        Update: {
          id?: string;
          key?: string;
          stripe_id?: string;
          name?: string;
          description?: string;
          seat_limit?: number;
          prices?: unknown;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan_id: string;
          price_stripe_id: string;
          stripe_id: string;
          currency: string;
          interval: string;
          status: string;
          current_period_start: number;
          current_period_end: number;
          cancel_at_period_end: boolean;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan_id: string;
          price_stripe_id: string;
          stripe_id: string;
          currency: string;
          interval: string;
          status: string;
          current_period_start: number;
          current_period_end: number;
          cancel_at_period_end: boolean;
        };
        Update: {
          id?: string;
          user_id?: string;
          plan_id?: string;
          price_stripe_id?: string;
          stripe_id?: string;
          currency?: string;
          interval?: string;
          status?: string;
          current_period_start?: number;
          current_period_end?: number;
          cancel_at_period_end?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_products: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          description: string;
          is_active: boolean;
          prices: unknown;
          stripe_product_id: string | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          description: string;
          is_active: boolean;
          prices: unknown;
          stripe_product_id?: string | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          description?: string;
          is_active?: boolean;
          prices?: unknown;
          stripe_product_id?: string | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_id: string;
          logo: string | null;
          website: string | null;
          created_at: number;
          updated_at: number;
          onboarding_completed: boolean | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_id: string;
          logo?: string | null;
          website?: string | null;
          created_at: number;
          updated_at: number;
          onboarding_completed?: boolean | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          owner_id?: string;
          logo?: string | null;
          website?: string | null;
          created_at?: number;
          updated_at?: number;
          onboarding_completed?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      product_subscriptions: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          stripe_subscription_id: string | null;
          status: string;
          current_period_start: number | null;
          current_period_end: number | null;
          cancel_at_period_end: boolean;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          stripe_subscription_id?: string | null;
          status: string;
          current_period_start?: number | null;
          current_period_end?: number | null;
          cancel_at_period_end: boolean;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          product_id?: string;
          stripe_subscription_id?: string | null;
          status?: string;
          current_period_start?: number | null;
          current_period_end?: number | null;
          cancel_at_period_end?: boolean;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_subscriptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      team_memberships: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: string;
          invited_by: string | null;
          joined_at: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: string;
          invited_by?: string | null;
          joined_at: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          role?: string;
          invited_by?: string | null;
          joined_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "team_memberships_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "team_memberships_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      org_settings: {
        Row: {
          id: string;
          organization_id: string;
          allow_custom_lost_reason: boolean;
          lost_reason_required: boolean;
          default_currency: string | null;
          timezone: string | null;
          resource_sharing_enabled: boolean | null;
          reminder_enabled: boolean | null;
          reminder_hours_before: number | null;
          appointment_workflow_config: string | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          allow_custom_lost_reason: boolean;
          lost_reason_required: boolean;
          default_currency?: string | null;
          timezone?: string | null;
          resource_sharing_enabled?: boolean | null;
          reminder_enabled?: boolean | null;
          reminder_hours_before?: number | null;
          appointment_workflow_config?: string | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          allow_custom_lost_reason?: boolean;
          lost_reason_required?: boolean;
          default_currency?: string | null;
          timezone?: string | null;
          resource_sharing_enabled?: boolean | null;
          reminder_enabled?: boolean | null;
          reminder_hours_before?: number | null;
          appointment_workflow_config?: string | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "org_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      org_permissions: {
        Row: {
          id: string;
          organization_id: string;
          role: string;
          permissions: unknown;
          updated_by: string;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          role: string;
          permissions: unknown;
          updated_by: string;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          role?: string;
          permissions?: unknown;
          updated_by?: string;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "org_permissions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_permissions_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: string;
          token: string;
          status: string;
          invited_by: string;
          expires_at: number;
          accepted_at: number | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role: string;
          token: string;
          status: string;
          invited_by: string;
          expires_at: number;
          accepted_at?: number | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: string;
          token?: string;
          status?: string;
          invited_by?: string;
          expires_at?: number;
          accepted_at?: number | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      resource_invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          user_id: string | null;
          resource_type: string;
          resource_id: string;
          access_level: string;
          invited_by: string;
          token: string;
          status: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          user_id?: string | null;
          resource_type: string;
          resource_id: string;
          access_level: string;
          invited_by: string;
          token: string;
          status: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          user_id?: string | null;
          resource_type?: string;
          resource_id?: string;
          access_level?: string;
          invited_by?: string;
          token?: string;
          status?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "resource_invites_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_invites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "resource_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          type: string;
          title: string;
          message: string;
          link: string | null;
          is_read: boolean;
          created_at: number;
          metadata: unknown | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          type: string;
          title: string;
          message: string;
          link?: string | null;
          is_read?: boolean;
          created_at: number;
          metadata?: unknown | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          message?: string;
          link?: string | null;
          is_read?: boolean;
          created_at?: number;
          metadata?: unknown | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          details: string | null;
          ip_address: string | null;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          details?: string | null;
          ip_address?: string | null;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          action?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          details?: string | null;
          ip_address?: string | null;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_log_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      recently_viewed: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          entity_label: string;
          viewed_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          entity_label: string;
          viewed_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          entity_type?: string;
          entity_id?: string;
          entity_label?: string;
          viewed_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "recently_viewed_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recently_viewed_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      tag_definitions: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          color: string;
          sort_order: number;
          is_deleted: boolean | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          color: string;
          sort_order: number;
          is_deleted?: boolean | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          color?: string;
          sort_order?: number;
          is_deleted?: boolean | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tag_definitions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      category_definitions: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: string;
          name: string;
          parent_id: string | null;
          color: string | null;
          icon: string | null;
          sort_order: number;
          is_deleted: boolean | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entity_type: string;
          name: string;
          parent_id?: string | null;
          color?: string | null;
          icon?: string | null;
          sort_order: number;
          is_deleted?: boolean | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entity_type?: string;
          name?: string;
          parent_id?: string | null;
          color?: string | null;
          icon?: string | null;
          sort_order?: number;
          is_deleted?: boolean | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "category_definitions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "category_definitions_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          id: string;
          organization_id: string;
          first_name: string;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          title: string | null;
          avatar_url: string | null;
          notes: string | null;
          tags: string[] | null;
          tag_ids: string[] | null;
          category_id: string | null;
          source: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          first_name: string;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          avatar_url?: string | null;
          notes?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          source?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          first_name?: string;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          avatar_url?: string | null;
          notes?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          source?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contacts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          domain: string | null;
          industry: string | null;
          size: string | null;
          website: string | null;
          phone: string | null;
          address: unknown | null;
          notes: string | null;
          tags: string[] | null;
          tag_ids: string[] | null;
          category_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          domain?: string | null;
          industry?: string | null;
          size?: string | null;
          website?: string | null;
          phone?: string | null;
          address?: unknown | null;
          notes?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          domain?: string | null;
          industry?: string | null;
          size?: string | null;
          website?: string | null;
          phone?: string | null;
          address?: unknown | null;
          notes?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "companies_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "companies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pipelines: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          type: string | null;
          is_default: boolean | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          type?: string | null;
          is_default?: boolean | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          type?: string | null;
          is_default?: boolean | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pipelines_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipelines_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_stages: {
        Row: {
          id: string;
          pipeline_id: string;
          organization_id: string;
          name: string;
          color: string | null;
          order: number;
          is_won_stage: boolean | null;
          is_lost_stage: boolean | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          pipeline_id: string;
          organization_id: string;
          name: string;
          color?: string | null;
          order: number;
          is_won_stage?: boolean | null;
          is_lost_stage?: boolean | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          pipeline_id?: string;
          organization_id?: string;
          name?: string;
          color?: string | null;
          order?: number;
          is_won_stage?: boolean | null;
          is_lost_stage?: boolean | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey";
            columns: ["pipeline_id"];
            isOneToOne: false;
            referencedRelation: "pipelines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_stages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      pipeline_stage_actions: {
        Row: {
          id: string;
          organization_id: string;
          stage_id: string;
          action_type: string;
          config: unknown;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          stage_id: string;
          action_type: string;
          config: unknown;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          stage_id?: string;
          action_type?: string;
          config?: unknown;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stage_actions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipeline_stage_actions_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          value: number | null;
          currency: string | null;
          status: string;
          priority: string | null;
          expected_close_date: number | null;
          source: string | null;
          company_id: string | null;
          assigned_to: string | null;
          pipeline_stage_id: string | null;
          stage_order: number | null;
          notes: string | null;
          tags: string[] | null;
          tag_ids: string[] | null;
          category_id: string | null;
          won_at: number | null;
          lost_at: number | null;
          lost_reason: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          value?: number | null;
          currency?: string | null;
          status: string;
          priority?: string | null;
          expected_close_date?: number | null;
          source?: string | null;
          company_id?: string | null;
          assigned_to?: string | null;
          pipeline_stage_id?: string | null;
          stage_order?: number | null;
          notes?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          won_at?: number | null;
          lost_at?: number | null;
          lost_reason?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          title?: string;
          value?: number | null;
          currency?: string | null;
          status?: string;
          priority?: string | null;
          expected_close_date?: number | null;
          source?: string | null;
          company_id?: string | null;
          assigned_to?: string | null;
          pipeline_stage_id?: string | null;
          stage_order?: number | null;
          notes?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          won_at?: number | null;
          lost_at?: number | null;
          lost_reason?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_pipeline_stage_id_fkey";
            columns: ["pipeline_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          file_id: string | null;
          file_url: string | null;
          mime_type: string | null;
          file_size: number | null;
          category: string | null;
          tags: string[] | null;
          tag_ids: string[] | null;
          category_id: string | null;
          status: string | null;
          amount: number | null;
          sent_at: number | null;
          accepted_at: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          file_id?: string | null;
          file_url?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          category?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          status?: string | null;
          amount?: number | null;
          sent_at?: number | null;
          accepted_at?: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          file_id?: string | null;
          file_url?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          category?: string | null;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          status?: string | null;
          amount?: number | null;
          sent_at?: number | null;
          accepted_at?: number | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      activity_type_definitions: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          name: string;
          icon: string;
          color: string | null;
          is_system: boolean;
          order: number;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          key: string;
          name: string;
          icon: string;
          color?: string | null;
          is_system: boolean;
          order: number;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          key?: string;
          name?: string;
          icon?: string;
          color?: string | null;
          is_system?: boolean;
          order?: number;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "activity_type_definitions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_field_definitions: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: string;
          name: string;
          field_key: string;
          field_type: string;
          options: string[] | null;
          is_required: boolean | null;
          order: number;
          group: string | null;
          activity_type_key: string | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entity_type: string;
          name: string;
          field_key: string;
          field_type: string;
          options?: string[] | null;
          is_required?: boolean | null;
          order: number;
          group?: string | null;
          activity_type_key?: string | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entity_type?: string;
          name?: string;
          field_key?: string;
          field_type?: string;
          options?: string[] | null;
          is_required?: boolean | null;
          order?: number;
          group?: string | null;
          activity_type_key?: string | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_field_values: {
        Row: {
          id: string;
          organization_id: string;
          field_definition_id: string;
          entity_type: string;
          entity_id: string;
          value: unknown | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          field_definition_id: string;
          entity_type: string;
          entity_id: string;
          value?: unknown | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          field_definition_id?: string;
          entity_type?: string;
          entity_id?: string;
          value?: unknown | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "custom_field_values_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "custom_field_values_field_definition_id_fkey";
            columns: ["field_definition_id"];
            isOneToOne: false;
            referencedRelation: "custom_field_definitions";
            referencedColumns: ["id"];
          },
        ];
      };
      object_relationships: {
        Row: {
          id: string;
          organization_id: string;
          source_type: string;
          source_id: string;
          target_type: string;
          target_id: string;
          relationship_type: string | null;
          created_by: string;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          source_type: string;
          source_id: string;
          target_type: string;
          target_id: string;
          relationship_type?: string | null;
          created_by: string;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          source_type?: string;
          source_id?: string;
          target_type?: string;
          target_id?: string;
          relationship_type?: string | null;
          created_by?: string;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "object_relationships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "object_relationships_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      activities: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          description: string;
          metadata: unknown | null;
          performed_by: string;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          description: string;
          metadata?: unknown | null;
          performed_by: string;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entity_type?: string;
          entity_id?: string;
          action?: string;
          description?: string;
          metadata?: unknown | null;
          performed_by?: string;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activities_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notes: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: string;
          entity_id: string;
          content: string;
          created_by: string;
          is_pinned: boolean | null;
          parent_note_id: string | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entity_type: string;
          entity_id: string;
          content: string;
          created_by: string;
          is_pinned?: boolean | null;
          parent_note_id?: string | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entity_type?: string;
          entity_id?: string;
          content?: string;
          created_by?: string;
          is_pinned?: boolean | null;
          parent_note_id?: string | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "notes_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notes_parent_note_id_fkey";
            columns: ["parent_note_id"];
            isOneToOne: false;
            referencedRelation: "notes";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          sku: string;
          unit_price: number;
          tax_rate: number | null;
          is_active: boolean;
          description: string | null;
          tag_ids: string[] | null;
          category_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          tax_exempt: boolean | null;
          track_stock: boolean | null;
          stock_unit: string | null;
          product_section: string | null;
          min_stock: number | null;
          manufacturer: string | null;
          catalog_number: string | null;
          stock_note: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          sku: string;
          unit_price: number;
          tax_rate?: number | null;
          is_active: boolean;
          description?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          tax_exempt?: boolean | null;
          track_stock?: boolean | null;
          stock_unit?: string | null;
          product_section?: string | null;
          min_stock?: number | null;
          manufacturer?: string | null;
          catalog_number?: string | null;
          stock_note?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          sku?: string;
          unit_price?: number;
          tax_rate?: number | null;
          is_active?: boolean;
          description?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
          tax_exempt?: boolean | null;
          track_stock?: boolean | null;
          stock_unit?: string | null;
          product_section?: string | null;
          min_stock?: number | null;
          manufacturer?: string | null;
          catalog_number?: string | null;
          stock_note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      deal_products: {
        Row: {
          id: string;
          organization_id: string;
          deal_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          discount: number | null;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          deal_id: string;
          product_id: string;
          quantity: number;
          unit_price: number;
          discount?: number | null;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          deal_id?: string;
          product_id?: string;
          quantity?: number;
          unit_price?: number;
          discount?: number | null;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "deal_products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_products_deal_id_fkey";
            columns: ["deal_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deal_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: {
          id: string;
          organization_id: string;
          outcome: string;
          call_date: number;
          note: string | null;
          duration: number | null;
          tag_ids: string[] | null;
          category_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outcome: string;
          call_date: number;
          note?: string | null;
          duration?: number | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          outcome?: string;
          call_date?: number;
          note?: string | null;
          duration?: number | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "calls_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      lost_reasons: {
        Row: {
          id: string;
          organization_id: string;
          label: string;
          order: number;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          label: string;
          order: number;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          label?: string;
          order?: number;
          is_active?: boolean;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lost_reasons_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lost_reasons_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      sources: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          order: number;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          order: number;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          order?: number;
          is_active?: boolean;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sources_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sources_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_views: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: string;
          name: string;
          filters: unknown | null;
          columns: string[] | null;
          sort_field: string | null;
          sort_direction: string | null;
          is_default: boolean | null;
          is_system: boolean;
          created_by: string;
          order: number;
          created_at: number;
          updated_at: number;
          selected_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entity_type: string;
          name: string;
          filters?: unknown | null;
          columns?: string[] | null;
          sort_field?: string | null;
          sort_direction?: string | null;
          is_default?: boolean | null;
          is_system: boolean;
          created_by: string;
          order: number;
          created_at: number;
          updated_at: number;
          selected_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entity_type?: string;
          name?: string;
          filters?: unknown | null;
          columns?: string[] | null;
          sort_field?: string | null;
          sort_direction?: string | null;
          is_default?: boolean | null;
          is_system?: boolean;
          created_by?: string;
          order?: number;
          created_at?: number;
          updated_at?: number;
          selected_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "saved_views_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_views_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          subject: string;
          body: string;
          content_json: string | null;
          rendered_html: string | null;
          slug: string | null;
          category: string | null;
          module: string | null;
          event_type: string | null;
          is_system: boolean | null;
          locale: string | null;
          required_sources: string[] | null;
          variables: unknown;
          created_by: string;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          subject: string;
          body: string;
          content_json?: string | null;
          rendered_html?: string | null;
          slug?: string | null;
          category?: string | null;
          module?: string | null;
          event_type?: string | null;
          is_system?: boolean | null;
          locale?: string | null;
          required_sources?: string[] | null;
          variables: unknown;
          created_by: string;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          subject?: string;
          body?: string;
          content_json?: string | null;
          rendered_html?: string | null;
          slug?: string | null;
          category?: string | null;
          module?: string | null;
          event_type?: string | null;
          is_system?: boolean | null;
          locale?: string | null;
          required_sources?: string[] | null;
          variables?: unknown;
          created_by?: string;
          is_active?: boolean;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_layouts: {
        Row: {
          id: string;
          organization_id: string;
          header_blocks: string;
          footer_blocks: string;
          background_color: string;
          content_background_color: string;
          primary_color: string;
          logo_url: string | null;
          company_name: string | null;
          footer_text: string | null;
          updated_by: string;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          header_blocks: string;
          footer_blocks: string;
          background_color: string;
          content_background_color: string;
          primary_color: string;
          logo_url?: string | null;
          company_name?: string | null;
          footer_text?: string | null;
          updated_by: string;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          header_blocks?: string;
          footer_blocks?: string;
          background_color?: string;
          content_background_color?: string;
          primary_color?: string;
          logo_url?: string | null;
          company_name?: string | null;
          footer_text?: string | null;
          updated_by?: string;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_layouts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_layouts_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_accounts: {
        Row: {
          id: string;
          organization_id: string;
          from_name: string;
          from_email: string;
          is_default: boolean;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          from_name: string;
          from_email: string;
          is_default: boolean;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          from_name?: string;
          from_email?: string;
          is_default?: boolean;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_accounts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      mail_providers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          provider_type: string;
          oauth_tokens: unknown | null;
          api_config: unknown | null;
          from_name: string;
          from_email: string;
          reply_to_email: string | null;
          capabilities: unknown;
          is_default: boolean;
          is_shared: boolean;
          assigned_user_ids: string[] | null;
          status: string;
          last_sync_at: number | null;
          last_error: string | null;
          status_message: string | null;
          connected_by: string | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          provider_type: string;
          oauth_tokens?: unknown | null;
          api_config?: unknown | null;
          from_name: string;
          from_email: string;
          reply_to_email?: string | null;
          capabilities: unknown;
          is_default: boolean;
          is_shared: boolean;
          assigned_user_ids?: string[] | null;
          status: string;
          last_sync_at?: number | null;
          last_error?: string | null;
          status_message?: string | null;
          connected_by?: string | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          provider_type?: string;
          oauth_tokens?: unknown | null;
          api_config?: unknown | null;
          from_name?: string;
          from_email?: string;
          reply_to_email?: string | null;
          capabilities?: unknown;
          is_default?: boolean;
          is_shared?: boolean;
          assigned_user_ids?: string[] | null;
          status?: string;
          last_sync_at?: number | null;
          last_error?: string | null;
          status_message?: string | null;
          connected_by?: string | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "mail_providers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mail_providers_connected_by_fkey";
            columns: ["connected_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      emails: {
        Row: {
          id: string;
          organization_id: string;
          thread_id: string;
          message_id: string;
          in_reply_to: string | null;
          direction: string;
          from: string;
          to: string[];
          cc: string[] | null;
          bcc: string[] | null;
          subject: string;
          body_html: string | null;
          body_text: string | null;
          snippet: string | null;
          is_read: boolean;
          is_starred: boolean | null;
          contact_id: string | null;
          company_id: string | null;
          lead_id: string | null;
          provider: string | null;
          mail_provider_id: string | null;
          gmail_message_id: string | null;
          gmail_thread_id: string | null;
          sent_by: string | null;
          template_id: string | null;
          patient_id: string | null;
          appointment_id: string | null;
          employee_id: string | null;
          sent_at: number;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          thread_id: string;
          message_id: string;
          in_reply_to?: string | null;
          direction: string;
          from: string;
          to: string[];
          cc?: string[] | null;
          bcc?: string[] | null;
          subject: string;
          body_html?: string | null;
          body_text?: string | null;
          snippet?: string | null;
          is_read: boolean;
          is_starred?: boolean | null;
          contact_id?: string | null;
          company_id?: string | null;
          lead_id?: string | null;
          provider?: string | null;
          mail_provider_id?: string | null;
          gmail_message_id?: string | null;
          gmail_thread_id?: string | null;
          sent_by?: string | null;
          template_id?: string | null;
          patient_id?: string | null;
          appointment_id?: string | null;
          employee_id?: string | null;
          sent_at: number;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          thread_id?: string;
          message_id?: string;
          in_reply_to?: string | null;
          direction?: string;
          from?: string;
          to?: string[];
          cc?: string[] | null;
          bcc?: string[] | null;
          subject?: string;
          body_html?: string | null;
          body_text?: string | null;
          snippet?: string | null;
          is_read?: boolean;
          is_starred?: boolean | null;
          contact_id?: string | null;
          company_id?: string | null;
          lead_id?: string | null;
          provider?: string | null;
          mail_provider_id?: string | null;
          gmail_message_id?: string | null;
          gmail_thread_id?: string | null;
          sent_by?: string | null;
          template_id?: string | null;
          patient_id?: string | null;
          appointment_id?: string | null;
          employee_id?: string | null;
          sent_at?: number;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "emails_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_mail_provider_id_fkey";
            columns: ["mail_provider_id"];
            isOneToOne: false;
            referencedRelation: "mail_providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "email_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_patient_id_fk";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_appointment_id_fk";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "emails_employee_id_fk";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_employees";
            referencedColumns: ["id"];
          },
        ];
      };
      email_event_types: {
        Row: {
          id: string;
          organization_id: string;
          event_type: string;
          module: string;
          display_name: string;
          description: string | null;
          payload_schema: string | null;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          event_type: string;
          module: string;
          display_name: string;
          description?: string | null;
          payload_schema?: string | null;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          event_type?: string;
          module?: string;
          display_name?: string;
          description?: string | null;
          payload_schema?: string | null;
          is_active?: boolean;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_event_types_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      email_event_bindings: {
        Row: {
          id: string;
          organization_id: string;
          event_type: string;
          template_id: string;
          enabled: boolean;
          priority: number;
          conditions: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          event_type: string;
          template_id: string;
          enabled: boolean;
          priority: number;
          conditions?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          event_type?: string;
          template_id?: string;
          enabled?: boolean;
          priority?: number;
          conditions?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_event_bindings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_event_bindings_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "email_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_event_bindings_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_event_log: {
        Row: {
          id: string;
          organization_id: string;
          event_type: string;
          binding_id: string | null;
          template_id: string | null;
          recipient_email: string;
          recipient_name: string | null;
          status: string;
          payload: string | null;
          source: string | null;
          related_entity_type: string | null;
          related_entity_id: string | null;
          idempotency_key: string | null;
          rendered_subject: string | null;
          rendered_body: string | null;
          error_message: string | null;
          triggered_by: string | null;
          processed_at: number | null;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          event_type: string;
          binding_id?: string | null;
          template_id?: string | null;
          recipient_email: string;
          recipient_name?: string | null;
          status: string;
          payload?: string | null;
          source?: string | null;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          idempotency_key?: string | null;
          rendered_subject?: string | null;
          rendered_body?: string | null;
          error_message?: string | null;
          triggered_by?: string | null;
          processed_at?: number | null;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          event_type?: string;
          binding_id?: string | null;
          template_id?: string | null;
          recipient_email?: string;
          recipient_name?: string | null;
          status?: string;
          payload?: string | null;
          source?: string | null;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          idempotency_key?: string | null;
          rendered_subject?: string | null;
          rendered_body?: string | null;
          error_message?: string | null;
          triggered_by?: string | null;
          processed_at?: number | null;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_event_log_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_event_log_binding_id_fkey";
            columns: ["binding_id"];
            isOneToOne: false;
            referencedRelation: "email_event_bindings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_event_log_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "email_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_event_log_triggered_by_fkey";
            columns: ["triggered_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      email_sequences: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          trigger_event_type: string;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          trigger_event_type: string;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          trigger_event_type?: string;
          is_active?: boolean;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_sequences_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      email_sequence_steps: {
        Row: {
          id: string;
          sequence_id: string;
          organization_id: string;
          order: number;
          delay_ms: number;
          template_id: string;
          condition_json: string | null;
          created_at: number;
        };
        Insert: {
          id?: string;
          sequence_id: string;
          organization_id: string;
          order: number;
          delay_ms: number;
          template_id: string;
          condition_json?: string | null;
          created_at: number;
        };
        Update: {
          id?: string;
          sequence_id?: string;
          organization_id?: string;
          order?: number;
          delay_ms?: number;
          template_id?: string;
          condition_json?: string | null;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "email_sequences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_sequence_steps_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_sequence_steps_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "email_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      email_sequence_enrollments: {
        Row: {
          id: string;
          sequence_id: string;
          organization_id: string;
          recipient_email: string;
          recipient_name: string | null;
          payload: string | null;
          current_step: number;
          status: string;
          enrolled_at: number;
          completed_at: number | null;
          cancelled_at: number | null;
        };
        Insert: {
          id?: string;
          sequence_id: string;
          organization_id: string;
          recipient_email: string;
          recipient_name?: string | null;
          payload?: string | null;
          current_step: number;
          status: string;
          enrolled_at: number;
          completed_at?: number | null;
          cancelled_at?: number | null;
        };
        Update: {
          id?: string;
          sequence_id?: string;
          organization_id?: string;
          recipient_email?: string;
          recipient_name?: string | null;
          payload?: string | null;
          current_step?: number;
          status?: string;
          enrolled_at?: number;
          completed_at?: number | null;
          cancelled_at?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "email_sequence_enrollments_sequence_id_fkey";
            columns: ["sequence_id"];
            isOneToOne: false;
            referencedRelation: "email_sequences";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_sequence_enrollments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      email_brand_config: {
        Row: {
          id: string;
          organization_id: string;
          logo_storage_id: string | null;
          logo_url: string | null;
          company_name: string | null;
          primary_color: string;
          background_color: string;
          content_background_color: string;
          text_color: string;
          secondary_text_color: string;
          accent_color: string;
          footer_text: string | null;
          social_links: unknown | null;
          created_by: string;
          created_at: number;
          updated_by: string;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          logo_storage_id?: string | null;
          logo_url?: string | null;
          company_name?: string | null;
          primary_color: string;
          background_color: string;
          content_background_color: string;
          text_color: string;
          secondary_text_color: string;
          accent_color: string;
          footer_text?: string | null;
          social_links?: unknown | null;
          created_by: string;
          created_at: number;
          updated_by: string;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          logo_storage_id?: string | null;
          logo_url?: string | null;
          company_name?: string | null;
          primary_color?: string;
          background_color?: string;
          content_background_color?: string;
          text_color?: string;
          secondary_text_color?: string;
          accent_color?: string;
          footer_text?: string | null;
          social_links?: unknown | null;
          created_by?: string;
          created_at?: number;
          updated_by?: string;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "email_brand_config_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_brand_config_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "email_brand_config_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      oauth_connections: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          provider_account_id: string;
          user_id: string | null;
          access_token: string;
          refresh_token: string;
          expires_at: number;
          scope: string;
          token_type: string;
          is_active: boolean;
          last_synced_at: number | null;
          connected_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider: string;
          provider_account_id: string;
          user_id?: string | null;
          access_token: string;
          refresh_token: string;
          expires_at: number;
          scope: string;
          token_type: string;
          is_active: boolean;
          last_synced_at?: number | null;
          connected_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          provider?: string;
          provider_account_id?: string;
          user_id?: string | null;
          access_token?: string;
          refresh_token?: string;
          expires_at?: number;
          scope?: string;
          token_type?: string;
          is_active?: boolean;
          last_synced_at?: number | null;
          connected_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "oauth_connections_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oauth_connections_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "oauth_connections_connected_by_fkey";
            columns: ["connected_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      google_calendar_sync_configs: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          connection_id: string;
          google_calendar_id: string;
          google_calendar_name: string;
          is_org_default: boolean;
          target_module: string;
          target_activity_type: string | null;
          visibility: string;
          sync_enabled: boolean;
          last_sync_token: string | null;
          last_sync_at: number | null;
          sync_status: string | null;
          sync_error: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          connection_id: string;
          google_calendar_id: string;
          google_calendar_name: string;
          is_org_default: boolean;
          target_module: string;
          target_activity_type?: string | null;
          visibility: string;
          sync_enabled: boolean;
          last_sync_token?: string | null;
          last_sync_at?: number | null;
          sync_status?: string | null;
          sync_error?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          connection_id?: string;
          google_calendar_id?: string;
          google_calendar_name?: string;
          is_org_default?: boolean;
          target_module?: string;
          target_activity_type?: string | null;
          visibility?: string;
          sync_enabled?: boolean;
          last_sync_token?: string | null;
          last_sync_at?: number | null;
          sync_status?: string | null;
          sync_error?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "google_calendar_sync_configs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "google_calendar_sync_configs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "google_calendar_sync_configs_connection_id_fkey";
            columns: ["connection_id"];
            isOneToOne: false;
            referencedRelation: "oauth_connections";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduled_activities: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          activity_type: string;
          due_date: number;
          end_date: number | null;
          is_completed: boolean;
          completed_at: number | null;
          owner_id: string;
          description: string | null;
          linked_entity_type: string | null;
          linked_entity_id: string | null;
          location: string | null;
          meeting_url: string | null;
          google_event_id: string | null;
          google_calendar_id: string | null;
          last_google_sync_at: number | null;
          requires_completion: boolean | null;
          source_type: string | null;
          sync_config_id: string | null;
          visibility_override: string | null;
          module_ref: unknown | null;
          resource_id: string | null;
          tag_ids: string[] | null;
          category_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          title: string;
          activity_type: string;
          due_date: number;
          end_date?: number | null;
          is_completed: boolean;
          completed_at?: number | null;
          owner_id: string;
          description?: string | null;
          linked_entity_type?: string | null;
          linked_entity_id?: string | null;
          location?: string | null;
          meeting_url?: string | null;
          google_event_id?: string | null;
          google_calendar_id?: string | null;
          last_google_sync_at?: number | null;
          requires_completion?: boolean | null;
          source_type?: string | null;
          sync_config_id?: string | null;
          visibility_override?: string | null;
          module_ref?: unknown | null;
          resource_id?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          title?: string;
          activity_type?: string;
          due_date?: number;
          end_date?: number | null;
          is_completed?: boolean;
          completed_at?: number | null;
          owner_id?: string;
          description?: string | null;
          linked_entity_type?: string | null;
          linked_entity_id?: string | null;
          location?: string | null;
          meeting_url?: string | null;
          google_event_id?: string | null;
          google_calendar_id?: string | null;
          last_google_sync_at?: number | null;
          requires_completion?: boolean | null;
          source_type?: string | null;
          sync_config_id?: string | null;
          visibility_override?: string | null;
          module_ref?: unknown | null;
          resource_id?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_activities_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_activities_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_activities_sync_config_id_fkey";
            columns: ["sync_config_id"];
            isOneToOne: false;
            referencedRelation: "google_calendar_sync_configs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_activities_resource_id_fkey";
            columns: ["resource_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_activities_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_activities_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          patient_id: string | null;
          appointment_id: string | null;
          package_usage_id: string | null;
          amount: number;
          currency: string;
          payment_method: string;
          status: string;
          paid_at: number | null;
          notes: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          credit_earned: number | null;
          credit_applied: number | null;
          kind: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          patient_id?: string | null;
          appointment_id?: string | null;
          package_usage_id?: string | null;
          amount: number;
          currency: string;
          payment_method: string;
          status: string;
          paid_at?: number | null;
          notes?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          credit_earned?: number | null;
          credit_applied?: number | null;
          kind?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          patient_id?: string | null;
          appointment_id?: string | null;
          package_usage_id?: string | null;
          amount?: number;
          currency?: string;
          payment_method?: string;
          status?: string;
          paid_at?: number | null;
          notes?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
          credit_earned?: number | null;
          credit_applied?: number | null;
          kind?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_patient_id_fk";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_appointment_id_fk";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_package_usage_id_fk";
            columns: ["package_usage_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_package_usage";
            referencedColumns: ["id"];
          },
        ];
      };
      org_sms_config: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          api_token: string;
          api_secret: string | null;
          sender_id: string | null;
          from_number: string | null;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider: string;
          api_token: string;
          api_secret?: string | null;
          sender_id?: string | null;
          from_number?: string | null;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          provider?: string;
          api_token?: string;
          api_secret?: string | null;
          sender_id?: string | null;
          from_number?: string | null;
          is_active?: boolean;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "org_sms_config_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_locations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          address: unknown | null;
          phone: string | null;
          email: string | null;
          color: string | null;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          address?: unknown | null;
          phone?: string | null;
          email?: string | null;
          color?: string | null;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          address?: unknown | null;
          phone?: string | null;
          email?: string | null;
          color?: string | null;
          is_active?: boolean;
          created_by?: string;
          created_at?: number;
          updated_at?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_locations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_locations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_rooms: {
        Row: {
          id: string;
          organization_id: string;
          location_id: string;
          name: string;
          description: string | null;
          floor: string | null;
          is_active: boolean;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          location_id: string;
          name: string;
          description?: string | null;
          floor?: string | null;
          is_active: boolean;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          location_id?: string;
          name?: string;
          description?: string | null;
          floor?: string | null;
          is_active?: boolean;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_rooms_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_rooms_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_equipment: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          serial_number: string | null;
          current_location_id: string | null;
          current_room_id: string | null;
          status: string;
          created_by: string;
          created_at: number;
          updated_at: number | null;
          parameter_units: string[] | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          serial_number?: string | null;
          current_location_id?: string | null;
          current_room_id?: string | null;
          status: string;
          created_by: string;
          created_at: number;
          updated_at?: number | null;
          parameter_units?: string[] | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          serial_number?: string | null;
          current_location_id?: string | null;
          current_room_id?: string | null;
          status?: string;
          created_by?: string;
          created_at?: number;
          updated_at?: number | null;
          parameter_units?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_equipment_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_current_location_id_fkey";
            columns: ["current_location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_current_room_id_fkey";
            columns: ["current_room_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_equipment_transfers: {
        Row: {
          id: string;
          organization_id: string;
          equipment_id: string;
          from_location_id: string | null;
          to_location_id: string;
          to_room_id: string | null;
          transferred_by: string;
          transferred_at: number;
          notes: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          equipment_id: string;
          from_location_id?: string | null;
          to_location_id: string;
          to_room_id?: string | null;
          transferred_by: string;
          transferred_at: number;
          notes?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          equipment_id?: string;
          from_location_id?: string | null;
          to_location_id?: string;
          to_room_id?: string | null;
          transferred_by?: string;
          transferred_at?: number;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_equipment_transfers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_transfers_equipment_id_fkey";
            columns: ["equipment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_equipment";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_transfers_from_location_id_fkey";
            columns: ["from_location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_transfers_to_location_id_fkey";
            columns: ["to_location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_transfers_to_room_id_fkey";
            columns: ["to_room_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_equipment_transfers_transferred_by_fkey";
            columns: ["transferred_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_treatments: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          category: string | null;
          duration: number;
          price: number;
          currency: string | null;
          tax_rate: number | null;
          required_equipment: string[] | null;
          required_equipment_ids: string[] | null;
          contraindications: string | null;
          preparation_instructions: string | null;
          aftercare_instructions: string | null;
          is_active: boolean;
          requires_approval: boolean | null;
          color: string | null;
          sort_order: number | null;
          treatment_count: number | null;
          parameters: unknown | null;
          required_document_template_ids: string[] | null;
          required_form_templates: unknown | null;
          short_description: string | null;
          image: string | null;
          tag_ids: string[] | null;
          category_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          tax_exempt: boolean | null;
          package_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          category?: string | null;
          duration: number;
          price: number;
          currency?: string | null;
          tax_rate?: number | null;
          required_equipment?: string[] | null;
          required_equipment_ids?: string[] | null;
          contraindications?: string | null;
          preparation_instructions?: string | null;
          aftercare_instructions?: string | null;
          is_active: boolean;
          requires_approval?: boolean | null;
          color?: string | null;
          sort_order?: number | null;
          treatment_count?: number | null;
          parameters?: unknown | null;
          required_document_template_ids?: string[] | null;
          required_form_templates?: unknown | null;
          short_description?: string | null;
          image?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          tax_exempt?: boolean | null;
          package_id?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          duration?: number;
          price?: number;
          currency?: string | null;
          tax_rate?: number | null;
          required_equipment?: string[] | null;
          required_equipment_ids?: string[] | null;
          contraindications?: string | null;
          preparation_instructions?: string | null;
          aftercare_instructions?: string | null;
          is_active?: boolean;
          requires_approval?: boolean | null;
          color?: string | null;
          sort_order?: number | null;
          treatment_count?: number | null;
          parameters?: unknown | null;
          required_document_template_ids?: string[] | null;
          required_form_templates?: unknown | null;
          short_description?: string | null;
          image?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
          tax_exempt?: boolean | null;
          package_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_treatments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatments_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatments_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_treatment_packages";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_treatment_variants: {
        Row: {
          id: string;
          organization_id: string;
          treatment_id: string;
          name: string;
          price: number | null;
          duration: number | null;
          description: string | null;
          short_description: string | null;
          image: string | null;
          is_active: boolean | null;
          sort_order: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          treatment_id: string;
          name: string;
          price?: number | null;
          duration?: number | null;
          description?: string | null;
          short_description?: string | null;
          image?: string | null;
          is_active?: boolean | null;
          sort_order?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          treatment_id?: string;
          name?: string;
          price?: number | null;
          duration?: number | null;
          description?: string | null;
          short_description?: string | null;
          image?: string | null;
          is_active?: boolean | null;
          sort_order?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_treatment_variants_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatment_variants_treatment_id_fkey";
            columns: ["treatment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_treatments";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_treatment_products: {
        Row: {
          id: string;
          organization_id: string;
          treatment_id: string;
          product_id: string;
          product_section: string;
          quantity: number;
          unit: string | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          treatment_id: string;
          product_id: string;
          product_section: string;
          quantity: number;
          unit?: string | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          treatment_id?: string;
          product_id?: string;
          product_section?: string;
          quantity?: number;
          unit?: string | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_treatment_products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatment_products_treatment_id_fkey";
            columns: ["treatment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_treatments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatment_products_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_employees: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          role: string;
          specialization: string | null;
          qualified_treatment_ids: string[];
          license_number: string | null;
          hire_date: string | null;
          is_active: boolean;
          color: string | null;
          notes: string | null;
          phone: string | null;
          email: string | null;
          date_of_birth: string | null;
          pesel: string | null;
          address: unknown | null;
          employment_type: string | null;
          end_date: string | null;
          position: string | null;
          department: string | null;
          skills: string[] | null;
          years_of_experience: number | null;
          certifications: unknown | null;
          base_salary: number | null;
          commission_percent: number | null;
          bank_account: string | null;
          tag_ids: string[] | null;
          category_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          show_in_calendar: boolean;
          assigned_items: unknown | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          first_name?: string | null;
          last_name?: string | null;
          role: string;
          specialization?: string | null;
          qualified_treatment_ids: string[];
          license_number?: string | null;
          hire_date?: string | null;
          is_active: boolean;
          color?: string | null;
          notes?: string | null;
          phone?: string | null;
          email?: string | null;
          date_of_birth?: string | null;
          pesel?: string | null;
          address?: unknown | null;
          employment_type?: string | null;
          end_date?: string | null;
          position?: string | null;
          department?: string | null;
          skills?: string[] | null;
          years_of_experience?: number | null;
          certifications?: unknown | null;
          base_salary?: number | null;
          commission_percent?: number | null;
          bank_account?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          show_in_calendar?: boolean;
          assigned_items?: unknown | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          first_name?: string | null;
          last_name?: string | null;
          role?: string;
          specialization?: string | null;
          qualified_treatment_ids?: string[];
          license_number?: string | null;
          hire_date?: string | null;
          is_active?: boolean;
          color?: string | null;
          notes?: string | null;
          phone?: string | null;
          email?: string | null;
          date_of_birth?: string | null;
          pesel?: string | null;
          address?: unknown | null;
          employment_type?: string | null;
          end_date?: string | null;
          position?: string | null;
          department?: string | null;
          skills?: string[] | null;
          years_of_experience?: number | null;
          certifications?: unknown | null;
          base_salary?: number | null;
          commission_percent?: number | null;
          bank_account?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
          show_in_calendar?: boolean;
          assigned_items?: unknown | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_employees_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_employees_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_employees_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_employees_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_leave_types: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          color: string | null;
          is_paid: boolean;
          annual_quota_days: number | null;
          requires_approval: boolean;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          color?: string | null;
          is_paid: boolean;
          annual_quota_days?: number | null;
          requires_approval: boolean;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          color?: string | null;
          is_paid?: boolean;
          annual_quota_days?: number | null;
          requires_approval?: boolean;
          is_active?: boolean;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_leave_types_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_leave_types_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_leave_balances: {
        Row: {
          id: string;
          organization_id: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          total_days: number;
          used_days: number;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          total_days: number;
          used_days: number;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          employee_id?: string;
          leave_type_id?: string;
          year?: number;
          total_days?: number;
          used_days?: number;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_leave_balances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_leave_balances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_leave_balances_leave_type_id_fkey";
            columns: ["leave_type_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_leave_types";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_working_hours: {
        Row: {
          id: string;
          organization_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_open: boolean;
          break_start: string | null;
          break_end: string | null;
          location_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_open: boolean;
          break_start?: string | null;
          break_end?: string | null;
          location_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          is_open?: boolean;
          break_start?: string | null;
          break_end?: string | null;
          location_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_working_hours_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_working_hours_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_working_hours_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_employee_schedules: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_working: boolean;
          break_start: string | null;
          break_end: string | null;
          effective_from: string | null;
          effective_to: string | null;
          location_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          is_working: boolean;
          break_start?: string | null;
          break_end?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          location_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          is_working?: boolean;
          break_start?: string | null;
          break_end?: string | null;
          effective_from?: string | null;
          effective_to?: string | null;
          location_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_employee_schedules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_employee_schedules_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_employee_schedules_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_employee_schedules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_leaves: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          type: string;
          leave_type_id: string | null;
          start_date: string;
          end_date: string;
          start_time: string | null;
          end_time: string | null;
          status: string;
          reason: string | null;
          approved_by: string | null;
          approved_at: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          type: string;
          leave_type_id?: string | null;
          start_date: string;
          end_date: string;
          start_time?: string | null;
          end_time?: string | null;
          status: string;
          reason?: string | null;
          approved_by?: string | null;
          approved_at?: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          type?: string;
          leave_type_id?: string | null;
          start_date?: string;
          end_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          status?: string;
          reason?: string | null;
          approved_by?: string | null;
          approved_at?: number | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_leaves_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_leaves_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_leaves_leave_type_id_fkey";
            columns: ["leave_type_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_leave_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_leaves_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_leaves_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_overtime: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          date: string;
          hours: number;
          reason: string | null;
          status: string;
          approved_by: string | null;
          approved_at: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          date: string;
          hours: number;
          reason?: string | null;
          status: string;
          approved_by?: string | null;
          approved_at?: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string;
          date?: string;
          hours?: number;
          reason?: string | null;
          status?: string;
          approved_by?: string | null;
          approved_at?: number | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_overtime_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_overtime_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_overtime_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_overtime_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_patients: {
        Row: {
          id: string;
          organization_id: string;
          contact_id: string | null;
          first_name: string;
          last_name: string;
          pesel: string | null;
          date_of_birth: string | null;
          gender: string | null;
          email: string;
          phone: string | null;
          address: unknown | null;
          medical_notes: string | null;
          allergies: string | null;
          blood_type: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          referral_source: string | null;
          referred_by_patient_id: string | null;
          is_active: boolean;
          tags: string[] | null;
          tag_ids: string[] | null;
          category_id: string | null;
          custom_fields: unknown | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          contact_id?: string | null;
          first_name: string;
          last_name: string;
          pesel?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          email: string;
          phone?: string | null;
          address?: unknown | null;
          medical_notes?: string | null;
          allergies?: string | null;
          blood_type?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          referral_source?: string | null;
          referred_by_patient_id?: string | null;
          is_active: boolean;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          custom_fields?: unknown | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          contact_id?: string | null;
          first_name?: string;
          last_name?: string;
          pesel?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          email?: string;
          phone?: string | null;
          address?: unknown | null;
          medical_notes?: string | null;
          allergies?: string | null;
          blood_type?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          referral_source?: string | null;
          referred_by_patient_id?: string | null;
          is_active?: boolean;
          tags?: string[] | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          custom_fields?: unknown | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_patients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_patients_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_patients_referred_by_patient_id_fkey";
            columns: ["referred_by_patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_patients_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_patients_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_appointments: {
        Row: {
          id: string;
          organization_id: string;
          patient_id: string;
          treatment_id: string | null;
          employee_id: string;
          date: string;
          start_time: string;
          end_time: string;
          status: string;
          notes: string | null;
          internal_notes: string | null;
          body_chart_data: string | null;
          treatment_parameter_values: string | null;
          interview_notes: string | null;
          clinical_remarks: string | null;
          photos: unknown | null;
          color: string | null;
          is_recurring: boolean;
          recurring_rule: unknown | null;
          recurring_group_id: string | null;
          recurring_index: number | null;
          prepayment_required: boolean | null;
          prepayment_amount: number | null;
          prepayment_status: string | null;
          prepayment_paid_at: number | null;
          package_usage_id: string | null;
          scheduled_activity_id: string | null;
          reminder_sent_at: number | null;
          send_reminder: boolean | null;
          cancelled_at: number | null;
          cancelled_by: string | null;
          cancellation_reason: string | null;
          booked_from_portal: boolean | null;
          booked_by_patient_id: string | null;
          location_id: string | null;
          room_id: string | null;
          tag_ids: string[] | null;
          category_id: string | null;
          requires_completion: boolean | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          contraindication_alerts_reviewed: boolean | null;
          price_at_booking: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          patient_id: string;
          treatment_id?: string | null;
          employee_id: string;
          date: string;
          start_time: string;
          end_time: string;
          status: string;
          notes?: string | null;
          internal_notes?: string | null;
          body_chart_data?: string | null;
          treatment_parameter_values?: string | null;
          interview_notes?: string | null;
          clinical_remarks?: string | null;
          photos?: unknown | null;
          color?: string | null;
          is_recurring: boolean;
          recurring_rule?: unknown | null;
          recurring_group_id?: string | null;
          recurring_index?: number | null;
          prepayment_required?: boolean | null;
          prepayment_amount?: number | null;
          prepayment_status?: string | null;
          prepayment_paid_at?: number | null;
          package_usage_id?: string | null;
          scheduled_activity_id?: string | null;
          reminder_sent_at?: number | null;
          send_reminder?: boolean | null;
          cancelled_at?: number | null;
          cancelled_by?: string | null;
          cancellation_reason?: string | null;
          booked_from_portal?: boolean | null;
          booked_by_patient_id?: string | null;
          location_id?: string | null;
          room_id?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          requires_completion?: boolean | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          contraindication_alerts_reviewed?: boolean | null;
          price_at_booking?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          patient_id?: string;
          treatment_id?: string | null;
          employee_id?: string;
          date?: string;
          start_time?: string;
          end_time?: string;
          status?: string;
          notes?: string | null;
          internal_notes?: string | null;
          body_chart_data?: string | null;
          treatment_parameter_values?: string | null;
          interview_notes?: string | null;
          clinical_remarks?: string | null;
          photos?: unknown | null;
          color?: string | null;
          is_recurring?: boolean;
          recurring_rule?: unknown | null;
          recurring_group_id?: string | null;
          recurring_index?: number | null;
          prepayment_required?: boolean | null;
          prepayment_amount?: number | null;
          prepayment_status?: string | null;
          prepayment_paid_at?: number | null;
          package_usage_id?: string | null;
          scheduled_activity_id?: string | null;
          reminder_sent_at?: number | null;
          send_reminder?: boolean | null;
          cancelled_at?: number | null;
          cancelled_by?: string | null;
          cancellation_reason?: string | null;
          booked_from_portal?: boolean | null;
          booked_by_patient_id?: string | null;
          location_id?: string | null;
          room_id?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          requires_completion?: boolean | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
          contraindication_alerts_reviewed?: boolean | null;
          price_at_booking?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_appointments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_treatment_id_fkey";
            columns: ["treatment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_treatments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_scheduled_activity_id_fkey";
            columns: ["scheduled_activity_id"];
            isOneToOne: false;
            referencedRelation: "scheduled_activities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_booked_by_patient_id_fkey";
            columns: ["booked_by_patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_appointments_package_usage_id_fk";
            columns: ["package_usage_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_package_usage";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_treatment_packages: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          treatments: unknown;
          total_price: number;
          currency: string | null;
          discount_percent: number | null;
          validity_days: number | null;
          is_active: boolean;
          loyalty_points_awarded: number | null;
          auto_generated_for_treatment_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          treatments: unknown;
          total_price: number;
          currency?: string | null;
          discount_percent?: number | null;
          validity_days?: number | null;
          is_active: boolean;
          loyalty_points_awarded?: number | null;
          auto_generated_for_treatment_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          treatments?: unknown;
          total_price?: number;
          currency?: string | null;
          discount_percent?: number | null;
          validity_days?: number | null;
          is_active?: boolean;
          loyalty_points_awarded?: number | null;
          auto_generated_for_treatment_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_treatment_packages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatment_packages_auto_generated_for_treatment_id_fkey";
            columns: ["auto_generated_for_treatment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_treatments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_treatment_packages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_package_usage: {
        Row: {
          id: string;
          organization_id: string;
          patient_id: string;
          package_id: string;
          purchased_at: number;
          expires_at: number | null;
          status: string;
          treatments_used: unknown;
          paid_amount: number;
          payment_method: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          patient_id: string;
          package_id: string;
          purchased_at: number;
          expires_at?: number | null;
          status: string;
          treatments_used: unknown;
          paid_amount: number;
          payment_method?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          patient_id?: string;
          package_id?: string;
          purchased_at?: number;
          expires_at?: number | null;
          status?: string;
          treatments_used?: unknown;
          paid_amount?: number;
          payment_method?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_package_usage_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_package_usage_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_package_usage_package_id_fkey";
            columns: ["package_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_treatment_packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_package_usage_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_loyalty_points: {
        Row: {
          id: string;
          organization_id: string;
          patient_id: string;
          balance: number;
          lifetime_earned: number;
          lifetime_spent: number;
          tier: string | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          patient_id: string;
          balance: number;
          lifetime_earned: number;
          lifetime_spent: number;
          tier?: string | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          patient_id?: string;
          balance?: number;
          lifetime_earned?: number;
          lifetime_spent?: number;
          tier?: string | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_loyalty_points_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_loyalty_points_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_loyalty_transactions: {
        Row: {
          id: string;
          organization_id: string;
          patient_id: string;
          type: string;
          points: number;
          reason: string;
          reference_type: string | null;
          reference_id: string | null;
          balance_after: number;
          created_by: string;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          patient_id: string;
          type: string;
          points: number;
          reason: string;
          reference_type?: string | null;
          reference_id?: string | null;
          balance_after: number;
          created_by: string;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          patient_id?: string;
          type?: string;
          points?: number;
          reason?: string;
          reference_type?: string | null;
          reference_id?: string | null;
          balance_after?: number;
          created_by?: string;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_loyalty_transactions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_loyalty_transactions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_loyalty_transactions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_document_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          type: string;
          content: string;
          requires_signature: boolean;
          is_active: boolean;
          sort_order: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          type: string;
          content: string;
          requires_signature: boolean;
          is_active: boolean;
          sort_order?: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          type?: string;
          content?: string;
          requires_signature?: boolean;
          is_active?: boolean;
          sort_order?: number | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_document_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_document_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_documents: {
        Row: {
          id: string;
          organization_id: string;
          patient_id: string;
          appointment_id: string | null;
          template_id: string | null;
          title: string;
          type: string;
          content: string;
          status: string;
          signature_data: string | null;
          signed_at: number | null;
          signed_by_patient: boolean | null;
          signed_by_employee: string | null;
          file_storage_id: string | null;
          file_name: string | null;
          file_mime_type: string | null;
          tag_ids: string[] | null;
          category_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          patient_id: string;
          appointment_id?: string | null;
          template_id?: string | null;
          title: string;
          type: string;
          content: string;
          status: string;
          signature_data?: string | null;
          signed_at?: number | null;
          signed_by_patient?: boolean | null;
          signed_by_employee?: string | null;
          file_storage_id?: string | null;
          file_name?: string | null;
          file_mime_type?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          patient_id?: string;
          appointment_id?: string | null;
          template_id?: string | null;
          title?: string;
          type?: string;
          content?: string;
          status?: string;
          signature_data?: string | null;
          signed_at?: number | null;
          signed_by_patient?: boolean | null;
          signed_by_employee?: string | null;
          file_storage_id?: string | null;
          file_name?: string | null;
          file_mime_type?: string | null;
          tag_ids?: string[] | null;
          category_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_documents_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_documents_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_documents_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_document_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_documents_signed_by_employee_fkey";
            columns: ["signed_by_employee"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_documents_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_documents_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      gabinet_portal_sessions: {
        Row: {
          id: string;
          patient_id: string;
          organization_id: string;
          token_hash: string;
          otp_hash: string | null;
          otp_expires_at: number | null;
          is_active: boolean;
          last_accessed_at: number;
          created_at: number;
          expires_at: number;
          otp_send_count: number | null;
          otp_send_window_start: number | null;
          verify_fail_count: number | null;
          locked_until: number | null;
        };
        Insert: {
          id?: string;
          patient_id: string;
          organization_id: string;
          token_hash: string;
          otp_hash?: string | null;
          otp_expires_at?: number | null;
          is_active: boolean;
          last_accessed_at: number;
          created_at: number;
          expires_at: number;
          otp_send_count?: number | null;
          otp_send_window_start?: number | null;
          verify_fail_count?: number | null;
          locked_until?: number | null;
        };
        Update: {
          id?: string;
          patient_id?: string;
          organization_id?: string;
          token_hash?: string;
          otp_hash?: string | null;
          otp_expires_at?: number | null;
          is_active?: boolean;
          last_accessed_at?: number;
          created_at?: number;
          expires_at?: number;
          otp_send_count?: number | null;
          otp_send_window_start?: number | null;
          verify_fail_count?: number | null;
          locked_until?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "gabinet_portal_sessions_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gabinet_portal_sessions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_reminders: {
        Row: {
          id: string;
          organization_id: string;
          appointment_id: string;
          type: string;
          scheduled_for: number;
          sent_at: number | null;
          status: string;
          scheduled_function_id: string | null;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          appointment_id: string;
          type: string;
          scheduled_for: number;
          sent_at?: number | null;
          status: string;
          scheduled_function_id?: string | null;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          appointment_id?: string;
          type?: string;
          scheduled_for?: number;
          sent_at?: number | null;
          status?: string;
          scheduled_function_id?: string | null;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_appointments";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_workflow_history: {
        Row: {
          id: string;
          organization_id: string;
          appointment_id: string;
          workflow_event: string;
          channel: string;
          direction: string;
          source: string;
          recipient: string;
          recipient_name: string | null;
          status: string;
          rendered_subject: string | null;
          rendered_body: string | null;
          email_event_log_id: string | null;
          error_message: string | null;
          idempotency_key: string;
          processed_at: number | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          appointment_id: string;
          workflow_event: string;
          channel: string;
          direction: string;
          source: string;
          recipient: string;
          recipient_name?: string | null;
          status: string;
          rendered_subject?: string | null;
          rendered_body?: string | null;
          email_event_log_id?: string | null;
          error_message?: string | null;
          idempotency_key: string;
          processed_at?: number | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          appointment_id?: string;
          workflow_event?: string;
          channel?: string;
          direction?: string;
          source?: string;
          recipient?: string;
          recipient_name?: string | null;
          status?: string;
          rendered_subject?: string | null;
          rendered_body?: string | null;
          email_event_log_id?: string | null;
          error_message?: string | null;
          idempotency_key?: string;
          processed_at?: number | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_workflow_history_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_workflow_history_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_workflow_history_email_event_log_id_fkey";
            columns: ["email_event_log_id"];
            isOneToOne: false;
            referencedRelation: "email_event_log";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_sms_events: {
        Row: {
          id: string;
          organization_id: string;
          appointment_id: string | null;
          patient_id: string | null;
          normalized_phone: string;
          direction: string;
          provider: string;
          event_type: string;
          provider_message_id: string | null;
          correlation_key: string | null;
          reply_to_event_id: string | null;
          raw_body: string | null;
          normalized_body: string | null;
          parsed_intent: string | null;
          processing_status: string;
          processing_error: string | null;
          webhook_signature_verified: boolean | null;
          metadata: string | null;
          idempotency_key: string;
          processed_at: number | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          appointment_id?: string | null;
          patient_id?: string | null;
          normalized_phone: string;
          direction: string;
          provider: string;
          event_type: string;
          provider_message_id?: string | null;
          correlation_key?: string | null;
          reply_to_event_id?: string | null;
          raw_body?: string | null;
          normalized_body?: string | null;
          parsed_intent?: string | null;
          processing_status: string;
          processing_error?: string | null;
          webhook_signature_verified?: boolean | null;
          metadata?: string | null;
          idempotency_key: string;
          processed_at?: number | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          appointment_id?: string | null;
          patient_id?: string | null;
          normalized_phone?: string;
          direction?: string;
          provider?: string;
          event_type?: string;
          provider_message_id?: string | null;
          correlation_key?: string | null;
          reply_to_event_id?: string | null;
          raw_body?: string | null;
          normalized_body?: string | null;
          parsed_intent?: string | null;
          processing_status?: string;
          processing_error?: string | null;
          webhook_signature_verified?: boolean | null;
          metadata?: string | null;
          idempotency_key?: string;
          processed_at?: number | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_sms_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_sms_events_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_sms_events_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointment_sms_events_reply_to_event_id_fkey";
            columns: ["reply_to_event_id"];
            isOneToOne: false;
            referencedRelation: "appointment_sms_events";
            referencedColumns: ["id"];
          },
        ];
      };
      document_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          category: string;
          content: string;
          module: string;
          required_sources: string[];
          requires_signature: boolean;
          signature_slots: unknown;
          access_control: unknown;
          version: number;
          parent_template_id: string | null;
          status: string;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          category: string;
          content: string;
          module: string;
          required_sources: string[];
          requires_signature: boolean;
          signature_slots: unknown;
          access_control: unknown;
          version: number;
          parent_template_id?: string | null;
          status: string;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          category?: string;
          content?: string;
          module?: string;
          required_sources?: string[];
          requires_signature?: boolean;
          signature_slots?: unknown;
          access_control?: unknown;
          version?: number;
          parent_template_id?: string | null;
          status?: string;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_templates_parent_template_id_fkey";
            columns: ["parent_template_id"];
            isOneToOne: false;
            referencedRelation: "document_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      document_template_fields: {
        Row: {
          id: string;
          template_id: string;
          field_key: string;
          label: string;
          type: string;
          sort_order: number;
          group: string | null;
          options: unknown | null;
          default_value: string | null;
          binding: unknown | null;
          validation: unknown | null;
          placeholder: string | null;
          help_text: string | null;
          width: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          field_key: string;
          label: string;
          type: string;
          sort_order: number;
          group?: string | null;
          options?: unknown | null;
          default_value?: string | null;
          binding?: unknown | null;
          validation?: unknown | null;
          placeholder?: string | null;
          help_text?: string | null;
          width: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          field_key?: string;
          label?: string;
          type?: string;
          sort_order?: number;
          group?: string | null;
          options?: unknown | null;
          default_value?: string | null;
          binding?: unknown | null;
          validation?: unknown | null;
          placeholder?: string | null;
          help_text?: string | null;
          width?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_template_fields_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "document_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      document_instances: {
        Row: {
          id: string;
          organization_id: string;
          type: string | null;
          template_id: string | null;
          template_version: number | null;
          rendered_content: string | null;
          field_values: unknown | null;
          resolved_sources: unknown | null;
          file_id: string | null;
          file_url: string | null;
          file_name: string | null;
          mime_type: string | null;
          file_size: number | null;
          category: string | null;
          title: string;
          status: string;
          module: string | null;
          signatures: unknown;
          pdf_file_id: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          assigned_reviewer_id: string | null;
          assigned_reviewer_name: string | null;
          reviewed_by: string | null;
          reviewed_at: number | null;
          approved_by: string | null;
          approved_at: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          type?: string | null;
          template_id?: string | null;
          template_version?: number | null;
          rendered_content?: string | null;
          field_values?: unknown | null;
          resolved_sources?: unknown | null;
          file_id?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          category?: string | null;
          title: string;
          status: string;
          module?: string | null;
          signatures: unknown;
          pdf_file_id?: string | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          assigned_reviewer_id?: string | null;
          assigned_reviewer_name?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: number | null;
          approved_by?: string | null;
          approved_at?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          type?: string | null;
          template_id?: string | null;
          template_version?: number | null;
          rendered_content?: string | null;
          field_values?: unknown | null;
          resolved_sources?: unknown | null;
          file_id?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          file_size?: number | null;
          category?: string | null;
          title?: string;
          status?: string;
          module?: string | null;
          signatures?: unknown;
          pdf_file_id?: string | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
          assigned_reviewer_id?: string | null;
          assigned_reviewer_name?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: number | null;
          approved_by?: string | null;
          approved_at?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_instances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_instances_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "document_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_instances_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_instances_assigned_reviewer_id_fkey";
            columns: ["assigned_reviewer_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_instances_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_instances_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      signature_requests: {
        Row: {
          id: string;
          organization_id: string;
          instance_id: string;
          slot_id: string;
          token: string;
          signer_email: string | null;
          signer_name: string | null;
          signer_phone: string | null;
          signer_user_id: string | null;
          verification_method: string;
          status: string;
          otp_hash: string | null;
          otp_sent_at: number | null;
          otp_attempts: number | null;
          expires_at: number;
          signed_at: number | null;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          instance_id: string;
          slot_id: string;
          token: string;
          signer_email?: string | null;
          signer_name?: string | null;
          signer_phone?: string | null;
          signer_user_id?: string | null;
          verification_method: string;
          status: string;
          otp_hash?: string | null;
          otp_sent_at?: number | null;
          otp_attempts?: number | null;
          expires_at: number;
          signed_at?: number | null;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          instance_id?: string;
          slot_id?: string;
          token?: string;
          signer_email?: string | null;
          signer_name?: string | null;
          signer_phone?: string | null;
          signer_user_id?: string | null;
          verification_method?: string;
          status?: string;
          otp_hash?: string | null;
          otp_sent_at?: number | null;
          otp_attempts?: number | null;
          expires_at?: number;
          signed_at?: number | null;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "signature_requests_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_requests_instance_id_fkey";
            columns: ["instance_id"];
            isOneToOne: false;
            referencedRelation: "document_instances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "signature_requests_signer_user_id_fkey";
            columns: ["signer_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      form_templates: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          category: string;
          folder_path: string | null;
          template_type: string | null;
          form_json: string;
          content_json: string | null;
          theme_json: string | null;
          modules: string[];
          entity_types: string[];
          variable_bindings: string | null;
          requires_signature: boolean;
          signature_config: unknown | null;
          access_roles: string[] | null;
          version: number;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          category: string;
          folder_path?: string | null;
          template_type?: string | null;
          form_json: string;
          content_json?: string | null;
          theme_json?: string | null;
          modules: string[];
          entity_types: string[];
          variable_bindings?: string | null;
          requires_signature: boolean;
          signature_config?: unknown | null;
          access_roles?: string[] | null;
          version: number;
          is_active: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          category?: string;
          folder_path?: string | null;
          template_type?: string | null;
          form_json?: string;
          content_json?: string | null;
          theme_json?: string | null;
          modules?: string[];
          entity_types?: string[];
          variable_bindings?: string | null;
          requires_signature?: boolean;
          signature_config?: unknown | null;
          access_roles?: string[] | null;
          version?: number;
          is_active?: boolean;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "form_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_templates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      form_documents: {
        Row: {
          id: string;
          organization_id: string;
          template_id: string;
          title: string;
          response_data: string;
          entity_type: string;
          entity_id: string;
          scope_entities: string | null;
          status: string;
          signature_data: string | null;
          signed_at: number | null;
          signed_by_name: string | null;
          signed_by_email: string | null;
          signed_by_ip: string | null;
          signature_verification_method: string | null;
          signing_token: string | null;
          signing_token_expires_at: number | null;
          signing_email_sent_at: number | null;
          signing_reminder_count: number | null;
          timing: string | null;
          auto_generated: boolean | null;
          pdf_storage_id: string | null;
          pdf_generated_at: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          sort_order: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          template_id: string;
          title: string;
          response_data: string;
          entity_type: string;
          entity_id: string;
          scope_entities?: string | null;
          status: string;
          signature_data?: string | null;
          signed_at?: number | null;
          signed_by_name?: string | null;
          signed_by_email?: string | null;
          signed_by_ip?: string | null;
          signature_verification_method?: string | null;
          signing_token?: string | null;
          signing_token_expires_at?: number | null;
          signing_email_sent_at?: number | null;
          signing_reminder_count?: number | null;
          timing?: string | null;
          auto_generated?: boolean | null;
          pdf_storage_id?: string | null;
          pdf_generated_at?: number | null;
          created_by: string;
          created_at: number;
          updated_at: number;
          sort_order?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          template_id?: string;
          title?: string;
          response_data?: string;
          entity_type?: string;
          entity_id?: string;
          scope_entities?: string | null;
          status?: string;
          signature_data?: string | null;
          signed_at?: number | null;
          signed_by_name?: string | null;
          signed_by_email?: string | null;
          signed_by_ip?: string | null;
          signature_verification_method?: string | null;
          signing_token?: string | null;
          signing_token_expires_at?: number | null;
          signing_email_sent_at?: number | null;
          signing_reminder_count?: number | null;
          timing?: string | null;
          auto_generated?: boolean | null;
          pdf_storage_id?: string | null;
          pdf_generated_at?: number | null;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
          sort_order?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "form_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_documents_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "form_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "form_documents_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_rules: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          module: string;
          event_type: string;
          entity_type: string | null;
          trigger: unknown | null;
          graph: unknown | null;
          definition_version: number | null;
          conditions: unknown;
          actions: unknown;
          enabled: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          module: string;
          event_type: string;
          entity_type?: string | null;
          trigger?: unknown | null;
          graph?: unknown | null;
          definition_version?: number | null;
          conditions: unknown;
          actions: unknown;
          enabled: boolean;
          created_by: string;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          description?: string | null;
          module?: string;
          event_type?: string;
          entity_type?: string | null;
          trigger?: unknown | null;
          graph?: unknown | null;
          definition_version?: number | null;
          conditions?: unknown;
          actions?: unknown;
          enabled?: boolean;
          created_by?: string;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_rules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_runs: {
        Row: {
          id: string;
          organization_id: string;
          rule_id: string | null;
          module: string;
          event_type: string;
          entity_type: string | null;
          entity_id: string | null;
          event_idempotency_key: string;
          correlation_key: string | null;
          payload_snapshot: string;
          actor_user_id: string | null;
          status: string;
          error_message: string | null;
          occurred_at: number;
          processed_at: number | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          rule_id?: string | null;
          module: string;
          event_type: string;
          entity_type?: string | null;
          entity_id?: string | null;
          event_idempotency_key: string;
          correlation_key?: string | null;
          payload_snapshot: string;
          actor_user_id?: string | null;
          status: string;
          error_message?: string | null;
          occurred_at: number;
          processed_at?: number | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          rule_id?: string | null;
          module?: string;
          event_type?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          event_idempotency_key?: string;
          correlation_key?: string | null;
          payload_snapshot?: string;
          actor_user_id?: string | null;
          status?: string;
          error_message?: string | null;
          occurred_at?: number;
          processed_at?: number | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "automation_runs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_runs_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "automation_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_runs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      automation_run_steps: {
        Row: {
          id: string;
          organization_id: string;
          run_id: string;
          rule_id: string | null;
          action_index: number;
          action_type: string;
          idempotency_key: string;
          status: string;
          recipient: string | null;
          recipient_name: string | null;
          linked_entity_type: string | null;
          linked_entity_id: string | null;
          rendered_subject: string | null;
          rendered_body: string | null;
          metadata_snapshot: string | null;
          error_message: string | null;
          email_event_log_id: string | null;
          appointment_sms_event_id: string | null;
          processed_at: number | null;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          run_id: string;
          rule_id?: string | null;
          action_index: number;
          action_type: string;
          idempotency_key: string;
          status: string;
          recipient?: string | null;
          recipient_name?: string | null;
          linked_entity_type?: string | null;
          linked_entity_id?: string | null;
          rendered_subject?: string | null;
          rendered_body?: string | null;
          metadata_snapshot?: string | null;
          error_message?: string | null;
          email_event_log_id?: string | null;
          appointment_sms_event_id?: string | null;
          processed_at?: number | null;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          run_id?: string;
          rule_id?: string | null;
          action_index?: number;
          action_type?: string;
          idempotency_key?: string;
          status?: string;
          recipient?: string | null;
          recipient_name?: string | null;
          linked_entity_type?: string | null;
          linked_entity_id?: string | null;
          rendered_subject?: string | null;
          rendered_body?: string | null;
          metadata_snapshot?: string | null;
          error_message?: string | null;
          email_event_log_id?: string | null;
          appointment_sms_event_id?: string | null;
          processed_at?: number | null;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "automation_run_steps_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_run_steps_run_id_fkey";
            columns: ["run_id"];
            isOneToOne: false;
            referencedRelation: "automation_runs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_run_steps_rule_id_fkey";
            columns: ["rule_id"];
            isOneToOne: false;
            referencedRelation: "automation_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_run_steps_email_event_log_id_fkey";
            columns: ["email_event_log_id"];
            isOneToOne: false;
            referencedRelation: "email_event_log";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "automation_run_steps_appointment_sms_event_id_fkey";
            columns: ["appointment_sms_event_id"];
            isOneToOne: false;
            referencedRelation: "appointment_sms_events";
            referencedColumns: ["id"];
          },
        ];
      };
      document_components: {
        Row: {
          id: string;
          organization_id: string | null;
          scope: string;
          created_by: string | null;
          name: string;
          description: string | null;
          category: string;
          content_json: string;
          protected: boolean;
          position_constraint: string | null;
          version: number;
          is_active: boolean;
          created_at: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          scope: string;
          created_by?: string | null;
          name: string;
          description?: string | null;
          category: string;
          content_json: string;
          protected?: boolean;
          position_constraint?: string | null;
          version?: number;
          is_active?: boolean;
          created_at: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          scope?: string;
          created_by?: string | null;
          name?: string;
          description?: string | null;
          category?: string;
          content_json?: string;
          protected?: boolean;
          position_constraint?: string | null;
          version?: number;
          is_active?: boolean;
          created_at?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_components_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_components_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      product_stock_levels: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          location_id: string | null;
          quantity: number;
          updated_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          location_id?: string | null;
          quantity?: number;
          updated_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          product_id?: string;
          location_id?: string | null;
          quantity?: number;
          updated_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_stock_levels_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stock_levels_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stock_levels_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      product_stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          location_id: string | null;
          delta: number;
          balance_after: number | null;
          reason: string;
          source_type: string | null;
          source_id: string | null;
          note: string | null;
          performed_by: string;
          created_at: number;
        };
        Insert: {
          id?: string;
          organization_id: string;
          product_id: string;
          location_id?: string | null;
          delta: number;
          balance_after?: number | null;
          reason: string;
          source_type?: string | null;
          source_id?: string | null;
          note?: string | null;
          performed_by: string;
          created_at: number;
        };
        Update: {
          id?: string;
          organization_id?: string;
          product_id?: string;
          location_id?: string | null;
          delta?: number;
          balance_after?: number | null;
          reason?: string;
          source_type?: string | null;
          source_id?: string | null;
          note?: string | null;
          performed_by?: string;
          created_at?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_stock_movements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stock_movements_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "gabinet_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stock_movements_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      app_schema_version: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience alias for a contacts row */
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];
export type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];

export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type CompanyInsert = Database["public"]["Tables"]["companies"]["Insert"];
export type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];
export type ProductRow = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
export type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
export type NoteInsert = Database["public"]["Tables"]["notes"]["Insert"];
export type NoteUpdate = Database["public"]["Tables"]["notes"]["Update"];
export type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
export type ActivityInsert = Database["public"]["Tables"]["activities"]["Insert"];
export type ActivityUpdate = Database["public"]["Tables"]["activities"]["Update"];
export type CallRow = Database["public"]["Tables"]["calls"]["Row"];
export type CallInsert = Database["public"]["Tables"]["calls"]["Insert"];
export type CallUpdate = Database["public"]["Tables"]["calls"]["Update"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type DocumentInsert = Database["public"]["Tables"]["documents"]["Insert"];
export type DocumentUpdate = Database["public"]["Tables"]["documents"]["Update"];
export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
export type SourceInsert = Database["public"]["Tables"]["sources"]["Insert"];
export type SourceUpdate = Database["public"]["Tables"]["sources"]["Update"];
export type SavedViewRow = Database["public"]["Tables"]["saved_views"]["Row"];
export type SavedViewInsert = Database["public"]["Tables"]["saved_views"]["Insert"];
export type SavedViewUpdate = Database["public"]["Tables"]["saved_views"]["Update"];
export type LostReasonRow = Database["public"]["Tables"]["lost_reasons"]["Row"];
export type LostReasonInsert = Database["public"]["Tables"]["lost_reasons"]["Insert"];
export type LostReasonUpdate = Database["public"]["Tables"]["lost_reasons"]["Update"];
export type CustomFieldDefinitionRow = Database["public"]["Tables"]["custom_field_definitions"]["Row"];
export type CustomFieldDefinitionInsert = Database["public"]["Tables"]["custom_field_definitions"]["Insert"];
export type CustomFieldDefinitionUpdate = Database["public"]["Tables"]["custom_field_definitions"]["Update"];
export type CustomFieldValueRow = Database["public"]["Tables"]["custom_field_values"]["Row"];
export type CustomFieldValueInsert = Database["public"]["Tables"]["custom_field_values"]["Insert"];
export type CustomFieldValueUpdate = Database["public"]["Tables"]["custom_field_values"]["Update"];
export type ObjectRelationshipRow = Database["public"]["Tables"]["object_relationships"]["Row"];
export type ObjectRelationshipInsert = Database["public"]["Tables"]["object_relationships"]["Insert"];
export type ObjectRelationshipUpdate = Database["public"]["Tables"]["object_relationships"]["Update"];
export type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];
export type PipelineRow = Database["public"]["Tables"]["pipelines"]["Row"];
export type PipelineInsert = Database["public"]["Tables"]["pipelines"]["Insert"];
export type PipelineUpdate = Database["public"]["Tables"]["pipelines"]["Update"];
export type PipelineStageRow = Database["public"]["Tables"]["pipeline_stages"]["Row"];
export type PipelineStageInsert = Database["public"]["Tables"]["pipeline_stages"]["Insert"];
export type PipelineStageUpdate = Database["public"]["Tables"]["pipeline_stages"]["Update"];
export type PipelineStageActionRow = Database["public"]["Tables"]["pipeline_stage_actions"]["Row"];
export type PipelineStageActionInsert = Database["public"]["Tables"]["pipeline_stage_actions"]["Insert"];
export type PipelineStageActionUpdate = Database["public"]["Tables"]["pipeline_stage_actions"]["Update"];
export type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
export type OrganizationInsert = Database["public"]["Tables"]["organizations"]["Insert"];
export type OrganizationUpdate = Database["public"]["Tables"]["organizations"]["Update"];
export type TeamMembershipRow = Database["public"]["Tables"]["team_memberships"]["Row"];
export type TeamMembershipInsert = Database["public"]["Tables"]["team_memberships"]["Insert"];
export type TeamMembershipUpdate = Database["public"]["Tables"]["team_memberships"]["Update"];
export type InvitationRow = Database["public"]["Tables"]["invitations"]["Row"];
export type InvitationInsert = Database["public"]["Tables"]["invitations"]["Insert"];
export type InvitationUpdate = Database["public"]["Tables"]["invitations"]["Update"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];
export type NotificationUpdate = Database["public"]["Tables"]["notifications"]["Update"];
export type RecentlyViewedRow = Database["public"]["Tables"]["recently_viewed"]["Row"];
export type RecentlyViewedInsert = Database["public"]["Tables"]["recently_viewed"]["Insert"];
export type RecentlyViewedUpdate = Database["public"]["Tables"]["recently_viewed"]["Update"];
export type OrgSettingsRow = Database["public"]["Tables"]["org_settings"]["Row"];
export type OrgSettingsInsert = Database["public"]["Tables"]["org_settings"]["Insert"];
export type OrgSettingsUpdate = Database["public"]["Tables"]["org_settings"]["Update"];
export type AuditLogRow = Database["public"]["Tables"]["audit_log"]["Row"];
export type AuditLogInsert = Database["public"]["Tables"]["audit_log"]["Insert"];
export type AuditLogUpdate = Database["public"]["Tables"]["audit_log"]["Update"];
export type ActivityTypeDefinitionRow = Database["public"]["Tables"]["activity_type_definitions"]["Row"];
export type ActivityTypeDefinitionInsert = Database["public"]["Tables"]["activity_type_definitions"]["Insert"];
export type ActivityTypeDefinitionUpdate = Database["public"]["Tables"]["activity_type_definitions"]["Update"];
export type ScheduledActivityRow = Database["public"]["Tables"]["scheduled_activities"]["Row"];
export type ScheduledActivityInsert = Database["public"]["Tables"]["scheduled_activities"]["Insert"];
export type ScheduledActivityUpdate = Database["public"]["Tables"]["scheduled_activities"]["Update"];
export type EmailSequenceRow = Database["public"]["Tables"]["email_sequences"]["Row"];
export type EmailSequenceInsert = Database["public"]["Tables"]["email_sequences"]["Insert"];
export type EmailSequenceUpdate = Database["public"]["Tables"]["email_sequences"]["Update"];
export type GabinetPatientRow = Database["public"]["Tables"]["gabinet_patients"]["Row"];
export type GabinetPatientInsert = Database["public"]["Tables"]["gabinet_patients"]["Insert"];
export type GabinetPatientUpdate = Database["public"]["Tables"]["gabinet_patients"]["Update"];
export type GabinetTreatmentRow = Database["public"]["Tables"]["gabinet_treatments"]["Row"];
export type GabinetTreatmentInsert = Database["public"]["Tables"]["gabinet_treatments"]["Insert"];
export type GabinetTreatmentUpdate = Database["public"]["Tables"]["gabinet_treatments"]["Update"];
export type GabinetTreatmentVariantRow = Database["public"]["Tables"]["gabinet_treatment_variants"]["Row"];
export type GabinetTreatmentVariantInsert = Database["public"]["Tables"]["gabinet_treatment_variants"]["Insert"];
export type GabinetTreatmentVariantUpdate = Database["public"]["Tables"]["gabinet_treatment_variants"]["Update"];
export type GabinetTreatmentProductRow = Database["public"]["Tables"]["gabinet_treatment_products"]["Row"];
export type GabinetTreatmentProductInsert = Database["public"]["Tables"]["gabinet_treatment_products"]["Insert"];
export type GabinetTreatmentProductUpdate = Database["public"]["Tables"]["gabinet_treatment_products"]["Update"];
export type GabinetEmployeeRow = Database["public"]["Tables"]["gabinet_employees"]["Row"];
export type GabinetEmployeeInsert = Database["public"]["Tables"]["gabinet_employees"]["Insert"];
export type GabinetEmployeeUpdate = Database["public"]["Tables"]["gabinet_employees"]["Update"];
export type GabinetLocationRow = Database["public"]["Tables"]["gabinet_locations"]["Row"];
export type GabinetLocationInsert = Database["public"]["Tables"]["gabinet_locations"]["Insert"];
export type GabinetLocationUpdate = Database["public"]["Tables"]["gabinet_locations"]["Update"];
export type GabinetRoomRow = Database["public"]["Tables"]["gabinet_rooms"]["Row"];
export type GabinetRoomInsert = Database["public"]["Tables"]["gabinet_rooms"]["Insert"];
export type GabinetRoomUpdate = Database["public"]["Tables"]["gabinet_rooms"]["Update"];
export type GabinetEquipmentRow = Database["public"]["Tables"]["gabinet_equipment"]["Row"];
export type GabinetEquipmentInsert = Database["public"]["Tables"]["gabinet_equipment"]["Insert"];
export type GabinetEquipmentUpdate = Database["public"]["Tables"]["gabinet_equipment"]["Update"];
export type GabinetEquipmentTransferRow = Database["public"]["Tables"]["gabinet_equipment_transfers"]["Row"];
export type GabinetEquipmentTransferInsert = Database["public"]["Tables"]["gabinet_equipment_transfers"]["Insert"];
export type GabinetEquipmentTransferUpdate = Database["public"]["Tables"]["gabinet_equipment_transfers"]["Update"];
export type GabinetLeaveTypeRow = Database["public"]["Tables"]["gabinet_leave_types"]["Row"];
export type GabinetLeaveTypeInsert = Database["public"]["Tables"]["gabinet_leave_types"]["Insert"];
export type GabinetLeaveTypeUpdate = Database["public"]["Tables"]["gabinet_leave_types"]["Update"];
export type GabinetLeaveBalanceRow = Database["public"]["Tables"]["gabinet_leave_balances"]["Row"];
export type GabinetLeaveBalanceInsert = Database["public"]["Tables"]["gabinet_leave_balances"]["Insert"];
export type GabinetLeaveBalanceUpdate = Database["public"]["Tables"]["gabinet_leave_balances"]["Update"];
export type GabinetWorkingHoursRow = Database["public"]["Tables"]["gabinet_working_hours"]["Row"];
export type GabinetWorkingHoursInsert = Database["public"]["Tables"]["gabinet_working_hours"]["Insert"];
export type GabinetWorkingHoursUpdate = Database["public"]["Tables"]["gabinet_working_hours"]["Update"];
export type GabinetEmployeeScheduleRow = Database["public"]["Tables"]["gabinet_employee_schedules"]["Row"];
export type GabinetEmployeeScheduleInsert = Database["public"]["Tables"]["gabinet_employee_schedules"]["Insert"];
export type GabinetEmployeeScheduleUpdate = Database["public"]["Tables"]["gabinet_employee_schedules"]["Update"];
export type GabinetAppointmentRow = Database["public"]["Tables"]["gabinet_appointments"]["Row"];
export type GabinetAppointmentInsert = Database["public"]["Tables"]["gabinet_appointments"]["Insert"];
export type GabinetAppointmentUpdate = Database["public"]["Tables"]["gabinet_appointments"]["Update"];
export type GabinetLeaveRow = Database["public"]["Tables"]["gabinet_leaves"]["Row"];
export type GabinetLeaveInsert = Database["public"]["Tables"]["gabinet_leaves"]["Insert"];
export type GabinetLeaveUpdate = Database["public"]["Tables"]["gabinet_leaves"]["Update"];
export type GabinetOvertimeRow = Database["public"]["Tables"]["gabinet_overtime"]["Row"];
export type GabinetOvertimeInsert = Database["public"]["Tables"]["gabinet_overtime"]["Insert"];
export type GabinetOvertimeUpdate = Database["public"]["Tables"]["gabinet_overtime"]["Update"];
export type GabinetDocumentTemplateRow = Database["public"]["Tables"]["gabinet_document_templates"]["Row"];
export type GabinetDocumentTemplateInsert = Database["public"]["Tables"]["gabinet_document_templates"]["Insert"];
export type GabinetDocumentTemplateUpdate = Database["public"]["Tables"]["gabinet_document_templates"]["Update"];
export type GabinetDocumentRow = Database["public"]["Tables"]["gabinet_documents"]["Row"];
export type GabinetDocumentInsert = Database["public"]["Tables"]["gabinet_documents"]["Insert"];
export type GabinetDocumentUpdate = Database["public"]["Tables"]["gabinet_documents"]["Update"];
export type GabinetTreatmentPackageRow = Database["public"]["Tables"]["gabinet_treatment_packages"]["Row"];
export type GabinetTreatmentPackageInsert = Database["public"]["Tables"]["gabinet_treatment_packages"]["Insert"];
export type GabinetTreatmentPackageUpdate = Database["public"]["Tables"]["gabinet_treatment_packages"]["Update"];
export type GabinetPackageUsageRow = Database["public"]["Tables"]["gabinet_package_usage"]["Row"];
export type GabinetPackageUsageInsert = Database["public"]["Tables"]["gabinet_package_usage"]["Insert"];
export type GabinetPackageUsageUpdate = Database["public"]["Tables"]["gabinet_package_usage"]["Update"];
export type GabinetLoyaltyPointsRow = Database["public"]["Tables"]["gabinet_loyalty_points"]["Row"];
export type GabinetLoyaltyPointsInsert = Database["public"]["Tables"]["gabinet_loyalty_points"]["Insert"];
export type GabinetLoyaltyPointsUpdate = Database["public"]["Tables"]["gabinet_loyalty_points"]["Update"];
export type GabinetLoyaltyTransactionRow = Database["public"]["Tables"]["gabinet_loyalty_transactions"]["Row"];
export type GabinetLoyaltyTransactionInsert = Database["public"]["Tables"]["gabinet_loyalty_transactions"]["Insert"];
export type GabinetLoyaltyTransactionUpdate = Database["public"]["Tables"]["gabinet_loyalty_transactions"]["Update"];
