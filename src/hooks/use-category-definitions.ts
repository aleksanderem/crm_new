import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import type { EntityType } from "@cvx/schema";

export function useCategoryDefinitions(
  organizationId: Id<"organizations">,
  entityType: EntityType,
) {
  const listCategories = useAction(api.categoryDefinitions.list);
  const { data, isLoading } = useQuery({
    queryKey: ["categoryDefinitions.list", organizationId, entityType],
    queryFn: () => listCategories({ organizationId, entityType } as any),
    enabled: !!organizationId,
  }) as { data: any[] | undefined; isLoading: boolean };

  return {
    categories: data ?? [],
    isLoading,
  };
}
