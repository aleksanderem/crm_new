import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Star } from "lucide-react";

export type FilterTab = "all" | "unread" | "sent" | "starred";

interface InboxListProps {
  organizationId: Id<"organizations">;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string, emailId: string) => void;
  filter: FilterTab;
}

export function InboxList({
  organizationId,
  selectedThreadId,
  onSelectThread,
  filter,
}: InboxListProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const toggleStar = useMutation(api.emails.toggleStar);

  const queryFilter = useMemo(() => {
    const base: {
      organizationId: Id<"organizations">;
      paginationOpts: { numItems: number; cursor: null };
      search?: string;
      isRead?: boolean;
      direction?: "inbound" | "outbound";
    } = {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    };
    if (search.trim()) base.search = search.trim();
    if (filter === "unread") base.isRead = false;
    if (filter === "sent") base.direction = "outbound";
    return base;
  }, [organizationId, filter, search]);

  const { data: emailsData } = useQuery(
    convexQuery(api.emails.listInbox, queryFilter)
  );

  const emails = emailsData?.page ?? [];

  // Group by threadId, show latest email per thread
  const threads = useMemo(() => {
    const threadMap = new Map<
      string,
      (typeof emails)[number]
    >();
    for (const email of emails) {
      const tid = email.threadId ?? email._id;
      const existing = threadMap.get(tid);
      if (!existing || email.sentAt > existing.sentAt) {
        threadMap.set(tid, email);
      }
    }
    let result = Array.from(threadMap.values());
    // Client-side starred filter
    if (filter === "starred") {
      result = result.filter((e) => e.isStarred);
    }
    return result.sort((a, b) => b.sentAt - a.sentAt);
  }, [emails, filter]);

  const handleToggleStar = async (
    e: React.MouseEvent,
    emailId: string,
  ) => {
    e.stopPropagation();
    await toggleStar({
      organizationId,
      emailId: emailId as Id<"emails">,
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="flex h-full flex-col border-r">
      {/* Search */}
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center rounded-md border bg-transparent">
          <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            className="h-8 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={t("inbox.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Email list */}
      <ScrollArea className="flex-1">
        {threads.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">
              {filter === "all" && !search
                ? t("inbox.empty")
                : t("inbox.emptyFiltered")}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {threads.map((email) => {
              const threadId = email.threadId ?? email._id;
              const isSelected = selectedThreadId === threadId;
              const displayName =
                email.direction === "outbound"
                  ? (email.to?.[0] ?? "")
                  : (email.from ?? "");
              const snippet =
                email.snippet ??
                (email.bodyText
                  ? email.bodyText.slice(0, 100)
                  : "");

              return (
                <button
                  key={email._id}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    isSelected && "bg-muted"
                  )}
                  onClick={() => onSelectThread(threadId, email._id)}
                >
                  {/* Unread indicator */}
                  <div className="mt-2 shrink-0">
                    {!email.isRead ? (
                      <span className="block h-2 w-2 rounded-full bg-blue-500" />
                    ) : (
                      <span className="block h-2 w-2" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm",
                          !email.isRead && "font-semibold"
                        )}
                      >
                        {displayName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(email.sentAt)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "truncate text-sm",
                        !email.isRead
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {email.subject || "(no subject)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {snippet}
                    </p>
                  </div>

                  {/* Star */}
                  <button
                    type="button"
                    className="mt-1 shrink-0 text-muted-foreground hover:text-yellow-500"
                    onClick={(e) =>
                      handleToggleStar(e, email._id)
                    }
                  >
                    <Star
                      className={cn(
                        "h-4 w-4",
                        email.isStarred &&
                          "fill-yellow-400 text-yellow-400"
                      )}
                    />
                  </button>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
