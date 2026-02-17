import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/calendar/"
)({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/calendar", search: { filter: "gabinet" } });
  },
  component: () => null,
});
