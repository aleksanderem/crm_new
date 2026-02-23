import { useState, useCallback } from "react";
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

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b bg-background px-6 py-3">
        <h1 className="text-xl font-semibold">{t("inbox.title")}</h1>
        <div className="flex items-center gap-3">
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as FilterTab)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="all" className="h-7 text-xs">
                {t("inbox.filters.all")}
              </TabsTrigger>
              <TabsTrigger value="unread" className="h-7 text-xs">
                {t("inbox.filters.unread")}
              </TabsTrigger>
              <TabsTrigger value="sent" className="h-7 text-xs">
                {t("inbox.filters.sent")}
              </TabsTrigger>
              <TabsTrigger value="starred" className="h-7 text-xs">
                {t("inbox.filters.starred")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {googleConnection && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncGmail}
              disabled={isSyncing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? t("integrations.syncing") : t("integrations.syncNow")}
            </Button>
          )}
          <Button size="sm" onClick={() => setComposeOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("inbox.compose")}
          </Button>
        </div>
      </div>

      {/* Two-pane layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane - inbox list */}
        <div className="w-[380px] shrink-0">
          <InboxList
            organizationId={organizationId}
            selectedThreadId={selectedThreadId}
            onSelectThread={handleSelectThread}
            filter={filter}
          />
        </div>

        {/* Right pane - thread view or empty state */}
        <div className="flex-1 overflow-hidden">
          {selectedThreadId ? (
            <ThreadView
              organizationId={organizationId}
              threadId={selectedThreadId}
              onReply={handleReply}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <Mail className="mb-3 h-12 w-12 opacity-20" />
              <p className="text-sm">{t("inbox.empty")}</p>
            </div>
          )}
        </div>
      </div>

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
