import { createFileRoute } from "@tanstack/react-router";
import { PermissionGate } from "@/hooks/use-permission";
import { DeliveriesPageSkeleton, DeliveriesPage } from "@/components/gabinet/deliveries/deliveries-page";
import { useActiveLocation } from "@/contexts/gabinet-location-context";
import type { Id } from "@cvx/_generated/dataModel";

function DeliveriesRoute() {
  const { activeLocationId } = useActiveLocation();
  return (
    <PermissionGate
      feature="gabinet_inventory"
      action="view"
      locationId={(activeLocationId ?? undefined) as Id<"gabinetLocations"> | undefined}
      loadingFallback={<DeliveriesPageSkeleton />}
    >
      <DeliveriesPage />
    </PermissionGate>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/deliveries",
)({
  component: DeliveriesRoute,
  validateSearch: (search: Record<string, unknown>): { action?: "create" } => ({
    action: search.action === "create" ? "create" : undefined,
  }),
});
