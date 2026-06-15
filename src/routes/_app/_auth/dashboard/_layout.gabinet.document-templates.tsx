import { createFileRoute } from "@tanstack/react-router";
import { FormTemplatesListPage } from "./_layout.settings.form-templates.index";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/document-templates",
)({
  component: FormTemplatesListPage,
});
