import { Users, Building2, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KpiCardsProps {
  totalContacts: number;
  totalCompanies: number;
  openDeals: number;
  pipelineValue: number;
  winRate: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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
  const cards = [
    {
      title: "Total Contacts",
      value: totalContacts.toLocaleString(),
      icon: Users,
    },
    {
      title: "Companies",
      value: totalCompanies.toLocaleString(),
      icon: Building2,
    },
    {
      title: "Open Deals",
      value: openDeals.toLocaleString(),
      icon: TrendingUp,
    },
    {
      title: "Pipeline Value",
      value: formatCurrency(pipelineValue),
      icon: DollarSign,
    },
  ];

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
            {card.title === "Open Deals" && (
              <p className="mt-1 text-xs text-muted-foreground">
                {winRate.toFixed(0)}% win rate
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
