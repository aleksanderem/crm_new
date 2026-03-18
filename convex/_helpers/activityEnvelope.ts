import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ActivityAction } from "@cvx/schema";

export type ActivityEnvelopeTarget = {
  entityType: string;
  entityId: string;
};

export type ActivityEnvelopeActor = {
  type: string;
  userId?: Id<"users">;
  label?: string;
};

export type ActivityEnvelopeAttachment = {
  kind: string;
  url?: string;
  name?: string;
};

export type ActivityEnvelope = {
  schemaVersion: 1;
  module: string;
  summary: string;
  occurredAt: number;
  actor: ActivityEnvelopeActor;
  payload: unknown;
  attachments: ActivityEnvelopeAttachment[];
  eventKey: string;
  targets: ActivityEnvelopeTarget[];
};

type BuildActivityEnvelopeArgs = {
  module: string;
  summary: string;
  occurredAt: number;
  actor: ActivityEnvelopeActor;
  payload: unknown;
  attachments?: ActivityEnvelopeAttachment[];
  eventKey: string;
  targets: ActivityEnvelopeTarget[];
  metadata?: Record<string, unknown>;
};

export function createActivityEnvelope(args: BuildActivityEnvelopeArgs): ActivityEnvelope {
  const module = args.module.trim();
  if (!module) {
    throw new Error("Activity envelope module is required");
  }

  const summary = args.summary.trim();
  if (!summary) {
    throw new Error("Activity envelope summary is required");
  }

  const eventKey = args.eventKey.trim();
  if (!eventKey) {
    throw new Error("Activity envelope eventKey is required");
  }

  if (!Number.isFinite(args.occurredAt)) {
    throw new Error("Activity envelope occurredAt must be a valid timestamp");
  }

  const actorType = args.actor.type.trim();
  if (!actorType) {
    throw new Error("Activity envelope actor.type is required");
  }

  if (args.targets.length === 0) {
    throw new Error("Activity envelope requires at least one target");
  }

  if (args.metadata?.activityEnvelope !== undefined) {
    throw new Error(
      "Activity envelope metadata.activityEnvelope is reserved for normalized envelope storage",
    );
  }

  const normalizedTargets = args.targets.map((target) => {
    const entityType = target.entityType.trim();
    const entityId = target.entityId.trim();

    if (!entityType || !entityId) {
      throw new Error("Activity envelope target entityType and entityId are required");
    }

    return {
      entityType,
      entityId,
    };
  });

  const dedupedTargets = normalizedTargets.filter((target, index, allTargets) => {
    const dedupeKey = JSON.stringify([target.entityType, target.entityId]);
    return (
      index ===
      allTargets.findIndex(
        (candidate) => JSON.stringify([candidate.entityType, candidate.entityId]) === dedupeKey,
      )
    );
  });

  const attachments = args.attachments ?? [];
  return {
    schemaVersion: 1,
    module,
    summary,
    occurredAt: args.occurredAt,
    actor: {
      ...args.actor,
      type: actorType,
    },
    payload: args.payload,
    attachments,
    eventKey,
    targets: dedupedTargets,
  };
}

export async function publishActivityEnvelope(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    action: ActivityAction;
    performedBy: Id<"users">;
    module: string;
    summary: string;
    occurredAt: number;
    actor: ActivityEnvelopeActor;
    payload: unknown;
    attachments?: ActivityEnvelopeAttachment[];
    eventKey: string;
    targets: ActivityEnvelopeTarget[];
    metadata?: Record<string, unknown>;
  },
) {
  const envelope = createActivityEnvelope(args);
  const resolvedTargets = envelope.targets.map((target) => ({ ...target }));

  for (const target of resolvedTargets) {
    const metadata = {
      ...(args.metadata ?? {}),
      activityEnvelope: {
        ...envelope,
        targets: resolvedTargets.map((resolvedTarget) => ({ ...resolvedTarget })),
      },
    };

    await ctx.db.insert("activities", {
      organizationId: args.organizationId,
      entityType: target.entityType,
      entityId: target.entityId,
      action: args.action,
      description: envelope.summary,
      metadata,
      performedBy: args.performedBy,
      createdAt: args.occurredAt,
    });
  }
}
