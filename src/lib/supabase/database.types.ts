/**
 * Supabase Database Types
 *
 * Hand-written types matching the PostgreSQL schema in
 * supabase/migrations/00001_initial_schema.sql.
 *
 * Follows the standard Supabase `Database` type envelope:
 *   Database → public → Tables → <table> → Row / Insert / Update
 */

export interface Database {
  public: {
    Tables: {
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
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience alias for a contacts row */
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];
export type ContactUpdate = Database["public"]["Tables"]["contacts"]["Update"];
