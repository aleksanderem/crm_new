import { Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import type { SupabaseDb } from "./supabaseDb";

/**
 * Validate a patient-portal session token and return the associated
 * patient + organization IDs.  Shared between gabinet/patientPortal and
 * documents/documents (patient-portal queries).
 */
export async function validatePortalSession(
  ctx: QueryCtx | MutationCtx,
  tokenHash: string,
): Promise<{
  patientId: Id<"gabinetPatients">;
  organizationId: Id<"organizations">;
}> {
  const session = await ctx.db
    .query("gabinetPortalSessions")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (!session || !session.isActive || Date.now() > session.expiresAt) {
    throw new Error("Invalid or expired session");
  }

  return {
    patientId: session.patientId,
    organizationId: session.organizationId,
  };
}

/**
 * Supabase counterpart of {@link validatePortalSession}. Use from Convex
 * actions: `gabinetPortalSessions` is Supabase-only since the dual-write
 * cleanup, so portal queries reading it through `ctx.db` always throw
 * "Invalid or expired session".
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
