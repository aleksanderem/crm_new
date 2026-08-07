import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@cvx/env";

// Stub WebSocket transport for the Convex action runtime, which doesn't
// expose a global `WebSocket`. supabase-js 2.105+ eagerly constructs a
// RealtimeClient inside `createClient`, and that constructor throws
// "Unknown JavaScript runtime without WebSocket support" if no transport
// is supplied. We never use realtime server-side, so we hand it a no-op
// constructor; if anything ever calls `connect()` it will fail loudly
// instead of silently subscribing.
class NoopWebSocketTransport {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  constructor() {
    throw new Error(
      "Realtime is not supported in the Convex action runtime",
    );
  }
}

export function createServiceRoleClient(correlationId?: string) {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL not configured");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      transport: NoopWebSocketTransport as unknown as typeof WebSocket,
    },
    ...(correlationId ? { global: { headers: { "x-correlation-id": correlationId } } } : {}),
  });
}

export async function upsertWithFkRetry(
  client: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  maxRetries = 3,
  // Kept for back-compat; ignored after we dropped the setTimeout-based
  // backoff. See comment inside the loop.
  _delayMs = 2000,
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
        `[${table}] FK violation attempt ${attempt + 1}/${maxRetries}, retrying: ${error.message}`,
      );
      // Previously this awaited a setTimeout-based delay so concurrent
      // writes had a chance to settle. setTimeout is forbidden in Convex
      // queries/mutations — `_createSideEffects` was logging
      // "Can't use setTimeout in queries and mutations" on every
      // appointment create (dev 2026-06-12 14:36 UTC). Inside a mutation
      // the FK target either exists in the snapshot or doesn't, so the
      // pause couldn't help anyway. In actions the tighter retry is cheap.
      continue;
    }

    break;
  }

  throw new Error(
    `Supabase write failed for ${table}: ${lastError?.message} (code=${lastError?.code})`,
  );
}
