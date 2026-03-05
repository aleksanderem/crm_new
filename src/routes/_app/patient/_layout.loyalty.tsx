import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/patient/_layout/loyalty")({
  component: PatientLoyalty,
});

function PatientLoyalty() {
  const { t } = useTranslation();
  const tokenHash = typeof window !== "undefined" ? localStorage.getItem("patientPortalToken") ?? "" : "";

  const { data: balance } = useQuery(
    convexQuery(api.gabinet.patientPortal.getMyLoyaltyBalance, { tokenHash })
  );

  const { data: transactions } = useQuery(
    convexQuery(api.gabinet.patientPortal.getMyLoyaltyTransactions, { tokenHash })
  );

  const tierColor = (tier?: string) => {
    switch (tier) {
      case "gold": return "default" as const;
      case "platinum": return "default" as const;
      case "silver": return "secondary" as const;
      default: return "outline" as const;
    }
  };

  const txItems = transactions ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("patientPortal.loyalty.title")}</h1>

      {/* Balance card */}
      <div className="rounded-lg border p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("patientPortal.loyalty.currentBalance")}</p>
            <p className="text-3xl font-bold">{balance?.balance ?? 0}</p>
          </div>
          {balance?.tier && (
            <Badge variant={tierColor(balance.tier)} className="capitalize text-sm px-3 py-1">
              {balance.tier}
            </Badge>
          )}
        </div>
        {balance && (
          <div className="mt-4 flex gap-6 text-xs text-muted-foreground">
            <span>{t("patientPortal.loyalty.earned")}: {balance.lifetimeEarned}</span>
            <span>{t("patientPortal.loyalty.spent")}: {balance.lifetimeSpent}</span>
          </div>
        )}
      </div>

      {/* Transaction history */}
      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{t("patientPortal.loyalty.history")}</h3>
        </div>
        {txItems.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t("patientPortal.loyalty.noTransactions")}
          </div>
        ) : (
          <div className="divide-y">
            {txItems.map((tx) => (
              <div key={tx._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{tx.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-sm font-medium ${tx.type === "earn" ? "text-green-600" : "text-red-500"}`}>
                  {tx.type === "earn" ? "+" : "-"}{tx.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
