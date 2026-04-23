import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";

export function useTagDefinitions(organizationId: Id<"organizations">) {
  const listTags = useAction(api.tagDefinitions.list);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useQuery({
    queryKey: ["tagDefinitions.list", organizationId],
    queryFn: () => listTags({ organizationId }),
    enabled: !!organizationId,
  }) as { data: any; isLoading: boolean };

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tags: (data ?? []) as any[],
    isLoading,
  };
}
