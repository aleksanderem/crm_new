import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";
import { Trophy } from "lucide-react";
import type { TimeRange } from "@/components/crm/types";

interface Performer {
  name: string;
  deals: number;
  value: number;
}

interface TopPerformersProps {
  performers: Performer[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

const TIME_RANGE_OPTIONS: TimeRange[] = [
  "last7days",
  "last30days",
  "thisMonth",
  "last3months",
  "all",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function TopPerformers({
  performers,
  timeRange,
  onTimeRangeChange,
}: TopPerformersProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">
            {t("dashboard.topPerformers")}
          </CardTitle>
        </div>
        <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
          className="h-7 rounded-md border bg-transparent px-2 text-xs text-muted-foreground"
        >
          {TIME_RANGE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {t(`timeRange.${opt}`)}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        {performers.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t("dashboard.noPerformers")}
          </p>
        ) : (
          <div className="space-y-3">
            {performers.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="text-sm font-bold text-muted-foreground w-5 text-right">
                  {i + 1}
                </span>
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {p.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.deals} {t("dashboard.dealsCount")} &middot;{" "}
                    {formatCurrency(p.value)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
