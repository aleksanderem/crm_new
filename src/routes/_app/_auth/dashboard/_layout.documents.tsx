import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents",
)({
  component: DocumentsLayout,
});

function DocumentsLayout() {
  return <Outlet />;
}
