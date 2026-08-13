import { Card, CardContent } from "@/components/ui/card";
import { Trophy, ArrowUpRight, ArrowDownRight, Star, Plus, Minus } from "@/lib/ez-icons";

type LoyaltyBalance = {
  balance: number;
  lifetimeEarned?: number;
  lifetimeSpent?: number;
  tier?: string;
} | null | undefined;

type LoyaltyTransaction = {
  _id: string;
  type: "earn" | "spend" | "adjust";
  points: number;
  reason?: string;
  createdAt: number;
};

export function PatientLoyaltyTab({
  loyaltyBalance,
  loyaltyTransactions,
  t,
}: {
  loyaltyBalance: LoyaltyBalance;
  loyaltyTransactions: LoyaltyTransaction[] | undefined;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Trophy className="h-4 w-4 text-yellow-500" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.loyalty.balance")}
                </p>
                <p className="text-2xl font-bold">{loyaltyBalance?.balance ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowUpRight className="h-4 w-4 text-green-500" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.loyalty.totalEarned")}
                </p>
                <p className="text-2xl font-bold">
                  {loyaltyBalance?.lifetimeEarned ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowDownRight className="h-4 w-4 text-red-500" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.loyalty.totalSpent")}
                </p>
                <p className="text-2xl font-bold">
                  {loyaltyBalance?.lifetimeSpent ?? 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loyaltyBalance?.tier && (
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-yellow-500" variant="stroke" />
          <span className="text-sm font-medium">
            {t("gabinet.loyalty.tier")}:{" "}
            {t(`gabinet.loyalty.tiers.${loyaltyBalance.tier}`)}
          </span>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold mb-3">
          {t("gabinet.loyalty.transactionHistory")}
        </h4>
        {!loyaltyTransactions || loyaltyTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Star className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t("gabinet.loyalty.noTransactions")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...loyaltyTransactions]
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 20)
              .map((tx) => (
                <div
                  key={tx._id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      tx.type === "earn"
                        ? "bg-green-100 text-green-600"
                        : tx.type === "spend"
                          ? "bg-red-100 text-red-600"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {tx.type === "earn" ? (
                      <Plus className="h-4 w-4" variant="stroke" />
                    ) : tx.type === "spend" ? (
                      <Minus className="h-4 w-4" variant="stroke" />
                    ) : (
                      <Star className="h-4 w-4" variant="stroke" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{tx.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      tx.type === "earn"
                        ? "text-green-600"
                        : tx.type === "spend"
                          ? "text-red-600"
                          : "text-muted-foreground"
                    }`}
                  >
                    {tx.type === "earn" ? "+" : tx.type === "spend" ? "−" : ""}
                    {tx.points}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
