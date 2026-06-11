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
 * Mounts inside <SupabaseProvider> so the authenticated client is available.
 */

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/supabase-provider";

type CheckState =
  | { kind: "checking" }
  | { kind: "ok" }
  | { kind: "stale"; applied: string | null; expected: string }
  | { kind: "rpc-missing"; expected: string };

const DISMISS_KEY = "quera-migration-banner-dismissed";

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
        // 42883 = undefined_function. Any other error (network, auth) we
        // treat as inconclusive and stay silent — failing loudly on transient
        // hiccups would defeat the purpose.
        if (error.code === "42883" || /function .* does not exist/i.test(error.message ?? "")) {
          setState({ kind: "rpc-missing", expected });
        } else {
          setState({ kind: "ok" });
          if (import.meta.env.DEV) {
            console.warn("[MigrationHealthBanner] schema check inconclusive:", error);
          }
        }
        return;
      }

      const applied = typeof data === "string" ? data : null;
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

  const expected = state.expected;
  const applied = state.kind === "stale" ? state.applied : null;

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
