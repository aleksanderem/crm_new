import { useTranslation } from "react-i18next";

interface ScheduledActivity {
  _id: string;
  title: string;
  activityType: string;
  dueDate: number;
  isCompleted?: boolean;
  status?: string;
}

interface ScheduledActivitiesListProps {
  activities: ScheduledActivity[];
  onActivityClick?: (id: string) => void;
  emptyMessage?: string;
}

export function ScheduledActivitiesList({
  activities,
  onActivityClick,
  emptyMessage,
}: ScheduledActivitiesListProps) {
  const { i18n } = useTranslation();

  const locale = i18n.language === "pl" ? "pl-PL" : "en-US";

  if (activities.length === 0) {
    if (!emptyMessage) return null;
    return (
      <p className="text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <ul className="space-y-3">
      {activities.map((activity) => (
        <li
          key={activity._id}
          className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => onActivityClick?.(activity._id)}
        >
          <div
            className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
              activity.isCompleted
                ? "bg-green-500"
                : "bg-orange-400"
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {activity.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {activity.activityType} &middot;{" "}
              {new Date(activity.dueDate).toLocaleDateString(locale)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
