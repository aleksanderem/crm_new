import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";

export async function logAudit(
  _ctx: MutationCtx,
  data: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: string;
  }
) {
  const db = createSupabaseDb();
  await db.insert("auditLog", {
    ...data,
    createdAt: Date.now(),
  });
}
