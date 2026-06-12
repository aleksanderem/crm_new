import { createFileRoute } from "@tanstack/react-router";

type AppointmentSearch = {
  tab?: "payments" | "documentation";
};

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId"
)({
  validateSearch: (search: Record<string, unknown>): AppointmentSearch => ({
    tab:
      search.tab === "payments"
        ? "payments"
        : search.tab === "documentation"
          ? "documentation"
          : undefined,
  }),
});
