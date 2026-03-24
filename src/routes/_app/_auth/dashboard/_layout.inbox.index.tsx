import { useState, useCallback, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useTranslation } from "react-i18next";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { InboxList } from "@/components/email/inbox-list";
import type { FilterTab } from "@/components/email/inbox-list";
import { ThreadView } from "@/components/email/thread-view";
import { ComposeDialog } from "@/components/email/compose-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Mail, RefreshCw } from "@/lib/ez-icons";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/inbox/"
)({
  component: InboxPage,
});

function InboxPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: googleConnection } = useQuery(
    convexQuery(api.oauthConnections.getByProvider, {
      organizationId,
      provider: "google",
    })
  );
  const syncGmail = useAction(api.google.gmail.syncInbox);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncGmail = async () => {
    setIsSyncing(true);
    try {
      const result = await syncGmail({ organizationId });
      toast.success(`${t("integrations.syncing")} — ${result.synced} emails`);
    } catch (e: any) {
      toast.error(e.message ?? "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const [filter, setFilter] = useState<FilterTab>("all");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{
    emailId: string;
    threadId: string;
    subject: string;
    from: string;
    to: string[];
  } | null>(null);

  // Sidebar dispatch handlers
  useSidebarDispatch("composeEmail", () => {
    setComposeOpen(true);
  });
  useSidebarDispatch("viewUnread", () => {
    setFilter("unread");
  });

  const handleSelectThread = useCallback(
    (threadId: string, _emailId: string) => {
      setSelectedThreadId(threadId);
    },
    []
  );

  const handleReply = useCallback(
    (emailId: string) => {
      setReplyTo({
        emailId,
        threadId: selectedThreadId ?? emailId,
        subject: "",
        from: "",
        to: [],
      });
      setComposeOpen(true);
    },
    [selectedThreadId]
  );

  const handleComposeClose = useCallback((open: boolean) => {
    setComposeOpen(open);
    if (!open) setReplyTo(null);
  }, []);

  // --- Push inbox list into the sidebar slot ---
  const { setContent: setSidebarContent } = useSidebarSlot();
  useEffect(() => {
    setSidebarContent(
      <div className="flex flex-col gap-3 -mx-3">
        {/* Filter tabs */}
        <div className="px-1">
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as FilterTab)}
          >
            <TabsList className="h-8 w-full">
              <TabsTrigger value="all" className="h-7 text-xs flex-1">
                {t("inbox.filters.all")}
              </TabsTrigger>
              <TabsTrigger value="unread" className="h-7 text-xs flex-1">
                {t("inbox.filters.unread")}
              </TabsTrigger>
              <TabsTrigger value="sent" className="h-7 text-xs flex-1">
                {t("inbox.filters.sent")}
              </TabsTrigger>
              <TabsTrigger value="starred" className="h-7 text-xs flex-1">
                {t("inbox.filters.starred")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 px-1">
          <Button size="sm" className="flex-1" onClick={() => setComposeOpen(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
            {t("inbox.compose")}
          </Button>
          {googleConnection && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncGmail}
              disabled={isSyncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} variant="stroke" />
            </Button>
          )}
        </div>

        {/* Email list */}
        <div className="flex-1 min-h-0 -mb-4">
          <InboxList
            organizationId={organizationId}
            selectedThreadId={selectedThreadId}
            onSelectThread={handleSelectThread}
            filter={filter}
          />
        </div>
      </div>
    );

    return () => setSidebarContent(null);
  }, [
    organizationId,
    selectedThreadId,
    filter,
    googleConnection,
    isSyncing,
    t,
    setSidebarContent,
    handleSelectThread,
    handleSyncGmail,
  ]);

  // --- Main content: thread view only ---
  return (
    <div className="flex h-full flex-col">
      {selectedThreadId ? (
        <div className="min-h-0 flex-1">
          <ThreadView
            organizationId={organizationId}
            threadId={selectedThreadId}
            onReply={handleReply}
          />
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
          <Mail className="mb-3 h-12 w-12 opacity-20" />
          <p className="text-sm">{t("inbox.empty")}</p>
        </div>
      )}

      {/* Compose dialog */}
      <ComposeDialog
        organizationId={organizationId}
        open={composeOpen}
        onOpenChange={handleComposeClose}
        replyTo={replyTo ?? undefined}
      />
    </div>
  );
}
