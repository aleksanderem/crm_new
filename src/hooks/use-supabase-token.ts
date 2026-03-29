/**
 * useSupabaseToken
 *
 * React hook that mints and caches a Supabase JWT via the Convex
 * `mintSupabaseToken` action.  The token is stored in a ref to avoid
 * unnecessary re-renders and is automatically refreshed when it nears
 * expiry (within 5 minutes).
 *
 * Usage:
 *   const { token, isLoading, error, refresh } = useSupabaseToken(orgId);
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Refresh the token when it's within this many seconds of expiring. */
const REFRESH_BUFFER_SECS = 5 * 60; // 5 minutes

/** Maximum time (ms) to wait for the mintSupabaseToken action. */
const MINT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  /** Unix epoch seconds */
  expiresAt: number;
}

export interface UseSupabaseTokenResult {
  /** The JWT string, or null if not yet fetched / org is null. */
  token: string | null;
  /** True while an initial or refresh mint is in progress. */
  isLoading: boolean;
  /** Descriptive error message, if the last mint failed. */
  error: string | null;
  /** Force-refresh the token (e.g. after a 401 from Supabase). */
  refresh: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTokenExpiringSoon(cached: CachedToken | null): boolean {
  if (!cached) return true;
  return Date.now() / 1000 >= cached.expiresAt - REFRESH_BUFFER_SECS;
}

function validateMintResponse(
  data: unknown,
): data is { token: string; expiresAt: number } {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.token === "string" && typeof obj.expiresAt === "number";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSupabaseToken(
  organizationId: Id<"organizations"> | null,
): UseSupabaseTokenResult {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- TS2589: type instantiation depth in generated Convex API types
  const mintAction = useAction(api.supabase.jwt.mintSupabaseToken);

  const cacheRef = useRef<CachedToken | null>(null);
  const mintingRef = useRef(false);

  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable mint function — useCallback with no deps that change often
  // (rerender-functional-setstate pattern: rely on refs, not state).
  const doMint = useCallback(async () => {
    if (!organizationId) return;
    if (mintingRef.current) return; // de-dup concurrent calls

    mintingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const result = await Promise.race([
        mintAction({ organizationId }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("mintSupabaseToken timed out")),
            MINT_TIMEOUT_MS,
          ),
        ),
      ]);

      if (!validateMintResponse(result)) {
        throw new Error(
          "mintSupabaseToken returned an unexpected shape — expected { token: string, expiresAt: number }",
        );
      }

      cacheRef.current = { token: result.token, expiresAt: result.expiresAt };
      setToken(result.token);

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info(
          `Supabase token refreshed for org=${organizationId as string}`,
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to mint Supabase token";
      setError(message);
      console.error("[useSupabaseToken]", message);

      // Retry once on timeout
      if (
        err instanceof Error &&
        err.message === "mintSupabaseToken timed out"
      ) {
        mintingRef.current = false;
        // The next interval tick will retry automatically
      }
    } finally {
      mintingRef.current = false;
      setIsLoading(false);
    }
  }, [organizationId, mintAction]);

  // Initial fetch + periodic refresh check
  useEffect(() => {
    if (!organizationId) {
      cacheRef.current = null;
      setToken(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    // Mint immediately if no valid cached token
    if (isTokenExpiringSoon(cacheRef.current)) {
      void doMint();
    }

    // Check every 60 s whether a refresh is needed
    const interval = setInterval(() => {
      if (isTokenExpiringSoon(cacheRef.current)) {
        void doMint();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [organizationId, doMint]);

  // Expose a stable manual refresh handle
  const refresh = useCallback(() => {
    cacheRef.current = null; // force expiry check
    void doMint();
  }, [doMint]);

  return { token, isLoading, error, refresh };
}
