import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { GABINET_MODULES, type GabinetModule } from "@cvx/gabinet/_registry";

export type { GabinetModule };

/**
 * Returns whether the current organization has an active subscription for
 * a given gabinet sub-module (or any product key string).
 *
 * Mirrors the server-side `checkModuleAccess` / `verifyProductAccess` logic:
 * access is granted only when an active or trialing productSubscription row
 * exists for the requested product.
 */
export function useModuleAccess(module: GabinetModule | (string & {})): {
  hasAccess: boolean;
  loading: boolean;
} {
  const { organizationId } = useOrganization();

  const activeProducts = useQuery(
    api.productSubscriptions.getActiveProducts,
    organizationId ? { organizationId } : "skip",
  );

  if (activeProducts === undefined) {
    return { hasAccess: false, loading: true };
  }

  const productId =
    module in GABINET_MODULES
      ? GABINET_MODULES[module as GabinetModule]
      : module;

  return {
    hasAccess: activeProducts.includes(productId),
    loading: false,
  };
}

/**
 * Component-level guard that renders `children` only when the given module
 * subscription is active, `fallback` otherwise. Renders nothing while loading.
 */
export function ModuleAccessGate({
  module,
  children,
  fallback,
  loadingFallback,
}: {
  module: GabinetModule | (string & {});
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}): React.ReactNode {
  const { hasAccess, loading } = useModuleAccess(module);
  if (loading) return loadingFallback ?? null;
  if (!hasAccess) return fallback ?? null;
  return children;
}
