import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: Outlet,
  beforeLoad: async ({ context }) => {
    // Pre-populate the user query cache so authenticated routes render
    // immediately without a loading flash. This is an optimisation only —
    // every page handles its own loading state, so a failure here (e.g. a
    // cold Convex WebSocket connection for a brand-new user clicking an invite
    // link) must never surface as the root error boundary. Swallow any error.
    await context.queryClient
      .ensureQueryData(convexQuery(api.app.getCurrentUser, {}))
      .catch(() => {});
  },
});
