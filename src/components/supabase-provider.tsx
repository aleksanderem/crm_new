/**
 * SupabaseProvider
 *
 * React context that manages the authenticated Supabase client lifecycle.
 * Consumes the JWT from `useSupabaseToken` and exposes a typed, ready-to-use
 * `SupabaseClient<Database>` to all descendants.
 *
 * Must be rendered inside `OrgProvider` — it reads the current org to scope
 * the JWT mint.
 */

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  createSupabaseClient,
  SUPABASE_URL,
} from "@/lib/supabase/client";
import { useSupabaseToken } from "@/hooks/use-supabase-token";
import { useOrganization } from "@/components/org-context";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SupabaseContextValue {
  /** The authenticated Supabase client, or `null` while the JWT is loading. */
  client: SupabaseClient<Database> | null;
  /** `true` once the first JWT has been minted and the client is usable. */
  isReady: boolean;
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides a Supabase client authenticated via the Convex JWT bridge.
 *
 * The client is memoized on the token value — a new client is only created
 * when the token actually changes (refresh or org switch).
 */
export function SupabaseProvider({ children }: { children: ReactNode }) {
  const { organizationId } = useOrganization();
  const { token, isLoading, error } = useSupabaseToken(organizationId);

  // Recreate the client only when the token string changes.
  // `createSupabaseClient` is cheap — it just builds config, no network call.
  const client = useMemo(() => {
    if (!token) return null;
    return createSupabaseClient(SUPABASE_URL, token);
  }, [token]);

  const isReady = client !== null && !isLoading;

  // Surface token errors in dev for easier debugging
  if (import.meta.env.DEV && error) {
    // eslint-disable-next-line no-console
    console.warn("[SupabaseProvider] Token error:", error);
  }

  const value = useMemo<SupabaseContextValue>(
    () => ({ client, isReady }),
    [client, isReady],
  );

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Access the Supabase context.
 *
 * Returns `{ client, isReady }` — `client` may be `null` while the JWT
 * is still being minted. Check `isReady` before issuing queries.
 *
 * @throws if called outside `SupabaseProvider`
 */
export function useSupabase(): SupabaseContextValue {
  const ctx = useContext(SupabaseContext);
  if (ctx === null) {
    throw new Error(
      "useSupabase() must be used inside <SupabaseProvider>. " +
        "Make sure the provider is mounted as a child of <OrgProvider>.",
    );
  }
  return ctx;
}

/**
 * Non-throwing variant of `useSupabase()`.
 *
 * Returns `{ client: null, isReady: false }` when called outside
 * `<SupabaseProvider>` instead of throwing. Use in components that
 * render *above* the provider but conditionally need the client
 * (e.g. the dashboard layout which both renders the provider and
 * uses global search).
 */
export function useSupabaseSafe(): SupabaseContextValue {
  const ctx = useContext(SupabaseContext);
  return ctx ?? { client: null, isReady: false };
}

/**
 * Convenience hook — returns the Supabase client directly.
 *
 * @throws if the client is not yet ready (JWT still loading) or if called
 *         outside `SupabaseProvider`.
 */
export function useSupabaseClient(): SupabaseClient<Database> {
  const { client, isReady } = useSupabase();
  if (!isReady || !client) {
    throw new Error(
      "useSupabaseClient() called before the Supabase client is ready. " +
        "Either wait for `isReady` via useSupabase(), or ensure the " +
        "component is only rendered when the token has been minted.",
    );
  }
  return client;
}
