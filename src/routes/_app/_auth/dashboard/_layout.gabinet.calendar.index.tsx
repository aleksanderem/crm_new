import { createFileRoute } from "@tanstack/react-router";

type CalendarNudgeFilter = "unconfirmed-today";
type CalendarAction = "sell-package" | "create-appointment";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/calendar/",
)({
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: CalendarNudgeFilter; action?: CalendarAction } => ({
    nudge:
      search.nudge === "unconfirmed-today"
        ? (search.nudge as CalendarNudgeFilter)
        : undefined,
    action:
      search.action === "sell-package" || search.action === "create-appointment"
        ? (search.action as CalendarAction)
        : undefined,
  }),
});
