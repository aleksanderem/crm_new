import { Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";

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
