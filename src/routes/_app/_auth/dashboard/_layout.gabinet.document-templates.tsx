import { createFileRoute } from "@tanstack/react-router";
import { FormTemplatesListPage } from "./_layout.settings.form-templates.index";
import { PermissionGate } from "@/hooks/use-permission";
import { Skeleton } from "@/components/ui/skeleton";

function DocumentTemplatesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/document-templates",
)({
  component: () => (
    <PermissionGate feature="document_templates" action="view" loadingFallback={<DocumentTemplatesSkeleton />}>
      <FormTemplatesListPage />
    </PermissionGate>
  ),
});
