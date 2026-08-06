import type { SupabaseDb } from "./supabaseDb";

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate a patient-portal session token via Supabase.
 *
 * Accepts the raw bearer token (as stored in the client's localStorage) and
 * hashes it before comparing against the stored token_hash. This ensures
 * that even a full read of the gabinet_portal_sessions table yields no
 * usable session tokens.
 *
 * `gabinetPortalSessions` is Supabase-only since the dual-write cleanup, so
 * portal session validation must hit Supabase — a Convex `ctx.db` reader
 * would never see rows written by the OTP flow (#540).
 */
export async function validatePortalSessionSupabase(
  db: SupabaseDb,
  rawToken: string,
): Promise<{ patientId: string; organizationId: string }> {
  const tokenHash = await sha256(rawToken);

  const session = await db
    .query("gabinetPortalSessions")
    .eq("tokenHash", tokenHash)
    .first();

  if (
    !session ||
    !session.isActive ||
    Date.now() > (session.expiresAt as number)
  ) {
    throw new Error("Invalid or expired session");
  }

  return {
    patientId: String(session.patientId),
    organizationId: String(session.organizationId),
  };
}
