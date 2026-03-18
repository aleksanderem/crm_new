import type { Activity } from "../activity-item";
import {
  renderEmailActivity,
  renderGenericActivity,
  type PresenterInput,
} from "./activity-renderers";

export type ActivityWithMetadata = Activity & {
  metadata?: unknown;
};

export function presentActivity(activity: ActivityWithMetadata): Activity {
  const input: PresenterInput = activity;
  const rendered =
    activity.action === "email_sent" || activity.action === "email_received"
      ? renderEmailActivity(input)
      : renderGenericActivity(input);

  return {
    _id: activity._id,
    action: activity.action,
    description: rendered.description ?? activity.description,
    performedByName: rendered.performedByName ?? activity.performedByName,
    createdAt: activity.createdAt,
    contentSnapshot: rendered.contentSnapshot ?? activity.contentSnapshot,
    metaLines: rendered.metaLines ?? activity.metaLines,
  };
}
