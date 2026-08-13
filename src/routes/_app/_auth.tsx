import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";

export const Route = createFileRoute("/_app/_auth")({
  component: AuthLayout,
});

function AuthLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery({
    ...convexQuery(api.app.getCurrentUser, {}),
    enabled: isAuthenticated,
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login", replace: true });
      return;
    }
    // Authenticated users with a one-time password must set a new one first.
    if (!isLoading && isAuthenticated && user?.mustChangePassword) {
      navigate({ to: "/set-password", replace: true });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  if (isLoading && !isAuthenticated) {
    return null;
  }

  // Block dashboard rendering while the forced password change redirect is in flight.
  if (!isLoading && isAuthenticated && user?.mustChangePassword) {
    return null;
  }

  return <Outlet />;
}
