import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/form-templates",
)({
  component: FormTemplateSettingsLayout,
});

function FormTemplateSettingsLayout() {
  return <Outlet />;
}
