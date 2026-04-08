import { useState, useCallback, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
    convexQuery(api.oauthConnections.getByProvider, {
      organizationId,
      provider: "google",
    })
  );
  const syncGmail = useAction(api.google.gmail.syncInbox);
  const [isSyncing, setIsSyncing] = useState(false);

  const { data: mailProviders } = useQuery(
    convexQuery(api.mailProviders.list, { organizationId })
  );
  const [selectedMailbox, setSelectedMailbox] = useState<string>("all");

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

  // Collapse app sidebar to icon-only so inbox has its own panel
  const { setShellSidebarMode } = useSidebarSlot();
  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  const receiveProviders = mailProviders?.filter((p: any) => p.capabilities.canReceive) ?? [];

  // --- Resizable split ---
  const [listWidth, setListWidth] = useState(380);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    const startX = e.clientX;
    const startWidth = listWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const containerWidth = containerRef.current?.offsetWidth ?? 1200;
      const next = Math.max(260, Math.min(startWidth + delta, containerWidth - 300));
      setListWidth(next);
    };
    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [listWidth]);

  // --- 2-panel layout: inbox list (left) + thread view (right) ---
  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 flex-row -mx-4 sm:-mx-6 -mt-2 -mb-6">
      {/* Left panel: inbox list */}
      <div className="flex shrink-0 flex-col bg-[#F9F9F9] dark:bg-muted/30 overflow-hidden" style={{ width: listWidth }}>
        <div className="flex flex-col gap-3 p-4">
          {/* Mailbox switcher */}
          {receiveProviders.length > 0 && (
            <Select value={selectedMailbox} onValueChange={setSelectedMailbox}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("inbox.allMailboxes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("inbox.allMailboxes")}</SelectItem>
                {receiveProviders.map((provider: any) => (
                  <SelectItem key={provider._id} value={provider._id}>
                    {provider.name} ({provider.fromEmail})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setComposeOpen(true)}>
              <Pencil className="mr-1 h-3 w-3" variant="stroke" />
              {t("inbox.compose")}
            </Button>
            {googleConnection && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleSyncGmail}
                disabled={isSyncing}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} variant="stroke" />
              </Button>
            )}
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <InboxList
            organizationId={organizationId}
            selectedThreadId={selectedThreadId}
            onSelectThread={handleSelectThread}
            filter={filter}
            mailProviderId={selectedMailbox !== "all" ? selectedMailbox as Id<"mailProviders"> : undefined}
          />
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="group relative z-10 w-1 shrink-0 cursor-col-resize select-none"
        onMouseDown={handleResizeStart}
      >
        <div className="absolute inset-y-0 -left-px w-[3px] bg-border transition-colors group-hover:bg-primary/40 group-active:bg-primary" />
      </div>

      {/* Right panel: thread view */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Filter tabs */}
        <div className="shrink-0 border-b px-4 py-2">
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as FilterTab)}
          >
            <TabsList className="h-8">
              <TabsTrigger value="all" className="h-7 text-xs px-3">
                {t("inbox.filters.all")}
              </TabsTrigger>
              <TabsTrigger value="unread" className="h-7 text-xs px-3">
                {t("inbox.filters.unread")}
              </TabsTrigger>
              <TabsTrigger value="sent" className="h-7 text-xs px-3">
                {t("inbox.filters.sent")}
              </TabsTrigger>
              <TabsTrigger value="starred" className="h-7 text-xs px-3">
                {t("inbox.filters.starred")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {selectedThreadId ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
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
