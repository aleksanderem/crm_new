import { createSupabaseDb } from "./_helpers/supabaseDb";

export async function logAudit(
  _ctx: unknown,
  data: {
    organizationId: string;
    userId: string;
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
