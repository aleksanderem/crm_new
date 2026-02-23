import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { CalendarCheck, Clock, AlertTriangle } from "@/lib/ez-icons";

interface Activity {
  _id: string;
  title: string;
  activityType: string;
  dueDate: number;
  isCompleted: boolean;
  ownerName: string;
}

interface UpcomingActivitiesProps {
  activities: Activity[];
}

function isSameDay(ts: number, ref: Date): boolean {
  const d = new Date(ts);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

export function UpcomingActivities({ activities }: UpcomingActivitiesProps) {
  const { t } = useTranslation();
  const now = new Date();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <CalendarCheck className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-base">
          {t("dashboard.upcomingActivities")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t("dashboard.noUpcoming")}
          </p>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => {
              const isOverdue = activity.dueDate < Date.now();
              const isToday = isSameDay(activity.dueDate, now);
              return (
                <div
                  key={activity._id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {activity.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activity.ownerName} &middot; {activity.activityType}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isOverdue && !isToday && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <AlertTriangle className="h-3 w-3" />
                        {t("dashboard.overdue")}
                      </span>
                    )}
                    {isToday && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        <Clock className="h-3 w-3" />
                        {t("dashboard.dueToday")}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(activity.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
