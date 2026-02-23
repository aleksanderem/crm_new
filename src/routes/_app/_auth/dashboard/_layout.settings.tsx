import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/settings")({
  component: DashboardSettingsLayout,
});

export default function DashboardSettingsLayout() {
  return <Outlet />;
}
