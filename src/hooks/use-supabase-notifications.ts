/**
 * React Query hooks for fetching notifications from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapNotificationFromSupabase, type MappedNotification } from "@/lib/supabase/mappers";

// ── Notifications List ────────────────────────────────────────────────────────

export function useSupabaseNotificationsList(
  userId: string,
  options?: { enabled?: boolean; limit?: number },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 20 } = options ?? {};

  return useQuery<MappedNotification[], Error>({
    queryKey: [...supabaseKeys.notifications.list(userId), "list"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapNotificationFromSupabase);
    },
    enabled: enabled && isReady && !!userId,
  });
}

// ── Unread Count ──────────────────────────────────────────────────────────────

export function useSupabaseUnreadNotificationCount(
  userId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<{ count: number }, Error>({
    queryKey: [...supabaseKeys.notifications.list(userId), "unreadCount"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { count, error } = await client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) throw error;
      return { count: count ?? 0 };
    },
    enabled: enabled && isReady && !!userId,
  });
}
