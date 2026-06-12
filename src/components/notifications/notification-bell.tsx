import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { toast } from "sonner";
import { Bell, Mail, TrendingUp, Users, Calendar, FileText, Info } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  translateNotificationMessage,
  translateNotificationTitle,
} from "@/components/notifications/translate-notification";
import type { Id } from "@cvx/_generated/dataModel";

type RefundAuthMetadata = {
  requestId: string;
  patientId: string;
  patientLabel: string;
  amount: number;
  notes: string | null;
  requesterId: string;
  requesterName: string;
  status: "pending" | "approved" | "rejected";
};

function isPendingRefundAuth(notification: {
  type?: string;
  metadata?: unknown;
}): notification is { type: string; metadata: RefundAuthMetadata } {
  if (notification.type !== "refund_authorization_requested") return false;
  const m = notification.metadata as RefundAuthMetadata | null | undefined;
  return !!m && m.status === "pending";
}

function useFormatRelativeTime() {
  const { t, i18n } = useTranslation();
  return (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return t("notifications.relativeTime.justNow");
    if (minutes < 60)
      return t("notifications.relativeTime.minutesAgo", { count: minutes });
    if (hours < 24)
      return t("notifications.relativeTime.hoursAgo", { count: hours });
    if (days < 7)
      return t("notifications.relativeTime.daysAgo", { count: days });
    return new Date(timestamp).toLocaleDateString(i18n.language);
  };
}

const notificationTypeIcons: Record<string, React.ReactNode> = {
  email: <Mail className="h-4 w-4" variant="stroke" />,
  deal: <TrendingUp className="h-4 w-4" variant="stroke" />,
  contact: <Users className="h-4 w-4" variant="stroke" />,
  activity: <Calendar className="h-4 w-4" variant="stroke" />,
  document: <FileText className="h-4 w-4" variant="stroke" />,
};

function getNotificationIcon(type?: string) {
  if (type && type in notificationTypeIcons) {
    return notificationTypeIcons[type];
  }
  return <Info className="h-4 w-4" variant="stroke" />;
}

export function NotificationBell() {
  const { t } = useTranslation();
  const formatRelativeTime = useFormatRelativeTime();
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

  const markAsRead = useAction(api.notifications.markAsRead);
  const markAllRead = useAction(api.notifications.markAllRead);
  const approveRefundAuth = useAction(api.payments.approveRefundAuth);
  const rejectRefundAuth = useAction(api.payments.rejectRefundAuth);
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(
    null,
  );

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

  const refreshNotifications = () => {
    void queryClient.invalidateQueries({
      queryKey: convexQuery(api.notifications.list, {
        organizationId,
        limit: 20,
      }).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: convexQuery(api.notifications.getUnreadCount, {
        organizationId,
      }).queryKey,
    });
  };

  const handleApproveRefund = async (
    notificationId: Id<"notifications">,
  ) => {
    setPendingId(notificationId);
    setPendingAction("approve");
    try {
      await approveRefundAuth({ organizationId, notificationId });
      toast.success(t("notifications.refundAuth.approved"));
      refreshNotifications();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("notifications.refundAuth.approveError"),
      );
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  };

  const handleRejectRefund = async (
    notificationId: Id<"notifications">,
  ) => {
    setPendingId(notificationId);
    setPendingAction("reject");
    try {
      await rejectRefundAuth({ organizationId, notificationId });
      toast.success(t("notifications.refundAuth.rejected"));
      refreshNotifications();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t("notifications.refundAuth.rejectError"),
      );
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  };

  const count = unreadCount?.count ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={t("layout.notifications")}>
          <Bell className="h-4 w-4" variant="stroke" />
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
            notifications.map((notification) => {
              const showRefundActions = isPendingRefundAuth(notification);
              const isThisRowBusy = pendingId === notification._id;
              return (
                <div
                  key={notification._id}
                  className="border-b last:border-b-0"
                >
                  <button
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
                        {translateNotificationTitle(notification.title, t)}
                      </p>
                      {notification.message && (
                        <p
                          className={
                            showRefundActions
                              ? "text-xs text-muted-foreground"
                              : "truncate text-xs text-muted-foreground"
                          }
                        >
                          {translateNotificationMessage(
                            notification.message,
                            t,
                          )}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatRelativeTime(notification._creationTime)}
                      </p>
                    </div>
                  </button>
                  {showRefundActions && (
                    <div className="flex items-center gap-2 px-4 pb-3 pl-[3.25rem]">
                      <Button
                        size="sm"
                        className="h-7 px-3 text-xs"
                        disabled={pendingId !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleApproveRefund(notification._id);
                        }}
                      >
                        {isThisRowBusy && pendingAction === "approve"
                          ? t("notifications.refundAuth.approving")
                          : t("notifications.refundAuth.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                        disabled={pendingId !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRejectRefund(notification._id);
                        }}
                      >
                        {isThisRowBusy && pendingAction === "reject"
                          ? t("notifications.refundAuth.rejecting")
                          : t("notifications.refundAuth.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
