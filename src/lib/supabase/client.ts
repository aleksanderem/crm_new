/**
 * Supabase Client Factory
 *
 * Creates an authenticated supabase-js client scoped to a specific JWT.
 * Session persistence and auto-refresh are disabled — the JWT is managed
 * externally by `useSupabaseToken`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/**
 * Supabase project URL read from the Vite env.
 * Throws eagerly at module load time so misconfiguration is caught immediately.
 */
export const SUPABASE_URL: string = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) {
    throw new Error(
      "VITE_SUPABASE_URL is not set. " +
        "Add it to your .env file (see .env.example) — it should point to " +
        "your Supabase instance, e.g. http://localhost:8000 for local dev.",
    );
  }
  return url;
})();

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export const SUPABASE_ANON_KEY: string = (() => {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!key) {
    throw new Error(
      "VITE_SUPABASE_ANON_KEY is not set. " +
        "Add it to your .env file — it's the anon/public key from your Supabase project.",
    );
  }
  return key;
})();

/**
 * Create a typed Supabase client authenticated with the given JWT.
 *
 * - `auth.persistSession` is false — we manage tokens via `useSupabaseToken`.
 * - `auth.autoRefreshToken` is false — Convex-issued JWTs are refreshed
 *   through `mintSupabaseToken`, not Supabase's built-in refresh flow.
 */
export function createSupabaseClient(
  supabaseUrl: string,
  accessToken: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create an unauthenticated Supabase client using only the anon key.
 *
 * This client cannot access RLS-protected tables directly, but it can call
 * SECURITY DEFINER Postgres functions that are granted to the `anon` role
 * (e.g. `get_invitation_by_token`). Use this only outside SupabaseProvider
 * where no Convex JWT is available.
 */
export function createAnonSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
