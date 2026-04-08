import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useConvexAuth } from "@convex-dev/react-query";
import { Route as AuthLoginRoute } from "@/routes/_app/login/_layout.index";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Navigate
      to={isAuthenticated ? DashboardRoute.fullPath : AuthLoginRoute.fullPath}
      replace
    />
  );
}
