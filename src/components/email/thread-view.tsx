import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Reply, User, Building2, TrendingUp } from "@/lib/ez-icons";

interface ThreadViewProps {
  organizationId: Id<"organizations">;
  threadId: string;
  onReply: (emailId: string) => void;
}

/**
 * Strips HTML tags for safe text rendering.
 * Used as a fallback when bodyText is not available.
 */
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.textContent = html;
  return div.textContent ?? "";
}

export function ThreadView({
  organizationId,
  threadId,
  onReply,
}: ThreadViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const markRead = useMutation(api.emails.markRead);

  const { data: thread } = useQuery(
    convexQuery(api.emails.getThread, { organizationId, threadId })
  );

  const messages = thread ?? [];

  // Mark unread messages as read when the thread is viewed
  useEffect(() => {
    if (!messages.length) return;
    for (const msg of messages) {
      if (!msg.isRead) {
        markRead({
          organizationId,
          emailId: msg._id as Id<"emails">,
        });
      }
    }
  }, [messages, organizationId, markRead]);

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getInitials = (email: string) => {
    const name = email.split("@")[0];
    return name.slice(0, 2).toUpperCase();
  };

  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("inbox.thread.noMessages")}
        </p>
      </div>
    );
  }

  const subject = messages[0]?.subject ?? "(no subject)";
  const lastMessage = messages[messages.length - 1];

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="shrink-0 border-b px-6 py-4">
        <h2 className="text-lg font-semibold">{subject}</h2>
        <div className="mt-1 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </span>
          {/* Entity links */}
          {lastMessage?.contactId && (
            <button
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() =>
                navigate({
                  to: `/dashboard/contacts/${lastMessage.contactId}`,
                })
              }
            >
              <User className="h-3 w-3" />
              {t("inbox.linkContact")}
            </button>
          )}
          {lastMessage?.companyId && (
            <button
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() =>
                navigate({
                  to: `/dashboard/companies/${lastMessage.companyId}`,
                })
              }
            >
              <Building2 className="h-3 w-3" />
              {t("inbox.linkCompany")}
            </button>
          )}
          {lastMessage?.leadId && (
            <button
              className="flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() =>
                navigate({
                  to: `/dashboard/leads/${lastMessage.leadId}`,
                })
              }
            >
              <TrendingUp className="h-3 w-3" />
              {t("inbox.linkDeal")}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-6">
          {messages.map((msg, index) => (
            <div key={msg._id}>
              {index > 0 && <Separator className="my-4" />}
              <div className="space-y-3">
                {/* Message header */}
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">
                      {getInitials(msg.from ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {msg.from}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(msg.sentAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("inbox.thread.to")}: {msg.to?.join(", ")}
                    </p>
                  </div>
                </div>

                {/* Message body - render plain text from bodyText or strip HTML as fallback */}
                <div className="pl-11">
                  <pre className="whitespace-pre-wrap text-sm font-sans">
                    {msg.bodyText
                      ? msg.bodyText
                      : msg.bodyHtml
                        ? stripHtml(msg.bodyHtml)
                        : ""}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Reply bar */}
      <div className="shrink-0 border-t px-6 py-3">
        <Button
          variant="outline"
          onClick={() => onReply(lastMessage._id)}
        >
          <Reply className="mr-2 h-4 w-4" />
          {t("inbox.reply")}
        </Button>
      </div>
    </div>
  );
}
