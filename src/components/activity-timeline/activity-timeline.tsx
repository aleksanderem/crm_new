import { ActivityItem, Activity } from "./activity-item";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ActivityTimelineProps {
  activities: Activity[];
  maxHeight?: string;
}

export function ActivityTimeline({
  activities,
  maxHeight = "400px",
}: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No activity yet.
      </p>
    );
  }

  return (
    <ScrollArea style={{ maxHeight }}>
      <div className="relative space-y-0 pl-6">
        <div className="absolute bottom-0 left-[11px] top-0 w-px bg-border" />
        {activities.map((activity) => (
          <ActivityItem key={activity._id} activity={activity} />
        ))}
      </div>
    </ScrollArea>
  );
}
