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

// Many Convex mutations/actions in this codebase schedule side-effect work via
// `ctx.scheduler.runAfter(0, …)` — Supabase dual-writes, activity-envelope
// fan-out, audit logging, SMS reminders, automation triggers, etc. convex-test
// fires those callbacks via `setTimeout(0, …)` against a captured
// `global.Convex` reference. Once the next test creates a fresh test instance,
// orphan callbacks from the previous test land on a stale `db` whose
// transaction has already closed and surface as:
//   - `Write outside of transaction N;_scheduled_functions`, or
//   - `Cannot read properties of null (reading 'state')` (job lookup against
//     the new instance's `_scheduled_functions` table returns null).
// Both are pure test-harness artefacts: every assertion in the originating
// test has already passed by the time these fire, but they flip vitest's
// exit code via `unhandledRejection`.
//
// Install one process-wide listener that silently consumes ONLY these two
// known shapes. Everything else falls through to vitest's own listener and
// still surfaces as a failure. This replaces the per-file SCHEDULER_NOISE
// boilerplate that used to live in 8+ test files (#506, #509, #511, #513,
// #514, #516, #517) — a single global listener catches rejections that fire
// between files or after a file's `afterAll` has already torn its filter
// down, which the per-file approach could not.
const SCHEDULER_NOISE = [
  /Write outside of transaction \d+;_scheduled_functions/,
  /Cannot read properties of null \(reading 'state'\)/,
];

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (SCHEDULER_NOISE.some((re) => re.test(msg))) return;
});

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
