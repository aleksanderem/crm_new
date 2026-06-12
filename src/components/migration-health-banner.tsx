/**
 * MigrationHealthBanner
 *
 * One-shot boot health check that compares the running Supabase schema
 * (latest row in `supabase_migrations.schema_migrations`, exposed via the
 * `public.app_schema_version` RPC) with the version the build was cut for
 * (`__EXPECTED_SCHEMA_VERSION__`, injected by vite.config.ts).
 *
 * When the database is behind, render a single warning banner instead of
 * letting every feature fail individually with PGRST204 toasts (#1576).
 *
 * Fallback path (#1646): the RPC itself is added by migration 00012. If the
 * DB is far enough behind that the RPC doesn't exist yet, we additionally
 * probe a column from an earlier migration (00010's
 * `gabinet_treatments.package_id`) so the banner still fires with concrete
 * evidence the schema is stale, rather than going silent on the unknown
 * version.
 *
 * Mounts inside <SupabaseProvider> so the authenticated client is available.
 */

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { useSupabase } from "@/components/supabase-provider";

type CheckState =
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "stale"; applied: string | null; expected: string };

const DISMISS_KEY = "quera-migration-banner-dismissed";

// Probe target for the RPC-missing fallback. `gabinet_treatments.package_id`
// was added in migration 00010, two before the RPC migration (00012). If the
// probe column is missing, the schema is provably behind 00010 — strong
// independent evidence to surface the banner.
const PROBE_TABLE = "gabinet_treatments" as const;
const PROBE_COLUMN = "package_id" as const;
const PROBE_FLOOR_VERSION = "00010";

type ProbeResult = "present" | "absent" | "inconclusive";

async function probeRecentColumn(
  client: SupabaseClient<Database>,
): Promise<ProbeResult> {
  const { error } = await client
    .from(PROBE_TABLE)
    .select(PROBE_COLUMN)
    .limit(0);
  if (!error) return "present";
  const message = error.message ?? "";
  // 42703 = undefined_column, 42P01 = undefined_table. PostgREST also surfaces
  // these via PGRST20x codes with descriptive messages — match liberally so a
  // schema_cache vs. SQL-error variance doesn't break the fallback.
  if (
    error.code === "42703" ||
    error.code === "42P01" ||
    /column .* does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /could not find the .* (column|table)/i.test(message)
  ) {
    return "absent";
  }
  return "inconclusive";
}

function isMissingFunctionError(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? "";
  // 42883 = undefined_function (raw PG). PGRST202 is what PostgREST returns
  // when the function isn't in the schema cache — the message is "Could not
  // find the function ..." which would NOT match `function .* does not exist`.
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    /function .* does not exist/i.test(message) ||
    /could not find the function/i.test(message)
  );
}

export function MigrationHealthBanner() {
  const { client, isReady } = useSupabase();
  const [state, setState] = useState<CheckState>({ kind: "checking" });
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => {
    if (!isReady || !client) return;

    const expected = __EXPECTED_SCHEMA_VERSION__;
    if (!expected) {
      // Vite couldn't read supabase/migrations at build time. Skip the check
      // rather than render a false-positive banner.
      setState({ kind: "ok" });
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data, error } = await client.rpc("app_schema_version");
      if (cancelled) return;

      if (error) {
        if (!isMissingFunctionError(error)) {
          // Network / auth / other transient errors — treat as inconclusive
          // and stay silent. Failing loudly on every hiccup would defeat the
          // purpose.
          setState({ kind: "ok" });
          if (import.meta.env.DEV) {
            console.warn("[MigrationHealthBanner] schema check inconclusive:", error);
          }
          return;
        }
        // RPC missing — fall back to probing a known-recent column so we
        // can fire the banner even before migration 00012 is applied.
        const probe = await probeRecentColumn(client);
        if (cancelled) return;
        if (probe === "inconclusive") {
          setState({ kind: "ok" });
          if (import.meta.env.DEV) {
            console.warn(
              "[MigrationHealthBanner] RPC missing but column probe inconclusive — staying silent",
            );
          }
          return;
        }
        // probe === "present": schema has the 00010 column but is missing the
        // 00012 RPC — just behind by the most recent migrations.
        // probe === "absent": schema is behind 00010 too — significantly stale.
        const applied = probe === "present" ? `≥ ${PROBE_FLOOR_VERSION}` : null;
        setState({ kind: "stale", applied, expected });
        return;
      }

      // supabase-js types `data` from a primitive-return RPC as `null` even on
      // success, so narrow via `unknown` to preserve the runtime guard.
      const raw: unknown = data;
      const applied = typeof raw === "string" ? raw : null;
      if (applied !== null && applied >= expected) {
        setState({ kind: "ok" });
      } else {
        setState({ kind: "stale", applied, expected });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, isReady]);

  if (dismissed) return null;
  if (state.kind === "checking" || state.kind === "ok") return null;

  const { expected, applied } = state;

  return (
    <div
      role="alert"
      className="relative z-40 flex shrink-0 items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <span>
        Baza danych nie jest zaktualizowana do wersji aplikacji
        {" "}
        (oczekiwano <code className="font-mono">{expected}</code>
        {applied ? <>, znaleziono <code className="font-mono">{applied}</code></> : null}
        ). Niektóre funkcje mogą zwracać błędy, dopóki administrator nie zastosuje brakujących migracji
        {" "}(<code className="font-mono">npm run migrations:apply</code>).
      </span>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="shrink-0 rounded px-2 py-0.5 underline-offset-2 hover:underline"
        aria-label="Ukryj ostrzeżenie"
      >
        Ukryj
      </button>
    </div>
  );
}
