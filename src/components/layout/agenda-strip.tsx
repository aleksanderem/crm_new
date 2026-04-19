import { useState, useEffect, useCallback, useRef } from "react";
import type { Id } from "@cvx/_generated/dataModel";
import { useSupabaseUpcomingEvents } from "@/hooks/use-supabase-scheduled-activities";
import {
  ChevronUp,
  ChevronDown,
  CalendarCheck,
  Phone,
  Mail,
  Users,
  MoreHorizontal,
  ExternalLink,
  Calendar,
  Pencil,
  Play,
  Pause,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "@/utils/misc";
import { useSidebarActions } from "@/components/layout/sidebar-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AgendaStripProps {
  organizationId: Id<"organizations">;
  userId: Id<"users">;
}

const typeIcons: Record<string, typeof Phone> = {
  call: Phone,
  email: Mail,
  meeting: Users,
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "teraz";
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `za ${totalMin}min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 24) return m > 0 ? `za ${h}h ${m}min` : `za ${h}h`;
  const d = Math.floor(h / 24);
  return `za ${d}d`;
}

const AUTOPLAY_INTERVAL = 30_000;

export function AgendaStrip({ organizationId, userId }: AgendaStripProps) {
  const navigate = useNavigate();
  const { openActivityDetail } = useSidebarActions();
  const { data: events } = useSupabaseUpcomingEvents(organizationId, userId, {
    onlyMine: true,
    limit: 20,
  });

  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [autoplay, setAutoplay] = useState(true);
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Reset index when events change
  useEffect(() => {
    setIndex(0);
  }, [events?.length]);

  // Autoplay: cycle through events every 30s
  useEffect(() => {
    if (autoplayRef.current) clearInterval(autoplayRef.current);
    if (autoplay && events && events.length > 1) {
      autoplayRef.current = setInterval(() => {
        setIndex((i) => (i + 1) % events.length);
      }, AUTOPLAY_INTERVAL);
    }
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
  }, [autoplay, events]);

  const prev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setAutoplay(false);
  }, []);
  const next = useCallback(() => {
    setIndex((i) => (events ? Math.min(events.length - 1, i + 1) : i));
    setAutoplay(false);
  }, [events]);

  if (!events || events.length === 0) {
    return (
      <div className="flex h-10 shrink-0 items-center border-b px-4 text-xs text-muted-foreground">
        <CalendarCheck className="mr-2 size-3.5" />
        Brak nadchodzących wydarzeń
      </div>
    );
  }

  const safeIndex = Math.min(index, events.length - 1);
  const event = events[safeIndex];
  const Icon = typeIcons[event.type ?? ""] ?? CalendarCheck;
  const countdown = formatCountdown(event.startTime - now);
  const isPast = event.startTime - now <= 0;
  const time = new Date(event.startTime).toLocaleTimeString("pl", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleOpenDetail = () => {
    if (event.appointmentLink) {
      navigate({ to: event.appointmentLink });
    } else {
      openActivityDetail(event.id);
    }
  };

  return (
    <div className="flex h-10 shrink-0 items-center border-b bg-muted/50 px-4 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        {event.appointmentLink ? (
          <Link to={event.appointmentLink} className="truncate font-medium hover:text-primary hover:underline underline-offset-2 transition-colors">
            {event.title}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => openActivityDetail(event.id)}
            className="truncate font-medium hover:text-primary hover:underline underline-offset-2 transition-colors text-left"
          >
            {event.title}
          </button>
        )}
        <span className="text-muted-foreground shrink-0">{time}</span>
        <span className="text-muted-foreground mx-0.5">·</span>
        <span className={cn("shrink-0 tabular-nums", isPast ? "text-destructive font-semibold" : "text-primary font-semibold")}>
          {countdown}
        </span>
      </div>

      <div className="ml-3 flex items-center gap-1">
        {/* Actions menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded p-0.5 hover:bg-muted transition-colors">
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleOpenDetail}>
              <ExternalLink className="mr-2 size-3.5" />
              Szczegóły
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/dashboard/calendar" })}>
              <Calendar className="mr-2 size-3.5" />
              Kalendarz
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/dashboard/activities" })}>
              <Pencil className="mr-2 size-3.5" />
              Aktywności
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setAutoplay((a) => !a)}>
              {autoplay ? (
                <>
                  <Pause className="mr-2 size-3.5" />
                  Zatrzymaj autoplay
                </>
              ) : (
                <>
                  <Play className="mr-2 size-3.5" />
                  Włącz autoplay
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Counter + nav */}
        <span className="text-muted-foreground tabular-nums mx-0.5">
          {safeIndex + 1}/{events.length}
        </span>
        <button
          onClick={prev}
          disabled={safeIndex === 0 && !autoplay}
          className="rounded p-0.5 hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          onClick={next}
          disabled={safeIndex >= events.length - 1 && !autoplay}
          className="rounded p-0.5 hover:bg-muted disabled:opacity-30 transition-colors"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
