/**
 * React Query hooks for fetching organizations, members, settings, and usage from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapOrganizationFromSupabase,
  mapOrgSettingsFromSupabase,
  type MappedOrganization,
  type MappedOrgSettings,
} from "@/lib/supabase/mappers";

// ── Organization Detail ───────────────────────────────────────────────────────

export function useSupabaseOrganization(organizationId: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedOrganization | null, Error>({
    queryKey: supabaseKeys.organizations.detail(organizationId, organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .single();

      if (error) throw error;
      return data ? mapOrganizationFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Organization Members (JOIN team_memberships + users) ──────────────────────

export interface OrganizationMember {
  _id: string;
  userId: string;
  organizationId: string;
  role: string;
  invitedBy?: string;
  joinedAt: number;
  user: {
    _id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
}

export function useSupabaseOrganizationMembers(
  organizationId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<OrganizationMember[], Error>({
    queryKey: [...supabaseKeys.teamMemberships.list(organizationId), "members"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("team_memberships")
        .select(`
          id,
          user_id,
          organization_id,
          role,
          invited_by,
          joined_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            email,
            image
          )
        `)
        .eq("organization_id", organizationId) as any;

      if (error) throw error;

      return ((data as any[]) ?? []).map((row: any) => ({
        _id: row.id,
        userId: row.user_id,
        organizationId: row.organization_id,
        role: row.role,
        invitedBy: row.invited_by ?? undefined,
        joinedAt: row.joined_at,
        user: row.users
          ? {
              _id: row.users.id,
              name: row.users.name ?? null,
              email: row.users.email ?? null,
              image: row.users.image ?? null,
            }
          : null,
      }));
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Org Settings ──────────────────────────────────────────────────────────────

export function useSupabaseOrgSettings(organizationId: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedOrgSettings | null, Error>({
    queryKey: supabaseKeys.orgSettings.detail(organizationId, organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("org_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapOrgSettingsFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Org Usage Stats ───────────────────────────────────────────────────────────

export interface OrgUsageStats {
  memberCount: number;
  contactCount: number;
  companyCount: number;
  leadCount: number;
  documentCount: number;
  productCount: number;
  emailCount: number;
}

export function useSupabaseOrgUsageStats(organizationId: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<OrgUsageStats, Error>({
    queryKey: [...supabaseKeys.organizations.detail(organizationId, organizationId), "usageStats"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const [members, contacts, companies, leads, documents, products, emails] =
        await Promise.all([
          client.from("team_memberships").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
          client.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
          client.from("companies").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
          client.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
          client.from("documents").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
          client.from("products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
          client.from("emails").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        ]);

      return {
        memberCount: members.count ?? 0,
        contactCount: contacts.count ?? 0,
        companyCount: companies.count ?? 0,
        leadCount: leads.count ?? 0,
        documentCount: documents.count ?? 0,
        productCount: products.count ?? 0,
        emailCount: emails.count ?? 0,
      };
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
