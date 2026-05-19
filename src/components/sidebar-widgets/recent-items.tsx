import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Clock } from "@/lib/ez-icons";

interface RecentItem {
  entityId: string;
  entityLabel: string;
  viewedAt: number;
}

interface RecentItemsProps {
  organizationId: Id<"organizations">;
  entityType: string;
  linkPrefix: string;
}

export function RecentItems({ organizationId, entityType, linkPrefix }: RecentItemsProps) {
  const { t } = useTranslation();
  const listRecentlyViewed = useAction(api.recentlyViewed.list);
  const { data: items } = useQuery({
    queryKey: ["recentlyViewed.list", organizationId, entityType],
    queryFn: () =>
      listRecentlyViewed({
        organizationId,
        entityType,
        limit: 3,
      }) as unknown as Promise<RecentItem[]>,
  });

  if (!items?.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[9px] font-semibold uppercase tracking-wider">
        {t("sidebar.recentItems")}
      </span>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <a
            key={item.entityId}
            href={`${linkPrefix}${item.entityId}`}
            className="hover:bg-muted/50 group flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors"
          >
            <span className="bg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded">
              <Clock className="text-muted-foreground h-3 w-3 transition-colors group-hover:text-foreground" variant="stroke" />
            </span>
            <span className="text-foreground group-hover:text-primary min-w-0 truncate text-[10px] font-medium transition-colors">
              {item.entityLabel}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
