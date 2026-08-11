import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/hooks/use-permission";
import { DeliveriesPageSkeleton, DeliveriesPage } from "@/components/gabinet/deliveries/deliveries-page";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/deliveries",
)({
  component: () => (
    <PermissionGate feature="gabinet_inventory" action="view" loadingFallback={<DeliveriesPageSkeleton />}>
      <DeliveriesPage />
    </PermissionGate>
  ),
  validateSearch: (search: Record<string, unknown>): { action?: "create" } => ({
    action: search.action === "create" ? "create" : undefined,
  }),
});
