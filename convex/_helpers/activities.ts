import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { ActivityAction } from "@cvx/schema";
import { publishActivityEnvelope } from "./activityEnvelope";

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
  const occurredAt = Date.now();
  const actorUser = await ctx.db.get(args.performedBy);
  const actorLabel = actorUser?.name ?? actorUser?.email ?? undefined;

  await publishActivityEnvelope(ctx, {
    organizationId: args.organizationId,
    action: args.action,
    performedBy: args.performedBy,
    module: deriveLegacyModule(args.entityType),
    summary: args.description,
    occurredAt,
    actor: {
      type: "user",
      userId: args.performedBy,
      label: actorLabel,
    },
    payload: {
      legacyAction: args.action,
      legacyMetadata: args.metadata ?? null,
    },
    eventKey: `${deriveLegacyModule(args.entityType)}:${args.entityType}:${args.entityId}:${args.action}`,
    targets: [
      {
        entityType: args.entityType,
        entityId: args.entityId,
      },
    ],
    metadata: args.metadata,
  });
}

function deriveLegacyModule(entityType: string) {
  if (entityType.startsWith("gabinet")) {
    return "gabinet";
  }

  return "crm";
}
