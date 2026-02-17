import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Bell, Mail, TrendingUp, Users, Calendar, FileText, Info } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Id } from "@cvx/_generated/dataModel";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const notificationTypeIcons: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" />,
  deal: <TrendingUp className="h-4 w-4" />,
  contact: <Users className="h-4 w-4" />,
  activity: <Calendar className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
};

function getNotificationIcon(type?: string) {
  if (type && type in notificationTypeIcons) {
    return notificationTypeIcons[type];
  }
  return <Info className="h-4 w-4" />;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const { data: notifications } = useQuery({
    ...convexQuery(api.notifications.list, {
      organizationId,
      limit: 20,
    }),
    enabled: !!organizationId,
  });

  const { data: unreadCount } = useQuery({
    ...convexQuery(api.notifications.getUnreadCount, {
      organizationId,
    }),
    enabled: !!organizationId,
  });

  const markAsRead = useMutation(api.notifications.markAsRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const handleNotificationClick = async (notification: {
    _id: Id<"notifications">;
    isRead?: boolean;
    link?: string;
  }) => {
    if (!notification.isRead) {
      await markAsRead({ notificationId: notification._id });
    }
    if (notification.link) {
      navigate({ to: notification.link });
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead({ organizationId });
  };

  const count = unreadCount?.count ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">
            {t("notifications.title", "Notifications")}
          </h4>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              onClick={handleMarkAllRead}
            >
              {t("notifications.markAllRead", "Mark all read")}
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {!notifications || notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("notifications.empty", "No notifications")}
            </div>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification._id}
                type="button"
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                onClick={() => handleNotificationClick(notification)}
              >
                {!notification.isRead && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
                {notification.isRead && <span className="w-2 shrink-0" />}
                <div className="mt-0.5 shrink-0 text-muted-foreground">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      notification.isRead
                        ? "truncate text-sm text-foreground"
                        : "truncate text-sm font-medium text-foreground"
                    }
                  >
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p className="truncate text-xs text-muted-foreground">
                      {notification.message}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelativeTime(notification._creationTime)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
