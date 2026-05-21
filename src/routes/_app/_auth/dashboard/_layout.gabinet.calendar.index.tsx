import { createFileRoute } from "@tanstack/react-router";

type CalendarNudgeFilter = "unconfirmed-today";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/calendar/",
)({
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: CalendarNudgeFilter } => ({
    nudge:
      search.nudge === "unconfirmed-today"
        ? (search.nudge as CalendarNudgeFilter)
        : undefined,
  }),
});
