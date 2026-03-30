import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import type { EntityType } from "@cvx/schema";

export function useCategoryDefinitions(
  organizationId: Id<"organizations">,
  entityType: EntityType,
) {
  // @ts-ignore -- TS2589: deep type instantiation in Convex API types
  const queryArgs = convexQuery(api.categoryDefinitions.list, { organizationId, entityType } as any);
  const { data, isLoading } = useQuery(queryArgs) as { data: any[] | undefined; isLoading: boolean };

  return {
    categories: data ?? [],
    isLoading,
  };
}
