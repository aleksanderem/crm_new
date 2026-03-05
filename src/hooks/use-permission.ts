import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import type { Feature, Action, Scope } from "@cvx/_helpers/permissionTypes";

export type { Feature, Action, Scope };

export function usePermission(
  feature: Feature,
  action: Action
): {
  allowed: boolean;
  scope: Scope;
  loading: boolean;
} {
  const { organizationId } = useOrganization();

  const permissions = useQuery(
    api.permissions.getMyPermissions,
    organizationId ? { organizationId } : "skip"
  );

  if (permissions === undefined) {
    return { allowed: false, scope: "none", loading: true };
  }

  const featurePerms = permissions[feature];
  const scope: Scope = featurePerms?.[action] ?? "none";

  return {
    allowed: scope !== "none",
    scope,
    loading: false,
  };
}

/**
 * Returns a map of feature → boolean for the given action.
 * Useful when checking create permissions across many features at once
 * (e.g. in the quick-create menu).
 */
export function usePermissions(
  action: Action
): {
  can: (feature: Feature) => boolean;
  loading: boolean;
} {
  const { organizationId } = useOrganization();

  const permissions = useQuery(
    api.permissions.getMyPermissions,
    organizationId ? { organizationId } : "skip"
  );

  if (permissions === undefined) {
    return { can: () => false, loading: true };
  }

  return {
    can: (feature: Feature) => {
      const scope: Scope = permissions[feature]?.[action] ?? "none";
      return scope !== "none";
    },
    loading: false,
  };
}

export function useRole(): {
  role: string | null;
  loading: boolean;
} {
  const { organizationId } = useOrganization();

  const result = useQuery(
    api.permissions.getMyRole,
    organizationId ? { organizationId } : "skip"
  );

  if (result === undefined) {
    return { role: null, loading: true };
  }

  return { role: result.role, loading: false };
}

export function PermissionGate({
  feature,
  action,
  children,
  fallback,
}: {
  feature: Feature;
  action: Action;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.ReactNode {
  const { allowed, loading } = usePermission(feature, action);
  if (loading) return null;
  if (!allowed) return fallback ?? null;
  return children;
}
