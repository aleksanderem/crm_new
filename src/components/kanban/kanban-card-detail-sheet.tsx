import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DollarSign,
  Flag,
  User,
  Building2,
  Calendar,
  ExternalLink,
  ArrowRight,
} from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { KanbanLead } from "./kanban-board";

interface KanbanCardDetailSheetProps {
  lead: KanbanLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName?: string;
  stageColor?: string;
}

function formatCurrency(value: number, currency?: string) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency ?? "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  urgent: {
    label: "Pilny",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
  },
  high: {
    label: "Wysoki",
    className: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-400 dark:border-orange-800",
  },
  normal: {
    label: "Normalny",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
  },
  low: {
    label: "Niski",
    className: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700",
  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function KanbanCardDetailSheet({
  lead,
  open,
  onOpenChange,
  stageName,
  stageColor,
}: KanbanCardDetailSheetProps) {
  const { t } = useTranslation();

  if (!lead) return null;

  const priorityConfig = lead.priority
    ? PRIORITY_CONFIG[lead.priority.toLowerCase()]
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto flex flex-col">
        {/* Header with value + stage */}
        <SheetHeader className="space-y-3">
          <div>
            <SheetTitle className="text-lg leading-tight">
              {lead.title}
            </SheetTitle>
            {lead.companyName && (
              <SheetDescription className="mt-0.5">
                {lead.companyName}
              </SheetDescription>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {lead.value != null && lead.value > 0 && (
              <Badge variant="default" className="text-sm font-semibold px-2.5 py-0.5">
                {formatCurrency(lead.value, lead.currency)}
              </Badge>
            )}
            {stageName && (
              <Badge
                variant="outline"
                className="text-xs"
                style={
                  stageColor
                    ? { borderColor: stageColor, color: stageColor }
                    : undefined
                }
              >
                {stageName}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {/* Value */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              {t("leads.value", "Wartosc")}
            </div>
            <p className="text-sm font-medium">
              {lead.value != null && lead.value > 0
                ? formatCurrency(lead.value, lead.currency)
                : t("common.notSet", "Nie ustawiono")}
            </p>
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flag className="h-3 w-3" />
              {t("leads.priority", "Priorytet")}
            </div>
            {priorityConfig ? (
              <Badge
                variant="outline"
                className={cn("text-xs", priorityConfig.className)}
              >
                {t(`leads.priority.${lead.priority}`, priorityConfig.label)}
              </Badge>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("common.notSet", "Nie ustawiono")}
              </p>
            )}
          </div>

          {/* Assignee */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              {t("leads.assignedTo", "Przypisany")}
            </div>
            {lead.assigneeName ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-5 w-5">
                  {lead.assigneeAvatar && (
                    <AvatarImage src={lead.assigneeAvatar} />
                  )}
                  <AvatarFallback className="text-[9px]">
                    {getInitials(lead.assigneeName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm">{lead.assigneeName}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("leads.unassigned", "Nieprzypisany")}
              </p>
            )}
          </div>

          {/* Company */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3 w-3" />
              {t("leads.company", "Firma")}
            </div>
            <p className="text-sm">
              {lead.companyName ?? t("common.notSet", "Nie ustawiono")}
            </p>
          </div>

          {/* Expected close date */}
          {lead.expectedCloseDate && (
            <div className="space-y-1 col-span-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {t("leads.expectedCloseDate", "Oczekiwane zamkniecie")}
              </div>
              <p className="text-sm">
                {new Intl.DateTimeFormat("pl-PL", {
                  dateStyle: "long",
                }).format(new Date(lead.expectedCloseDate))}
              </p>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Quick actions */}
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full justify-between">
            <Link to="/dashboard/leads/$leadId" params={{ leadId: lead._id }}>
              {t("leads.openDetails", "Otworz szczegoly")}
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-4">
          <Separator className="mb-3" />
          <Link
            to="/dashboard/leads/$leadId"
            params={{ leadId: lead._id }}
            className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {t("leads.openFullView", "Otworz pelny widok")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
