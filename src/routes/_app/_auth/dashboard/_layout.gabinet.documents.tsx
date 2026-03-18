import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/documents",
)({
  component: GabinetDocumentsLayout,
});

function GabinetDocumentsLayout() {
  return <Outlet />;
}
