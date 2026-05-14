import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/"
)({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/gabinet/settings/scheduling",
    });
  },
});
