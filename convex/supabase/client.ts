import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@cvx/env";

export function createServiceRoleClient() {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL not configured");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function upsertWithFkRetry(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  maxRetries = 3,
  delayMs = 2000,
): Promise<{ id: string }> {
  let lastError: { message: string; code: string } | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { data, error } = await client
      .from(table)
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();

    if (!error && data) {
      return data as { id: string };
    }

    lastError = error;

    if (error?.code === "23503" && attempt < maxRetries - 1) {
      console.warn(
        `[${table}] FK violation attempt ${attempt + 1}/${maxRetries}, retrying in ${delayMs}ms: ${error.message}`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }

    break;
  }

  throw new Error(
    `Supabase write failed for ${table}: ${lastError?.message} (code=${lastError?.code})`,
  );
}
