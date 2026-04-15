import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import { useNudges } from "@/contexts/nudges-context";
import { NudgeData } from "@/contexts/nudges-context";

const severityConfig = {
  red: {
    Icon: AlertCircle,
    bgClass: "bg-red-500/10",
    iconClass: "text-red-500",
    badgeClass: "bg-red-500",
  },
  yellow: {
    Icon: AlertTriangle,
    bgClass: "bg-amber-500/10",
    iconClass: "text-amber-500",
    badgeClass: "bg-amber-500",
  },
  green: {
    Icon: CheckCircle,
    bgClass: "bg-emerald-500/10",
    iconClass: "text-emerald-500",
    badgeClass: "bg-emerald-500",
  },
} as const;

export function NudgesBadge() {
  const { t } = useTranslation();
  const { nudges, totalCount, isLoading } = useNudges();
  const [open, setOpen] = useState(false);

  // Auto-refresh nudges every 60 seconds
  useEffect(() => {
    if (totalCount === 0) return;

    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('refresh-nudges'));
    }, 60000);

    return () => clearInterval(interval);
  }, [totalCount]);

  if (totalCount === 0 && !isLoading) {
    return null;
  }

  // Get the highest severity for the badge color
  const highestSeverity = (() => {
    if (nudges.some(n => n.severity === "red")) return "red";
    if (nudges.some(n => n.severity === "yellow")) return "yellow";
    return "green";
  })();

  const config = severityConfig[highestSeverity];
  const Icon = config.Icon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-7 w-7 p-0"
        >
          <Icon className="h-4 w-4" />
          {totalCount > 0 && (
            <Badge
              className={`absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 text-[10px] font-medium ${config.badgeClass}`}
            >
              {totalCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">
              {t("nudges.title", "Powiadomienia")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {totalCount} {t("nudges.countLabel", "elementów wymagających uwagi")}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <ScrollShadow className="max-h-96">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-2">
                  <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : nudges.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("nudges.empty", "Brak powiadomień")}
            </div>
          ) : (
            <div className="divide-y">
              {nudges.map((nudge, idx) => {
                const nudgeConfig = severityConfig[nudge.severity];
                const NudgeIcon = nudgeConfig.Icon;
                return (
                  <div
                    key={`${nudge.message}-${idx}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${nudgeConfig.bgClass}`}
                    >
                      <NudgeIcon
                        className={`h-4 w-4 ${nudgeConfig.iconClass}`}
                      />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <p className="text-sm leading-snug">
                        {t(nudge.message, {
                          defaultValue: nudge.message,
                          ...(nudge.messageValues ?? {}),
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollShadow>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
