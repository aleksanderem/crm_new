import { Users } from "lucide-react";
import {
  appointmentEmployeeStyle,
  appointmentStatusBadgeClass,
} from "@/lib/gabinet-appointment-status";
import {
  AppointmentIndicatorBadge,
  type AppointmentIndicator,
  type AppointmentIndicatorKind,
} from "./appointment-indicators";

export type { AppointmentIndicator, AppointmentIndicatorKind };

export interface AppointmentTag {
  name: string;
  color: string;
}

interface AppointmentCardProps {
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  variantName?: string;
  status: string;
  color?: string;
  tags?: AppointmentTag[];
  indicators?: AppointmentIndicator[];
  /**
   * When > 1 the same event covers multiple employees. The card collapses
   * those duplicate scheduled-activity rows into one tile and shows a
   * "👥 N" badge. The full list of employee names goes into the button's
   * title so the user can see who the event covers on hover (issue #1694).
   */
  employeeCount?: number;
  employeeNames?: string[];
  /** When > 1 the appointment has multiple treatments. Shows a "+N" badge
   *  next to the treatment name (#3356). */
  treatmentCount?: number;
  onClick?: () => void;
}

export function AppointmentCard({
  startTime,
  endTime,
  patientName,
  treatmentName,
  variantName,
  status,
  color,
  tags,
  indicators,
  employeeCount,
  employeeNames,
  treatmentCount,
  onClick,
}: AppointmentCardProps) {
  // When a base color is provided (employee color, treatment color, or an
  // explicit appointment override), tint the whole tile in shades of that
  // color so each employee's appointments form a visually coherent group on
  // the calendar (issue #1019). When parsing the color fails we fall back to
  // the existing status-only Tailwind palette.
  const employeeStyle = color ? appointmentEmployeeStyle(status, color) : null;
  const fallbackCls = employeeStyle
    ? ""
    : appointmentStatusBadgeClass(status);
  const strike = status === "cancelled" ? " line-through" : "";
  const showEmployeeCount = (employeeCount ?? 0) > 1;
  const employeeListTitle =
    showEmployeeCount && employeeNames && employeeNames.length > 0
      ? employeeNames.join(", ")
      : undefined;
  const hasHeaderBadges =
    (tags && tags.length > 0) ||
    (indicators && indicators.length > 0) ||
    showEmployeeCount;

  return (
    <button
      onClick={onClick}
      title={employeeListTitle}
      className={`flex w-full h-full flex-col overflow-hidden rounded border-l-4 text-left text-xs transition-opacity hover:opacity-80 ${employeeStyle ? "gabinet-tile-tint" : ""} ${fallbackCls}${strike}`}
      style={
        employeeStyle
          ? employeeStyle.containerStyle
          : color
            ? { borderLeftColor: color }
            : undefined
      }
    >
      <div
        className={
          employeeStyle
            ? "flex items-center justify-between gap-1 px-2 py-0.5 font-semibold"
            : "flex items-center justify-between gap-1 bg-black/30 px-2 py-0.5 font-semibold dark:bg-black/50"
        }
        style={employeeStyle ? employeeStyle.headerStyle : undefined}
      >
        <span className="truncate">{startTime}–{endTime}</span>
        {hasHeaderBadges && (
          <div className="flex shrink-0 items-center gap-0.5">
            {tags?.map((tag, i) => (
              <span
                key={`tag-${tag.name}-${i}`}
                title={tag.name}
                className="inline-block h-1.5 w-1.5 rounded-full ring-1 ring-white/60"
                style={{ backgroundColor: tag.color }}
              />
            ))}
            {indicators?.map((ind, i) => (
              <AppointmentIndicatorBadge
                key={`ind-${ind.kind}-${i}`}
                indicator={ind}
              />
            ))}
            {showEmployeeCount && (
              <span
                className="inline-flex items-center gap-0.5 rounded-sm bg-white/25 px-1 text-[10px] font-semibold leading-none dark:bg-white/15"
                title={employeeListTitle}
                aria-label={employeeListTitle}
              >
                <Users className="size-2.5" />
                {employeeCount}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="px-2 py-1">
        <div className="truncate font-medium">{patientName}</div>
        <div className="truncate opacity-75">
          {treatmentName}{variantName ? ` · ${variantName}` : ""}
          {(treatmentCount ?? 0) > 1 && (
            <span className="ml-1 text-[10px] font-semibold opacity-90">
              +{treatmentCount! - 1}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
