import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useTranslation } from "react-i18next";
import { Clock } from "@/lib/ez-icons";

interface RecentItemsProps {
  organizationId: string;
  entityType: string;
  linkPrefix: string;
}

export function RecentItems({ organizationId, entityType, linkPrefix }: RecentItemsProps) {
  const { t } = useTranslation();
  const items = useQuery(api.recentlyViewed.list, {
    organizationId: organizationId as any,
    entityType,
    limit: 3,
  });

  if (!items?.length) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[9px] font-medium uppercase tracking-wider">
        {t("sidebar.recentItems")}
      </span>
      {items.map((item) => (
        <a
          key={item.entityId}
          href={`${linkPrefix}${item.entityId}`}
          className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-0.5 transition-colors"
        >
          <Clock className="text-muted-foreground h-3 w-3 shrink-0" variant="stroke" />
          <span className="text-foreground min-w-0 truncate text-[10px]">{item.entityLabel}</span>
        </a>
      ))}
    </div>
  );
}
