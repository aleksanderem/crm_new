import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ShortagePreviewItem } from "./use-appointment-warnings";

export interface LeaveOnDate {
  startTime?: string;
  endTime?: string;
}

interface LeaveWarningProps {
  leave: LeaveOnDate;
  className?: string;
  size?: "sm" | "compact";
}

export function LeaveWarning({
  leave,
  className,
  size = "sm",
}: LeaveWarningProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
        size === "sm" ? "px-3 py-2 text-sm" : "px-2.5 py-2 text-xs",
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 shrink-0",
          size === "sm" ? "size-4" : "size-3.5",
        )}
      />
      <span>
        {leave.startTime && leave.endTime
          ? t("gabinet.appointments.warnings.leavePartial", {
              start: leave.startTime,
              end: leave.endTime,
              defaultValue:
                "Pracownik jest na urlopie w tym dniu w godzinach {{start}}–{{end}}.",
            })
          : t("gabinet.appointments.warnings.leave", {
              defaultValue: "Pracownik jest na urlopie w tym terminie",
            })}
      </span>
    </div>
  );
}

interface EquipmentWarningProps {
  className?: string;
  size?: "sm" | "compact";
}

export function EquipmentWarning({
  className,
  size = "sm",
}: EquipmentWarningProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive",
        size === "sm" ? "px-3 py-2 text-sm" : "px-3 py-2 text-xs",
        className,
      )}
    >
      <AlertTriangle
        className={cn("shrink-0", size === "sm" ? "size-4" : "size-3.5")}
      />
      {t("gabinet.appointments.equipmentWarning")}
    </div>
  );
}

interface StockShortageWarningProps {
  items: ShortagePreviewItem[];
  className?: string;
  size?: "sm" | "compact";
}

export function StockShortageWarning({
  items,
  className,
  size = "sm",
}: StockShortageWarningProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
        size === "sm" ? "px-3 py-2.5 text-sm" : "px-2.5 py-2 text-xs",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 font-medium",
          items.length > 0 && "mb-2",
        )}
      >
        <AlertTriangle
          className={cn("shrink-0", size === "sm" ? "size-4" : "size-3.5")}
        />
        <span>
          {t(
            "gabinet.appointments.warnings.stockShortageTitle",
            "Planowany niedobór produktów",
          )}
        </span>
      </div>
      <ul className={cn("space-y-2", size === "sm" ? "ml-6" : "ml-5")}>
        {items.map((item) => (
          <li key={item.productName}>
            <p className="font-medium">{item.productName}</p>
            <p>
              {t("gabinet.appointments.warnings.stockCurrent", "Stan")}:{" "}
              {item.currentStock} {item.unit}
            </p>
            <p>
              {t(
                "gabinet.appointments.warnings.stockPlannedAfterSave",
                "Planowane zużycie po zapisaniu tej wizyty",
              )}
              : {item.plannedAfterSave} {item.unit}
            </p>
            <p className="font-medium">
              {t("gabinet.appointments.warnings.stockDeficit", "Brakuje")}:{" "}
              {item.deficit} {item.unit}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ConflictWarningProps {
  className?: string;
  size?: "sm" | "compact";
}

// Surfaced in the appointment dialog when the selected slot overlaps with an
// existing appointment for the same employee. Lets staff opt in to
// double-booking with eyes open (issue #1526) — submission still works because
// the backend skips the soft conflict check when the dialog forwards
// `allowConflict: true`.
export function ConflictWarning({
  className,
  size = "sm",
}: ConflictWarningProps) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
        size === "sm" ? "px-3 py-2 text-sm" : "px-2.5 py-2 text-xs",
        className,
      )}
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 shrink-0",
          size === "sm" ? "size-4" : "size-3.5",
        )}
      />
      <span>
        {t("gabinet.appointments.warnings.conflict", {
          defaultValue: "Kolizja terminów z inną wizytą",
        })}
      </span>
    </div>
  );
}
