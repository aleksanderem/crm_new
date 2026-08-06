/**
 * React Query hooks for fetching invitations from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
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
