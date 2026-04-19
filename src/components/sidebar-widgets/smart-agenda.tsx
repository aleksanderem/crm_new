import { useState, useMemo } from "react";
import type { Id } from "@cvx/_generated/dataModel";
import {
  useSupabaseUpcomingEvents,
  type UpcomingEvent,
} from "@/hooks/use-supabase-scheduled-activities";
import { cn } from "@/utils/misc";
import { CalendarCheck, Phone, Mail, Users } from "lucide-react";
import { ChevronDown } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@tanstack/react-router";

interface SmartAgendaProps {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
}

type TabValue = "all" | "mine";

const typeIcons: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
};
const defaultTypeIcon = CalendarCheck;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getDayLabel(
  timestamp: number,
  locale: string,
  labels: { today: string; tomorrow: string },
): string {
  const eventDate = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

  if (eventDay.getTime() === today.getTime()) return labels.today;
  if (eventDay.getTime() === tomorrow.getTime()) return labels.tomorrow;
  return eventDate.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

interface GroupedEvents {
  label: string;
  events: UpcomingEvent[];
}

export function SmartAgenda({ organizationId, userId }: SmartAgendaProps) {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<TabValue>("mine");
  const [collapsed, setCollapsed] = useState(false);

  const typeConfig: Record<string, { Icon: typeof Phone; label: string }> = {
    call: { Icon: typeIcons.call, label: t("sidebar.agendaCall", "Call") },
    email: { Icon: typeIcons.email, label: t("sidebar.agendaEmail", "Email") },
    meeting: { Icon: typeIcons.meeting, label: t("sidebar.agendaMeeting", "Meeting") },
  };
  const defaultType = {
    Icon: defaultTypeIcon,
    label: t("sidebar.agendaEvent", "Event"),
  };
  const dayLabels = {
    today: t("sidebar.agendaToday", "Today"),
    tomorrow: t("sidebar.agendaTomorrow", "Tomorrow"),
  };

  const { data: events } = useSupabaseUpcomingEvents(
    organizationId,
    userId,
    { onlyMine: tab === "mine" },
  );

  const grouped = useMemo(() => {
    if (!events?.length) return [];
    const groups: GroupedEvents[] = [];
    let currentLabel = "";

    for (const event of events) {
      const label = getDayLabel(event.startTime, i18n.language, dayLabels);
      if (label !== currentLabel) {
        groups.push({ label, events: [] });
        currentLabel = label;
      }
      groups[groups.length - 1].events.push(event);
    }
    return groups;
  }, [dayLabels, events, i18n.language]);

  if (!events || events.length === 0) return null;

  const tabs: { value: TabValue; label: string }[] = [
    { value: "all", label: t("sidebar.agendaAll", "All") },
    { value: "mine", label: t("sidebar.agendaMine", "Mine") },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between px-3 py-2.5"
      >
        <div className="flex flex-col gap-0.5 text-left">
          <span className="text-xs font-semibold">
            {t("sidebar.smartAgenda", "Smart Agenda")}
          </span>
          <span className="text-muted-foreground text-[10px]">
            {events.length} {t("sidebar.upcoming", "Upcoming")}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            collapsed && "-rotate-90",
          )}
          variant="stroke"
        />
      </button>

      {!collapsed && (
        <>
          {/* Tabs row */}
          <div className="border-b px-3">
            <div className="flex">
              {tabs.map((tabItem) => (
                <button
                  key={tabItem.value}
                  type="button"
                  onClick={() => setTab(tabItem.value)}
                  className={cn(
                    "relative pb-1.5 pt-1 text-[11px] font-medium transition-colors",
                    tabItem.value === tab
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground/70",
                    tabItem.value !== tabs[0].value && "ml-4",
                  )}
                >
                  {tabItem.label}
                  {tabItem.value === tab && (
                    <span className="bg-primary absolute inset-x-0 bottom-0 h-0.5 rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable timeline */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
            <div className="flex flex-col gap-2">
              {grouped.map((group) => (
                <div key={group.label} className="flex flex-col">
                  <span className="text-muted-foreground mb-1 text-[9px] font-semibold uppercase tracking-wider">
                    {group.label}
                  </span>

                  <div className="relative flex flex-col">
                    {group.events.map((event, idx) => {
                      const cfg = typeConfig[event.type ?? ""] ?? defaultType;
                      const isLast = idx === group.events.length - 1;
                      const time = new Date(event.startTime).toLocaleTimeString(i18n.language, {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      const content = (
                        <div className="relative flex gap-3 py-1.5">
                          <div className="relative flex flex-col items-center">
                            <cfg.Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                            {!isLast && (
                              <div className="border-muted-foreground/30 absolute top-5 h-[calc(100%+1px)] w-0 border-l border-dashed" />
                            )}
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-0.5">
                            <span className="text-muted-foreground text-[10px] leading-none">
                              {cfg.label}
                            </span>
                            <span className="text-foreground truncate text-[11px] font-semibold leading-snug">
                              {event.title}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground text-[10px] leading-none tabular-nums">
                                {time}
                              </span>
                              <span className="text-muted-foreground text-[10px] leading-none">·</span>
                              <Avatar className="h-3.5 w-3.5">
                                {event.ownerImage && (
                                  <AvatarImage src={event.ownerImage} alt={event.ownerName} />
                                )}
                                <AvatarFallback className="text-[6px]">
                                  {getInitials(event.ownerName)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-muted-foreground truncate text-[10px] leading-none">
                                {event.ownerName}
                              </span>
                            </div>
                          </div>
                        </div>
                      );

                      return (
                        <div key={String(event.id)}>
                          {idx > 0 && <Separator className="ml-4" />}
                          {event.appointmentLink ? (
                            <Link
                              to={event.appointmentLink}
                              className="hover:bg-muted/40 block rounded-md transition-colors"
                            >
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
