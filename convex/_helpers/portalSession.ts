import type { SupabaseDb } from "./supabaseDb";

/**
 * Validate a patient-portal session token via Supabase.
 *
 * `gabinetPortalSessions` is Supabase-only since the dual-write cleanup, so
 * portal session validation must hit Supabase — a Convex `ctx.db` reader
 * would never see rows written by the OTP flow (#540).
 */
export async function validatePortalSessionSupabase(
  db: SupabaseDb,
  tokenHash: string,
): Promise<{ patientId: string; organizationId: string }> {
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
