/**
 * React Query hooks for fetching invitations from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { createAnonSupabaseClient } from "@/lib/supabase/client";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapInvitationFromSupabase, type MappedInvitation } from "@/lib/supabase/mappers";

export function useSupabasePendingInvitations(organizationId: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedInvitation[], Error>({
    queryKey: [...supabaseKeys.invitations.list(organizationId), "pending"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("invitations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapInvitationFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

export interface InvitationByTokenResult {
  invitation: {
    _id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: number;
    createdAt: number;
    module: string | null;
  };
  orgName: string | null;
  inviterName: string | null;
}

// Module-level singleton — avoids creating a new client on every render.
// No auth header; relies on SECURITY DEFINER functions granted to the anon role.
const anonClient = createAnonSupabaseClient();

/**
 * Fetches invitation details by token without requiring SupabaseProvider.
 *
 * Uses an unauthenticated (anon-key-only) client and calls the
 * `get_invitation_by_token` SECURITY DEFINER function. Intended for the
 * login-page invite banner, which renders before the user has a JWT.
 */
export function useAnonSupabaseInvitationByToken(token: string, options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  return useQuery<InvitationByTokenResult | null, Error>({
    queryKey: ["supabase", "invitations", "byToken", "anon", token],
    queryFn: async () => {
      const { data, error } = await anonClient
        .rpc("get_invitation_by_token", { p_token: token });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return null;

      return {
        invitation: {
          _id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          module: row.module ?? null,
        },
        orgName: row.org_name ?? null,
        inviterName: row.inviter_name ?? null,
      };
    },
    enabled: enabled && !!token,
  });
}

export function useSupabaseInvitationByToken(token: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<InvitationByTokenResult | null, Error>({
    queryKey: ["supabase", "invitations", "byToken", token],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data: inv, error: invError } = await client
        .from("invitations")
        .select("*")
        .eq("token", token)
        .maybeSingle();

      if (invError) throw invError;
      if (!inv) return null;

      const [orgRes, inviterRes] = await Promise.all([
        client.from("organizations").select("name").eq("id", inv.organization_id).maybeSingle(),
        client.from("users").select("name").eq("id", inv.invited_by).maybeSingle(),
      ]);

      return {
        invitation: {
          _id: inv.id,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          expiresAt: inv.expires_at,
          createdAt: inv.created_at,
          module: inv.module,
        },
        orgName: orgRes.data?.name ?? null,
        inviterName: inviterRes.data?.name ?? null,
      };
    },
    enabled: enabled && isReady && !!token,
  });
}
