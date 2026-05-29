/**
 * Shared visual tokens for gabinet appointment statuses.
 *
 * Used by status badges (patient profile, appointment history, dashboard,
 * employee detail) and by the calendar tile in
 * `src/components/gabinet/calendar/appointment-card.tsx`, so the same color
 * reads consistently wherever a status is shown.
 */

import type { CSSProperties } from "react";

export const APPOINTMENT_STATUS_BADGE_CLASSES: Record<string, string> = {
  pending_confirmation:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  scheduled:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  confirmed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  in_progress:
    "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400",
  completed:
    "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-300",
  cancelled:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400",
  no_show:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-400",
};

export function appointmentStatusBadgeClass(status: string): string {
  return (
    APPOINTMENT_STATUS_BADGE_CLASSES[status] ??
    APPOINTMENT_STATUS_BADGE_CLASSES.scheduled
  );
}

// ---------------------------------------------------------------------------
// Per-employee color shading for calendar tiles
// ---------------------------------------------------------------------------

/**
 * Per-status alpha values used to tint an employee's base color on calendar
 * tiles. Earlier statuses (pending/scheduled) are lighter so confirmed and
 * in-progress visits visually dominate the day. Completed/cancelled are faded
 * because they no longer need attention. Tuned by eye against blue/red/green
 * employee colors so all three read clearly on a white grid.
 */
const STATUS_ALPHA: Record<
  string,
  { bg: number; border: number; opacity: number }
> = {
  pending_confirmation: { bg: 0.1, border: 0.45, opacity: 1 },
  scheduled: { bg: 0.15, border: 0.55, opacity: 1 },
  confirmed: { bg: 0.28, border: 0.75, opacity: 1 },
  in_progress: { bg: 0.5, border: 1, opacity: 1 },
  completed: { bg: 0.08, border: 0.35, opacity: 0.7 },
  cancelled: { bg: 0.1, border: 0.4, opacity: 0.65 },
  no_show: { bg: 0.1, border: 0.55, opacity: 0.8 },
  blocked: { bg: 0.18, border: 0.55, opacity: 0.85 },
};

function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace("#", "");
  const expanded =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (expanded.length !== 6 || /[^0-9a-f]/i.test(expanded)) return null;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function rgbRelativeLuminance({
  r,
  g,
  b,
}: {
  r: number;
  g: number;
  b: number;
}): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export interface AppointmentEmployeeStyle {
  containerStyle: CSSProperties;
  headerStyle: CSSProperties;
  strike: boolean;
}

/**
 * Build inline styles that tint a calendar tile in shades of the employee's
 * chosen color, varying by status. Returns null if the color can't be parsed,
 * letting the caller fall back to the status-only Tailwind classes.
 */
export function appointmentEmployeeStyle(
  status: string,
  baseColor: string,
): AppointmentEmployeeStyle | null {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return null;

  const cfg = STATUS_ALPHA[status] ?? STATUS_ALPHA.scheduled;
  const { r, g, b } = rgb;

  // Darken the base for text so it stays legible on the light tint. For very
  // dark base colors we already have enough contrast — skip the extra darken.
  const lum = rgbRelativeLuminance(rgb);
  const textShift = lum > 0.35 ? 70 : 25;
  const textR = Math.max(0, r - textShift);
  const textG = Math.max(0, g - textShift);
  const textB = Math.max(0, b - textShift);

  // The "in_progress" tile uses a near-solid background, so text needs to be
  // either white (for dark bases) or kept dark (for light bases).
  const headerOnSolid = lum > 0.6 ? "#1f2937" : "#ffffff";

  return {
    containerStyle: {
      backgroundColor: `rgba(${r}, ${g}, ${b}, ${cfg.bg})`,
      borderLeftColor: `rgba(${r}, ${g}, ${b}, ${cfg.border})`,
      color: `rgb(${textR}, ${textG}, ${textB})`,
      opacity: cfg.opacity,
    },
    headerStyle: {
      backgroundColor: `rgba(${r}, ${g}, ${b}, ${Math.min(1, cfg.border + 0.05)})`,
      color: status === "in_progress" ? headerOnSolid : "#ffffff",
    },
    strike: status === "cancelled",
  };
}
