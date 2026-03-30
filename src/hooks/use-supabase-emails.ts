/**
 * React Query hooks for fetching emails from Supabase (PostgreSQL).
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapEmailFromSupabase,
  type MappedEmail,
} from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Inbox List (paginated with optional filters)
// ---------------------------------------------------------------------------

interface UseSupabaseEmailsListOptions {
  enabled?: boolean;
  limit?: number;
  search?: string;
  isRead?: boolean;
  direction?: "inbound" | "outbound";
  mailProviderId?: string;
}

export function useSupabaseEmailsList(
  organizationId: string,
  options: UseSupabaseEmailsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    limit = 50,
    search,
    isRead,
    direction,
    mailProviderId,
  } = options;

  return useQuery<
    { page: MappedEmail[]; continueCursor: string; isDone: boolean },
    Error
  >({
    queryKey: [
      ...supabaseKeys.emails.list(organizationId),
      search ?? "",
      isRead ?? "all",
      direction ?? "all",
      mailProviderId ?? "",
      limit,
    ],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      // Break deep type chain with explicit intermediate type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = client
        .from("emails")
        .select("*")
        .eq("organization_id", organizationId) as any;

      if (search?.trim()) {
        query = query.ilike("subject", `%${search.trim()}%`);
      }
      if (isRead !== undefined) {
        query = query.eq("is_read", isRead);
      }
      if (direction) {
        query = query.eq("direction", direction);
      }
      if (mailProviderId) {
        query = query.eq("mail_provider_id", mailProviderId);
      }

      const { data, error } = await query
        .order("sent_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      const page = (data ?? []).map(mapEmailFromSupabase);
      return { page, continueCursor: "", isDone: true };
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Email Thread
// ---------------------------------------------------------------------------

interface UseSupabaseEmailThreadOptions {
  enabled?: boolean;
}

export function useSupabaseEmailThread(
  organizationId: string,
  threadId: string | undefined,
  options: UseSupabaseEmailThreadOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmail[], Error>({
    queryKey: [...supabaseKeys.emails.detail(organizationId, threadId ?? ""), "thread"],
    queryFn: async (): Promise<MappedEmail[]> => {
      if (!client || !threadId) return [];

      const { data, error } = await client
        .from("emails")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("thread_id", threadId)
        .order("sent_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapEmailFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!threadId,
  });
}

// ---------------------------------------------------------------------------
// Emails by Entity (contact, company, lead)
// ---------------------------------------------------------------------------

interface UseSupabaseEmailsByEntityOptions {
  enabled?: boolean;
}

export function useSupabaseEmailsByEntity(
  organizationId: string,
  entityType: "contact" | "company" | "lead",
  entityId: string | undefined,
  options: UseSupabaseEmailsByEntityOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmail[], Error>({
    queryKey: [
      ...supabaseKeys.emails.list(organizationId),
      "byEntity",
      entityType,
      entityId ?? "",
    ],
    queryFn: async (): Promise<MappedEmail[]> => {
      if (!client || !entityId) return [];

      const columnMap: Record<string, string> = {
        contact: "contact_id",
        company: "company_id",
        lead: "lead_id",
      };
      const column = columnMap[entityType];

      const { data, error } = await client
        .from("emails")
        .select("*")
        .eq("organization_id", organizationId)
        .eq(column, entityId)
        .order("sent_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapEmailFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!entityId,
  });
}

// ---------------------------------------------------------------------------
// Unread Count
// ---------------------------------------------------------------------------

export function useSupabaseUnreadCount(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<number, Error>({
    queryKey: [...supabaseKeys.emails.list(organizationId), "unreadCount"],
    queryFn: async (): Promise<number> => {
      if (!client) throw new Error("Supabase client not ready");

      const { count, error } = await client
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_read", false)
        .eq("direction", "inbound");

      if (error) throw error;
      return count ?? 0;
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
