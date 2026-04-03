/**
 * ActivityFeed — HubSpot-style activity feed with inline entry creation.
 *
 * Features:
 * - Tabbed inline input: Note / Email / Call / Log
 * - Timeline with per-type card layouts
 * - Filter bar by activity type
 * - Relative timestamps + user avatars
 * - Pinned items on top
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import {
  StickyNote,
  Mail,
  PhoneCall,
  Calendar,
  ArrowRight,
  Pencil,
  Plus,
  Trash2,
  Send,
  Pin,
  RefreshCw,
  UserCheck,
  Link as LinkIcon,
  Upload,
} from "@/lib/ez-icons";
import type { ActivityAction } from "@cvx/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeedEntry {
  _id: string;
  type: "note" | "email" | "call" | "activity" | "system";
  action: ActivityAction;
  title?: string;
  body?: string;
  /** HTML content for emails */
  htmlBody?: string;
  performedBy?: {
    name: string;
    avatarUrl?: string;
  };
  createdAt: number;
  pinned?: boolean;
  metadata?: Record<string, unknown>;
  /** For emails */
  emailSubject?: string;
  emailTo?: string[];
  /** For calls */
  callDuration?: number;
  callDirection?: "inbound" | "outbound";
  /** For status changes */
  fromStatus?: string;
  toStatus?: string;
}

export interface ActivityFeedProps {
  entries: FeedEntry[];
  /** Called when user submits a new note */
  onAddNote?: (content: string) => void | Promise<void>;
  /** Called when user logs a call */
  onLogCall?: (data: { note: string; duration?: number; direction?: string }) => void | Promise<void>;
  /** Called when user wants to send an email */
  onComposeEmail?: () => void;
  /** Called when user schedules an activity */
  onScheduleActivity?: () => void;
  /** Whether the submit buttons should show loading */
  isSubmitting?: boolean;
  /** Max height for the scroll area */
  maxHeight?: string;
  /** Additional filter options */
  filterTypes?: string[];
}

// ---------------------------------------------------------------------------
// Action type config
// ---------------------------------------------------------------------------

const typeIcons: Record<string, typeof StickyNote> = {
  note: StickyNote,
  email_sent: Mail,
  email_received: Mail,
  call: PhoneCall,
  activity: Calendar,
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
  note_added: StickyNote,
  stage_changed: ArrowRight,
  status_changed: RefreshCw,
  assigned: UserCheck,
  relationship_added: LinkIcon,
  relationship_removed: LinkIcon,
  document_uploaded: Upload,
  sms_sent: Send,
  sms_received: Send,
  package_assigned: UserCheck,
};

const typeColors: Record<string, string> = {
  note: "bg-amber-50 text-amber-600 border-amber-200",
  email_sent: "bg-blue-50 text-blue-600 border-blue-200",
  email_received: "bg-emerald-50 text-emerald-600 border-emerald-200",
  call: "bg-violet-50 text-violet-600 border-violet-200",
  activity: "bg-indigo-50 text-indigo-600 border-indigo-200",
  created: "bg-green-50 text-green-600 border-green-200",
  updated: "bg-sky-50 text-sky-600 border-sky-200",
  deleted: "bg-red-50 text-red-600 border-red-200",
  note_added: "bg-amber-50 text-amber-600 border-amber-200",
  stage_changed: "bg-purple-50 text-purple-600 border-purple-200",
  status_changed: "bg-pink-50 text-pink-600 border-pink-200",
  assigned: "bg-indigo-50 text-indigo-600 border-indigo-200",
  relationship_added: "bg-cyan-50 text-cyan-600 border-cyan-200",
  relationship_removed: "bg-orange-50 text-orange-600 border-orange-200",
  document_uploaded: "bg-teal-50 text-teal-600 border-teal-200",
  sms_sent: "bg-violet-50 text-violet-600 border-violet-200",
  sms_received: "bg-lime-50 text-lime-600 border-lime-200",
  package_assigned: "bg-indigo-50 text-indigo-600 border-indigo-200",
};

const filterLabels: Record<string, string> = {
  all: "Wszystkie",
  note: "Notatki",
  email: "E-maile",
  call: "Połączenia",
  activity: "Aktywności",
  system: "System",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "przed chwilą";
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h temu`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d temu`;
  return new Date(ts).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
    year: days > 365 ? "numeric" : undefined,
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ActivityFeed({
  entries,
  onAddNote,
  onLogCall,
  onComposeEmail,
  onScheduleActivity,
  isSubmitting = false,
  maxHeight = "600px",
}: ActivityFeedProps) {
  const { t } = useTranslation();
  const [noteContent, setNoteContent] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [inputTab, setInputTab] = useState("note");

  const handleSubmitNote = useCallback(async () => {
    if (!noteContent.trim() || !onAddNote) return;
    await onAddNote(noteContent);
    setNoteContent("");
  }, [noteContent, onAddNote]);

  // Sort: pinned first, then by date desc
  const sortedEntries = [...entries].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.createdAt - a.createdAt;
  });

  const filteredEntries = activeFilter === "all"
    ? sortedEntries
    : sortedEntries.filter((e) => e.type === activeFilter);

  return (
    <div className="flex flex-col gap-4">
      {/* Inline input area */}
      {(onAddNote || onComposeEmail || onLogCall || onScheduleActivity) && (
        <div className="rounded-lg border bg-card">
          <Tabs value={inputTab} onValueChange={setInputTab}>
            <div className="border-b px-3 pt-2">
              <TabsList className="h-8 bg-transparent p-0 gap-0">
                {onAddNote && (
                  <TabsTrigger value="note" className="h-7 text-xs rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                    <StickyNote className="mr-1.5 h-3 w-3" />
                    {t("activityFeed.note", "Notatka")}
                  </TabsTrigger>
                )}
                {onComposeEmail && (
                  <TabsTrigger value="email" className="h-7 text-xs rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                    <Mail className="mr-1.5 h-3 w-3" />
                    {t("activityFeed.email", "Email")}
                  </TabsTrigger>
                )}
                {onLogCall && (
                  <TabsTrigger value="call" className="h-7 text-xs rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                    <PhoneCall className="mr-1.5 h-3 w-3" />
                    {t("activityFeed.call", "Połączenie")}
                  </TabsTrigger>
                )}
                {onScheduleActivity && (
                  <TabsTrigger value="activity" className="h-7 text-xs rounded-b-none data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                    <Calendar className="mr-1.5 h-3 w-3" />
                    {t("activityFeed.activity", "Aktywność")}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>

            {onAddNote && (
              <TabsContent value="note" className="m-0 p-3">
                <RichTextEditor
                  value={noteContent}
                  onChange={(v) => setNoteContent(v ?? "")}
                  placeholder={t("activityFeed.notePlaceholder", "Dodaj notatkę...")}
                  minHeight="80px"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    onClick={handleSubmitNote}
                    disabled={!noteContent.trim() || isSubmitting}
                  >
                    {isSubmitting ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent mr-1.5" />
                    ) : (
                      <StickyNote className="mr-1.5 h-3 w-3" />
                    )}
                    {t("activityFeed.saveNote", "Zapisz notatkę")}
                  </Button>
                </div>
              </TabsContent>
            )}

            {onComposeEmail && (
              <TabsContent value="email" className="m-0 p-3">
                <Button variant="outline" size="sm" onClick={onComposeEmail} className="w-full">
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  {t("activityFeed.composeEmail", "Napisz wiadomość e-mail")}
                </Button>
              </TabsContent>
            )}

            {onLogCall && (
              <TabsContent value="call" className="m-0 p-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onLogCall({ note: "", direction: "outbound" })}
                  className="w-full"
                >
                  <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
                  {t("activityFeed.logCall", "Zaloguj połączenie")}
                </Button>
              </TabsContent>
            )}

            {onScheduleActivity && (
              <TabsContent value="activity" className="m-0 p-3">
                <Button variant="outline" size="sm" onClick={onScheduleActivity} className="w-full">
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />
                  {t("activityFeed.scheduleActivity", "Zaplanuj aktywność")}
                </Button>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {Object.entries(filterLabels).map(([key, label]) => (
          <Button
            key={key}
            variant={activeFilter === key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveFilter(key)}
          >
            {label}
            {key !== "all" && (
              <span className="ml-1 text-[10px] opacity-60">
                {entries.filter((e) => e.type === key).length}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Timeline */}
      <ScrollArea style={{ maxHeight }}>
        <div className="relative pl-8 space-y-0">
          {/* Vertical line */}
          <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />

          {filteredEntries.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("activityFeed.empty", "Brak aktywności")}
            </div>
          ) : (
            filteredEntries.map((entry) => (
              <FeedEntryCard key={entry._id} entry={entry} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feed entry card — renders differently based on type
// ---------------------------------------------------------------------------

function FeedEntryCard({ entry }: { entry: FeedEntry }) {
  const Icon = typeIcons[entry.action] ?? typeIcons[entry.type] ?? Pencil;
  const colorClass = typeColors[entry.action] ?? typeColors[entry.type] ?? "bg-muted text-muted-foreground border-border";
  const actorLabel = entry.performedBy?.name ?? (entry.type === "system" ? "System" : undefined);

  return (
    <div className="relative pb-6 group">
      {/* Icon dot on the timeline */}
      <div className={`absolute -left-8 top-1 flex h-7 w-7 items-center justify-center rounded-full border ${colorClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>

      {/* Card body */}
      <div className="rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow">
        {/* Header row: user + time + pin */}
        <div className="flex items-center gap-2 mb-1.5">
          {entry.performedBy && (
            <Avatar className="h-5 w-5 shrink-0">
              {entry.performedBy.avatarUrl && (
                <AvatarImage src={entry.performedBy.avatarUrl} alt={entry.performedBy.name} />
              )}
              <AvatarFallback className="text-[8px]">
                {entry.performedBy.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          {actorLabel && <span className="text-xs font-medium">{actorLabel}</span>}
          <span className="text-[11px] text-muted-foreground">{timeAgo(entry.createdAt)}</span>
          {entry.pinned && (
            <Pin className="h-3 w-3 text-amber-500 ml-auto" />
          )}
        </div>

        {/* Title (if present) */}
        {entry.title && (
          <p className="text-sm font-medium mb-1">{entry.title}</p>
        )}

        {/* Type-specific content */}
        {entry.type === "email" && (
          <EmailEntryContent entry={entry} />
        )}
        {entry.type === "call" && (
          <CallEntryContent entry={entry} />
        )}
        {entry.type === "note" && entry.body && (
          <div className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
            {entry.body}
          </div>
        )}
        {(entry.type === "activity" || entry.type === "system") && (
          <SystemEntryContent entry={entry} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type-specific content renderers
// ---------------------------------------------------------------------------

function EmailEntryContent({ entry }: { entry: FeedEntry }) {
  return (
    <div className="space-y-1">
      {entry.emailSubject && (
        <p className="text-sm font-medium">{entry.emailSubject}</p>
      )}
      {entry.emailTo && entry.emailTo.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Do: {entry.emailTo.join(", ")}
        </p>
      )}
      {entry.body && (
        <p className="text-sm text-muted-foreground line-clamp-3 mt-1">
          {entry.body}
        </p>
      )}
    </div>
  );
}

function CallEntryContent({ entry }: { entry: FeedEntry }) {
  return (
    <div className="flex items-center gap-3">
      <Badge variant="outline" className="text-xs">
        {entry.callDirection === "inbound" ? "📞 Przychodzące" : "📱 Wychodzące"}
      </Badge>
      {entry.callDuration != null && (
        <span className="text-xs text-muted-foreground">
          {formatDuration(entry.callDuration)}
        </span>
      )}
      {entry.body && (
        <p className="text-sm text-muted-foreground truncate flex-1">{entry.body}</p>
      )}
    </div>
  );
}

function SystemEntryContent({ entry }: { entry: FeedEntry }) {
  return (
    <div>
      {entry.body && (
        <p className="text-sm text-muted-foreground">{entry.body}</p>
      )}
      {entry.fromStatus && entry.toStatus && (
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs">{entry.fromStatus}</Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="outline" className="text-xs">{entry.toStatus}</Badge>
        </div>
      )}
    </div>
  );
}
