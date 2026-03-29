import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";

export function useTagDefinitions(organizationId: Id<"organizations">) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts = convexQuery(api.tagDefinitions.list, { organizationId }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useQuery(opts) as { data: any; isLoading: boolean };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tags: (data ?? []) as any[],
    isLoading,
  };
}
