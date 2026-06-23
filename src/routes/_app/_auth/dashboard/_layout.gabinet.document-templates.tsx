import { createFileRoute } from "@tanstack/react-router";
import { FormTemplatesListPage } from "./_layout.settings.form-templates.index";
import { PermissionGate } from "@/hooks/use-permission";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/document-templates",
)({
  component: () => (
    <PermissionGate feature="document_templates" action="view">
      <FormTemplatesListPage />
    </PermissionGate>
  ),
});
