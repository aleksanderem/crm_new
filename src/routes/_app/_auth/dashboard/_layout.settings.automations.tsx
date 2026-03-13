import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/automations",
)({
  component: AutomationSettingsLayout,
});

function AutomationSettingsLayout() {
  return <Outlet />;
}
