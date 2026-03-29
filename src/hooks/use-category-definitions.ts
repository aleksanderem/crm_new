import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import type { EntityType } from "@cvx/schema";

export function useCategoryDefinitions(
  organizationId: Id<"organizations">,
  entityType: EntityType,
) {
  const { data, isLoading } = useQuery(
    convexQuery(api.categoryDefinitions.list, { organizationId, entityType })
  );

  return {
    categories: data ?? [],
    isLoading,
  };
}
