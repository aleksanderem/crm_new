/**
 * React Query hooks for fetching organizations, members, settings, and usage from Supabase.
 */

import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSupabase } from "@/components/supabase-provider";
import { createSupabaseClient, SUPABASE_URL } from "@/lib/supabase/client";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapOrganizationFromSupabase,
  mapOrgSettingsFromSupabase,
  type MappedOrganization,
  type MappedOrgSettings,
} from "@/lib/supabase/mappers";

/** Refresh the user-scoped token when it's within this many seconds of expiring. */
const USER_TOKEN_REFRESH_BUFFER_SECS = 5 * 60;

// ── My Organizations (bootstrap — no org context in JWT) ─────────────────────

export interface MyOrganization extends MappedOrganization {
  role: string;
}

/**
 * Fetches the list of organizations the current user belongs to, sorted
 * most-recently-joined first.
 *
 * This hook is intentionally called ABOVE SupabaseProvider (in DashboardLayout,
 * before OrgProvider is mounted). It mints a user-scoped token (no org_id
 * claim) and creates its own short-lived Supabase client so the org bootstrap
 * query can hit Supabase instead of reading stale Convex data.
 *
 * Requires migration 00102 (user-own SELECT policies on team_memberships and
 * organizations) to be applied.
 */
export function useSupabaseMyOrganizations(userId: string | undefined) {
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known)
  const mintUserToken = useAction(api.supabase.jwt.mintUserToken);

  // Cache the user-scoped JWT to avoid minting on every React Query refetch.
  // Includes userId so a user switch within the same component instance doesn't
  // serve a stale token from the previous user.
  const tokenCacheRef = useRef<{ userId: string; token: string; expiresAt: number } | null>(null);

  return useQuery<MyOrganization[], Error>({
    queryKey: ["supabase", "organizations", "my", userId ?? ""],
    queryFn: async () => {
      const now = Date.now() / 1000;
      const cached = tokenCacheRef.current;
      const isCacheValid =
        cached !== null &&
        cached.userId === userId &&
        now < cached.expiresAt - USER_TOKEN_REFRESH_BUFFER_SECS;

      let token: string;
      if (isCacheValid) {
        token = cached.token;
      } else {
        const minted = await mintUserToken({});
        tokenCacheRef.current = { userId: userId!, token: minted.token, expiresAt: minted.expiresAt };
        token = minted.token;
      }

      const client = createSupabaseClient(SUPABASE_URL, token);

      const { data, error } = await (client
        .from("team_memberships")
        .select(`
          role,
          joined_at,
          organizations!team_memberships_organization_id_fkey (*)
        `)
        .order("joined_at", { ascending: false }) as any);

      if (error) throw error;

      return ((data as any[]) ?? [])
        .filter((row: any) => row.organizations)
        .map((row: any) => ({
          ...mapOrganizationFromSupabase(row.organizations as any),
          role: row.role as string,
        }));
    },
    enabled: !!userId,
  });
}

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

// ── Seat Usage ────────────────────────────────────────────────────────────────

export interface SeatUsage {
  currentSeats: number;
  seatLimit: number;
  canAddMore: boolean;
}

/**
 * Reads seat counts (team_memberships + pending invitations) from Supabase and
 * seat limit from Convex (subscriptions/plans are Convex-only tables).
 */
export function useSupabaseSeatUsage(organizationId: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  const countsQuery = useQuery<{ memberCount: number; pendingCount: number }, Error>({
    queryKey: [...supabaseKeys.teamMemberships.list(organizationId), "seatCounts"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");
      const [members, invitations] = await Promise.all([
        client.from("team_memberships").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
        client.from("invitations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
      ]);
      if (members.error) throw members.error;
      if (invitations.error) throw invitations.error;
      return { memberCount: members.count ?? 0, pendingCount: invitations.count ?? 0 };
    },
    enabled: enabled && isReady && !!organizationId,
  });

  // @ts-ignore — TS2589: convexQuery type instantiation too deep, runtime is correct
  const limitQuery = useQuery(convexQuery(api.organizations.getSeatLimit, { organizationId }));

  const data = useMemo<SeatUsage | undefined>(() => {
    if (!countsQuery.data || !limitQuery.data) return undefined;
    const currentSeats = countsQuery.data.memberCount + countsQuery.data.pendingCount;
    const seatLimit = (limitQuery.data as { seatLimit: number }).seatLimit;
    return { currentSeats, seatLimit, canAddMore: currentSeats < seatLimit };
  }, [countsQuery.data, limitQuery.data]);

  return {
    data,
    isLoading: countsQuery.isLoading || limitQuery.isLoading,
    error: countsQuery.error ?? limitQuery.error ?? null,
  };
}
