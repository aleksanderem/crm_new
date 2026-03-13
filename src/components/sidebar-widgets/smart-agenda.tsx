import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { CalendarCheck, Phone, Mail, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SmartAgendaProps {
  organizationId: string;
  userId: string;
}

function eventIcon(type: string | undefined) {
  switch (type) {
    case "call":
      return <Phone className="h-3 w-3 shrink-0" />;
    case "email":
      return <Mail className="h-3 w-3 shrink-0" />;
    case "meeting":
      return <Users className="h-3 w-3 shrink-0" />;
    default:
      return <CalendarCheck className="h-3 w-3 shrink-0" />;
  }
}

export function SmartAgenda({ organizationId, userId }: SmartAgendaProps) {
  const { t } = useTranslation();
  const events = useQuery(api.sidebarWidgets.getUpcomingEvents, {
    organizationId: organizationId as any,
    userId: userId as any,
  });

  if (!events || events.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[9px] font-semibold uppercase tracking-wider">
        {t("sidebar.smartAgenda", "SMART AGENDA")}
      </span>
      <div className="flex flex-col gap-1.5">
        {events.map((event) => (
          <div key={String(event.id)} className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{eventIcon(event.type)}</span>
            <span className="text-muted-foreground w-10 shrink-0 text-[9px] tabular-nums">
              {new Date(event.startTime).toLocaleTimeString("pl-PL", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-foreground min-w-0 flex-1 truncate text-[10px]">
              {event.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
