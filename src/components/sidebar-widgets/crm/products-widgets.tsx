import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { KpiRow } from "../kpi-row";
import { NudgeCard } from "../nudge-card";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const PRODUCT_COLORS = [
  { bg: "bg-primary/10", text: "text-primary", indicator: "**:data-[slot=progress-indicator]:bg-primary", track: "**:data-[slot=progress-track]:bg-primary/10" },
  { bg: "bg-sky-400/10", text: "text-sky-400", indicator: "**:data-[slot=progress-indicator]:bg-sky-400", track: "**:data-[slot=progress-track]:bg-sky-400/10" },
  { bg: "bg-emerald-500/10", text: "text-emerald-500", indicator: "**:data-[slot=progress-indicator]:bg-emerald-500", track: "**:data-[slot=progress-track]:bg-emerald-500/10" },
  { bg: "bg-amber-500/10", text: "text-amber-500", indicator: "**:data-[slot=progress-indicator]:bg-amber-500", track: "**:data-[slot=progress-track]:bg-amber-500/10" },
  { bg: "bg-rose-500/10", text: "text-rose-500", indicator: "**:data-[slot=progress-indicator]:bg-rose-500", track: "**:data-[slot=progress-track]:bg-rose-500/10" },
];

export function ProductsWidgets({ organizationId }: { organizationId: Id<"organizations"> }) {
  const { t } = useTranslation();
  const kpis = useQuery(api.sidebarWidgets.getProductsKpis, { organizationId });
  const nudges = useQuery(api.nudges.getProductsNudges, { organizationId });
  const topProducts = useQuery(api.sidebarWidgets.getTopProducts, { organizationId });

  if (!kpis) return null;

  const maxValue = topProducts && topProducts.length > 0
    ? Math.max(...topProducts.map((p) => p.value))
    : 1;

  return (
    <>
      <KpiRow
        size="hero"
        items={[
          { label: t("sidebar.total"), value: kpis.total },
          { label: t("sidebar.inDeals"), value: kpis.inDeals },
        ]}
      />

      {topProducts && topProducts.length > 0 && (
        <Card className="overflow-hidden gap-0 border-0 bg-blue-500 py-4 shadow-none">
          <CardHeader className="px-4">
            <span className="text-base font-medium text-white">
              {t("sidebar.bestSellingProducts", "Najlepsze produkty")}
            </span>
          </CardHeader>
          <CardContent className="px-4">
            <div className="mt-2 flex justify-center">
              <img
                src="/images/best-selling-bg.png"
                alt=""
                className="w-full"
              />
            </div>
            <div className="bg-card flex flex-col gap-5 rounded-xl p-4">
              {topProducts.map((product, i) => {
                const color = PRODUCT_COLORS[i % PRODUCT_COLORS.length];
                const pct = Math.round((product.value / maxValue) * 100);
                return (
                  <div key={product.label}>
                    <div className="mb-3 flex justify-between">
                      <div className="min-w-0">
                        <h6 className="text-base font-medium">{product.label}</h6>
                        <p className="text-muted-foreground text-sm">
                          {product.value} {product.value === 1 ? "deal" : "deali"}
                        </p>
                      </div>
                      <Badge className={cn("ml-2 shrink-0 text-sm h-auto", color.bg, color.text)}>
                        {pct}%
                      </Badge>
                    </div>
                    <Progress
                      value={pct}
                      className={cn(
                        "w-full [&>div]:h-1.5",
                        color.indicator,
                        color.track,
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {nudges?.map((n, index) => (
        <NudgeCard
          key={`${n.message}-${index}`}
          message={n.message}
          messageValues={n.messageValues}
          severity={n.severity}
          icon={n.icon}
        />
      ))}
    </>
  );
}
