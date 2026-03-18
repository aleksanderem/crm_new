import { ActivityItem, Activity } from "./activity-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "react-i18next";
import { presentActivity, type ActivityWithMetadata } from "./presenter/activity-presenter";

interface ActivityTimelineProps {
  activities: ActivityWithMetadata[];
  maxHeight?: string;
}

export function ActivityTimeline({
  activities,
  maxHeight = "400px",
}: ActivityTimelineProps) {
  const { t } = useTranslation();
  const presentedActivities: Activity[] = activities.map((activity) =>
    presentActivity(activity),
  );

  if (presentedActivities.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {t("dashboard.noActivity")}
      </p>
    );
  }

  return (
    <ScrollArea style={{ maxHeight }}>
      <div className="relative space-y-0 pl-6">
        <div className="absolute bottom-0 left-[11px] top-0 w-px bg-border" />
        {presentedActivities.map((activity) => (
          <ActivityItem key={activity._id} activity={activity} />
        ))}
      </div>
    </ScrollArea>
  );
}
