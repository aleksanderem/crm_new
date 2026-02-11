import { Users, Building2, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

interface KpiCardsProps {
  totalContacts: number;
  totalCompanies: number;
  openDeals: number;
  pipelineValue: number;
  winRate: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function KpiCards({
  totalContacts,
  totalCompanies,
  openDeals,
  pipelineValue,
  winRate,
}: KpiCardsProps) {
  const { t } = useTranslation();

  const cards = useMemo(
    () => [
      {
        title: t("dashboard.totalContacts"),
        value: totalContacts.toLocaleString(),
        icon: Users,
      },
      {
        title: t("dashboard.companies"),
        value: totalCompanies.toLocaleString(),
        icon: Building2,
      },
      {
        title: t("dashboard.openDeals"),
        value: openDeals.toLocaleString(),
        icon: TrendingUp,
        subtitle: t("dashboard.winRate", { rate: (winRate * 100).toFixed(0) }),
      },
      {
        title: t("dashboard.pipelineValue"),
        value: formatCurrency(pipelineValue),
        icon: DollarSign,
      },
    ],
    [t, totalContacts, totalCompanies, openDeals, pipelineValue, winRate]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            {card.subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">
                {card.subtitle}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
