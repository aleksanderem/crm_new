import { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// @ts-ignore — TS2589
const writeAuditLogRef = internal.supabase.auditLog.writeAuditLogToSupabase;

export async function logAudit(
  ctx: MutationCtx,
  data: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: string;
  }
) {
  const auditLogId = await ctx.db.insert("auditLog", {
    ...data,
    createdAt: Date.now(),
  });

  // Dual-write
  await ctx.scheduler.runAfter(0, writeAuditLogRef, {
    auditLogId: auditLogId as any,
    organizationId: data.organizationId as any,
    userId: data.userId as any,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    details: data.details,
    createdAt: Date.now(),
  });
}
