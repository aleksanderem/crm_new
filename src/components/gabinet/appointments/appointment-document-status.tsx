import { useState } from "react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import { useTranslation } from "react-i18next";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clock,
  FileText,
  Minus,
} from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Local types mirroring convex/gabinet/_helpers/documentGate.ts
// ---------------------------------------------------------------------------

type DocStatus =
  | "satisfied"
  | "expired"
  | "pending"
  | "missing"
  | "not_applicable";

interface DocItem {
  templateId: string;
  title: string;
  isRequired: boolean;
  status: DocStatus;
  blocksCompletion: boolean;
}

interface DocCompleteness {
  isComplete: boolean;
  items: DocItem[];
  summary: {
    total: number;
    satisfied: number;
    expired: number;
    pending: number;
    missing: number;
    notApplicable: number;
    blocking: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusIcon(status: DocStatus) {
  switch (status) {
    case "satisfied":
      return (
        <CircleCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
      );
    case "expired":
      return (
        <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
      );
    case "pending":
      return (
        <Clock className="h-4 w-4 text-yellow-500 dark:text-yellow-400 shrink-0" />
      );
    case "missing":
      return (
        <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0" />
      );
    case "not_applicable":
      return (
        <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
      );
  }
}

function getStatusBadgeClass(status: DocStatus): string {
  switch (status) {
    case "satisfied":
      return "border-green-400 text-green-700 bg-green-50 dark:border-green-600 dark:text-green-400 dark:bg-green-950";
    case "expired":
      return "border-red-400 text-red-700 bg-red-50 dark:border-red-600 dark:text-red-400 dark:bg-red-950";
    case "pending":
      return "border-yellow-400 text-yellow-700 bg-yellow-50 dark:border-yellow-600 dark:text-yellow-400 dark:bg-yellow-950";
    case "missing":
      return "border-red-400 text-red-700 bg-red-50 dark:border-red-600 dark:text-red-400 dark:bg-red-950";
    case "not_applicable":
      return "";
  }
}

type OverallStatus = "complete" | "missing" | "attention";

function getOverallStatus(c: DocCompleteness): OverallStatus {
  if (c.isComplete) return "complete";
  if (c.summary.missing > 0 || c.summary.expired > 0) return "missing";
  return "attention";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AppointmentDocumentStatusProps {
  appointmentId: string;
  organizationId: string;
}

export function AppointmentDocumentStatus({
  appointmentId,
  organizationId,
}: AppointmentDocumentStatusProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const getCompleteness = useAction(
    api.gabinet.appointments.getAppointmentDocCompletenessAction,
  );
  const { data: completeness, isLoading } = useQuery({
    queryKey: [
      "gabinet.appointments.docCompleteness",
      organizationId,
      appointmentId,
    ],
    queryFn: () =>
      getCompleteness({ organizationId, appointmentId }) as Promise<DocCompleteness>,
    enabled: !!organizationId && !!appointmentId,
  });

  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-lg" />;
  }

  if (!completeness || completeness.items.length === 0) {
    return null;
  }

  const overall = getOverallStatus(completeness);

  const overallConfig = {
    complete: {
      labelKey: "gabinet.appointmentDetail.documentStatus.complete",
      fallback: "Dokumentacja kompletna",
      containerClass:
        "border-green-400 text-green-700 bg-green-50 dark:border-green-600 dark:text-green-400 dark:bg-green-950",
      icon: (
        <CircleCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
      ),
    },
    missing: {
      labelKey: "gabinet.appointmentDetail.documentStatus.missingRequired",
      fallback: "Brakuje wymaganych dokumentów",
      containerClass:
        "border-red-400 text-red-700 bg-red-50 dark:border-red-600 dark:text-red-400 dark:bg-red-950",
      icon: (
        <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
      ),
    },
    attention: {
      labelKey: "gabinet.appointmentDetail.documentStatus.needsAttention",
      fallback: "Wymaga uwagi",
      containerClass:
        "border-yellow-400 text-yellow-700 bg-yellow-50 dark:border-yellow-600 dark:text-yellow-400 dark:bg-yellow-950",
      icon: (
        <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
      ),
    },
  }[overall];

  // Default view: show items that are not "not_applicable" — they're the ones that
  // matter to the user at a glance. Expand to reveal all items including n/a.
  const hasNotApplicable = completeness.items.some(
    (i) => i.status === "not_applicable",
  );
  const visibleItems = expanded
    ? completeness.items
    : completeness.items.filter((i) => i.status !== "not_applicable");

  return (
    <Card>
      <CardHeader className="px-6 py-3 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="h-4 w-4" variant="stroke" />
          {t(
            "gabinet.appointmentDetail.documentStatus.title",
            "Status dokumentacji",
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 py-4 space-y-3">
        {/* Overall status badge + progress */}
        <div className="flex items-center justify-between gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium",
              overallConfig.containerClass,
            )}
          >
            {overallConfig.icon}
            {t(overallConfig.labelKey, overallConfig.fallback)}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {t("gabinet.appointmentDetail.documentStatus.progress", {
              satisfied: completeness.summary.satisfied,
              total: completeness.summary.total - completeness.summary.notApplicable,
              defaultValue: "{{satisfied}} / {{total}}",
            })}
          </span>
        </div>

        {/* Document item list */}
        <div className="space-y-1.5">
          {visibleItems.map((item) => (
            <div
              key={item.templateId}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                {getStatusIcon(item.status)}
                <span className="truncate text-sm">{item.title}</span>
                {!item.isRequired && (
                  <Badge
                    variant="outline"
                    className="text-xs shrink-0 text-muted-foreground"
                  >
                    {t(
                      "gabinet.appointmentDetail.documentStatus.optional",
                      "opcjonalny",
                    )}
                  </Badge>
                )}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs shrink-0",
                  getStatusBadgeClass(item.status),
                )}
              >
                {t(
                  `gabinet.appointmentDetail.documentStatus.statuses.${item.status === "not_applicable" ? "notApplicable" : item.status}`,
                  item.status,
                )}
              </Badge>
            </div>
          ))}
        </div>

        {/* Toggle: only when there are not_applicable items to hide/show */}
        {hasNotApplicable && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-muted-foreground"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <>
                {t(
                  "gabinet.appointmentDetail.documentStatus.showLess",
                  "Ukryj niewymagane",
                )}
                <ChevronUp className="h-3 w-3 ml-1" variant="stroke" />
              </>
            ) : (
              <>
                {t(
                  "gabinet.appointmentDetail.documentStatus.showAll",
                  "Pokaż wszystkie",
                )}
                <ChevronDown className="h-3 w-3 ml-1" variant="stroke" />
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
