/**
 * Shared visual tokens for gabinet appointment statuses.
 *
 * Used by status badges (patient profile, appointment history, dashboard,
 * employee detail) and by the calendar tile in
 * `src/components/gabinet/calendar/appointment-card.tsx`, so the same color
 * reads consistently wherever a status is shown.
 */

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
