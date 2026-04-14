import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/document-components",
)({
  component: DocumentComponentsLayout,
});

function DocumentComponentsLayout() {
  return <Outlet />;
}
