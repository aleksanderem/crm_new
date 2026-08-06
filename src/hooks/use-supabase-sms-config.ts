import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";

export type SmsConfigSummary = {
  id: string;
  provider: "smsapi" | "twilio";
  senderId: string | null;
  fromNumber: string | null;
  isActive: boolean;
  hasToken: boolean;
  hasSecret: boolean;
};

export function useSupabaseSmsConfig(
  organizationId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<SmsConfigSummary | null, Error>({
    queryKey: supabaseKeys.orgSmsConfig.detail(organizationId, "config"),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      // Select only non-sensitive columns; derive hasToken / hasSecret server-side.
      const { data, error } = await client
        .from("org_sms_config")
        .select(
          "id, provider, sender_id, from_number, is_active, (api_token is not null and api_token != '') as has_token, (api_secret is not null and api_secret != '') as has_secret",
        )
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id as string,
        provider: data.provider as "smsapi" | "twilio",
        senderId: data.sender_id as string | null,
        fromNumber: data.from_number as string | null,
        isActive: data.is_active as boolean,
        hasToken: data.has_token as boolean,
        hasSecret: data.has_secret as boolean,
      };
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
