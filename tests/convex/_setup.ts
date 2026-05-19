/**
 * Vitest global setup for Convex test suites.
 *
 * Hoists vi.mock() calls that swap the two Supabase entry points used by
 * Convex code with in-memory stand-ins. See _supabase_inmemory.ts for the
 * implementation. Registered via `setupFiles` in convex/vitest.config.ts.
 */

import { webcrypto } from "node:crypto";
import { beforeEach, vi } from "vitest";

// convex-test calls `crypto.subtle.digest` when storing blobs. Node 19+
// exposes `crypto` as a global, but on Node 18 it lives only on
// `node:crypto`. Polyfill so storage-touching tests run consistently
// regardless of the host Node version.
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

vi.mock("@cvx/_helpers/supabaseDb", async () => {
  const { createInMemorySupabaseDb } = await import("./_supabase_inmemory");
  return { createSupabaseDb: createInMemorySupabaseDb };
});

vi.mock("@cvx/supabase/client", async () => {
  const { createStubServiceRoleClient, stubUpsertWithFkRetry } = await import(
    "./_supabase_inmemory"
  );
  return {
    createServiceRoleClient: createStubServiceRoleClient,
    upsertWithFkRetry: stubUpsertWithFkRetry,
  };
});

beforeEach(async () => {
  const { resetInMemoryStore } = await import("./_supabase_inmemory");
  resetInMemoryStore();
});
