import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ActivityAction } from "@cvx/schema";

export async function logActivity(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    entityType: string;
    entityId: string;
    action: ActivityAction;
    description: string;
    metadata?: any;
    performedBy: Id<"users">;
  }
) {
  await ctx.db.insert("activities", {
    ...args,
    createdAt: Date.now(),
  });
}
