import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";

export type Feature =
  | "leads"
  | "contacts"
  | "companies"
  | "documents"
  | "activities"
  | "calls"
  | "email"
  | "products"
  | "pipelines"
  | "gabinet_patients"
  | "gabinet_appointments"
  | "gabinet_treatments"
  | "gabinet_packages"
  | "gabinet_employees"
  | "settings"
  | "team";

export type Action = "view" | "create" | "edit" | "delete";
export type Scope = "none" | "own" | "all";

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
