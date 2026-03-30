import { useState, useMemo } from "react";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { useSupabaseEmailsList } from "@/hooks/use-supabase-emails";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Star } from "@/lib/ez-icons";

export type FilterTab = "all" | "unread" | "sent" | "starred";

interface InboxListProps {
  organizationId: Id<"organizations">;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string, emailId: string) => void;
  filter: FilterTab;
  mailProviderId?: Id<"mailProviders">;
}

export function InboxList({
  organizationId,
  selectedThreadId,
  onSelectThread,
  filter,
  mailProviderId,
}: InboxListProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  // @ts-ignore — TS2589: Convex mutation type instantiation depth exceeded
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toggleStar: any = useMutation(api.emails.toggleStar);

  const { data: emailsData } = useSupabaseEmailsList(organizationId, {
    search: search.trim() || undefined,
    isRead: filter === "unread" ? false : undefined,
    direction: filter === "sent" ? "outbound" : undefined,
    mailProviderId,
    limit: 50,
  });

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
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="shrink-0 border-b p-3">
        <div className="flex items-center rounded-md border bg-transparent">
          <Search className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" variant="stroke" />
          <Input
            type="text"
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-2"
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
              const rawName =
                email.direction === "outbound"
                  ? (email.to?.[0] ?? "")
                  : (email.from ?? "");
              // Show only the local part for raw email addresses
              const displayName = rawName.includes("@") && !rawName.includes("<")
                ? rawName.split("@")[0]
                : rawName;
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
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 border-l-2 border-transparent",
                    isSelected && "bg-accent border-l-primary"
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
                    <div className="flex min-w-0 items-center justify-between gap-2">
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
