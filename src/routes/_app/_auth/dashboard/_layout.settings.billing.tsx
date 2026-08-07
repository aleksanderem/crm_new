import { useState } from "react";
import { Switch } from "@/ui/switch";
import { Button } from "@/ui/button";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "~/convex/_generated/api";
import { convexQuery, useConvexAction } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cn, getLocaleCurrency } from "@/utils/misc";
import { CURRENCIES, PLANS, PRODUCT_KEYS } from "@cvx/schema";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { useTranslation } from "react-i18next";
import { useOrganization } from "@/components/org-context";
import { z } from "zod";

const PRODUCT_KEY_ENUM = ["crm", "gabinet", "magazyn"] as ["crm", "gabinet", "magazyn"];
type BillingProductKey = (typeof PRODUCT_KEY_ENUM)[number];

const MODULE_LABELS: Record<BillingProductKey, string> = {
  crm: "CRM",
  gabinet: "Gabinet",
  magazyn: "Magazyn",
};

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/billing",
)({
  component: BillingSettings,
  validateSearch: z.object({
    productKey: z.enum(PRODUCT_KEY_ENUM).optional(),
  }),
  beforeLoad: async ({ context, search }) => {
    const productKey = search.productKey ?? PRODUCT_KEYS.CRM;
    await context.queryClient.ensureQueryData(
      convexQuery(api.app.getActivePlans, { productKey }),
    );
    return {
      title: "Billing",
      headerTitle: "Billing",
      headerDescription: "Manage billing and your subscription plan.",
    };
  },
});

export default function BillingSettings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const { productKey: selectedModule = PRODUCT_KEYS.CRM } = Route.useSearch();

  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const { data: plans } = useQuery(
    convexQuery(api.app.getActivePlans, { productKey: selectedModule }),
  );

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const { data: activeProducts } = useQuery(
    convexQuery(api.productSubscriptions.getActiveProducts, { organizationId }),
  );

  const [selectedPlanId, setSelectedPlanId] = useState(
    user?.subscription?.planId,
  );

  const [selectedPlanInterval, setSelectedPlanInterval] = useState<
    "month" | "year"
  >(
    user?.subscription?.planKey !== PLANS.FREE
      ? user?.subscription?.interval || "month"
      : "month",
  );

  const { mutateAsync: createSubscriptionCheckout } = useMutation({
    mutationFn: useConvexAction(api.stripe.createSubscriptionCheckout),
  });
  const { mutateAsync: createCustomerPortal } = useMutation({
    mutationFn: useConvexAction(api.stripe.createCustomerPortal),
  });

  const currency = getLocaleCurrency();

  const handleCreateSubscriptionCheckout = async () => {
    if (!user || !selectedPlanId) {
      return;
    }
    const checkoutUrl = await createSubscriptionCheckout({
      userId: user._id,
      organizationId,
      planId: selectedPlanId,
      planInterval: selectedPlanInterval,
      currency,
    });
    if (!checkoutUrl) {
      return;
    }
    window.location.href = checkoutUrl;
  };
  const handleCreateCustomerPortal = async () => {
    if (!user?.customerId) {
      return;
    }
    const customerPortalUrl = await createCustomerPortal({
      userId: user._id,
    });
    if (!customerPortalUrl) {
      return;
    }
    window.location.href = customerPortalUrl;
  };

  const visibleModules = PRODUCT_KEY_ENUM.filter(
    (key) => !activeProducts || activeProducts.includes(key),
  );

  if (!user || !plans) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground text-center">
          {!user ? "Ładowanie..." : "Plan cenowy nie został jeszcze skonfigurowany."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("billing.title", "Billing")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>{t("billing.description", "Manage billing and your subscription plan.")}</UntitledAlert>
      </SectionHeader.Root>

      {/* Module selector — shown when multiple modules are active */}
      {visibleModules.length > 1 && (
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 w-fit">
          {visibleModules.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() =>
                navigate({
                  to: "/dashboard/settings/billing",
                  search: { productKey: key },
                })
              }
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                selectedModule === key
                  ? "bg-primary/10 text-primary"
                  : "text-primary/60 hover:text-primary",
              )}
            >
              {MODULE_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {/* Plans */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-xl font-medium text-primary">{t("billing.plan", "Plan")}</h2>
          <p className="flex items-start gap-1 text-sm font-normal text-primary/60">
            {t("billing.currentPlanPrefix", "You are currently on the")}{" "}
            <span className="flex h-[18px] items-center rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary/80">
              {user.subscription
                ? user.subscription.planKey.charAt(0).toUpperCase() +
                  user.subscription.planKey.slice(1)
                : t("billing.freePlan", "Free")}
            </span>
            {t("billing.currentPlanSuffix", "plan.")}
          </p>
        </div>

        {user.subscription?.planId === plans.free._id && (
          <div className="flex w-full flex-col items-center justify-evenly gap-2 border-border p-6 pt-0">
            {Object.values(plans).map((plan) => (
              <div
                key={plan._id}
                tabIndex={0}
                role="button"
                className={`flex w-full select-none items-center rounded-md border border-border hover:border-primary/60 ${
                  selectedPlanId === plan._id && "border-primary/60"
                }`}
                onClick={() => setSelectedPlanId(plan._id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelectedPlanId(plan._id);
                }}
              >
                <div className="flex w-full flex-col items-start p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium text-primary">
                      {plan.name}
                    </span>
                    {plan._id !== plans.free._id && (
                      <span className="flex items-center rounded-md bg-primary/10 px-1.5 text-sm font-medium text-primary/80">
                        {currency === CURRENCIES.USD ? "$" : currency === CURRENCIES.PLN ? "zł" : "€"}{" "}
                        {selectedPlanInterval === "month"
                          ? plan.prices.month[currency].amount / 100
                          : plan.prices.year[currency].amount / 100}{" "}
                        / {selectedPlanInterval === "month" ? "month" : "year"}
                      </span>
                    )}
                  </div>
                  <p className="text-start text-sm font-normal text-primary/60">
                    {plan.description}
                  </p>
                </div>

                {/* Billing Switch */}
                {plan._id !== plans.free._id && (
                  <div className="flex items-center gap-2 px-4">
                    <label
                      htmlFor="interval-switch"
                      className="text-start text-sm text-primary/60"
                    >
                      {selectedPlanInterval === "month" ? t("billing.monthly", "Monthly") : t("billing.yearly", "Yearly")}
                    </label>
                    <Switch
                      id="interval-switch"
                      checked={selectedPlanInterval === "year"}
                      onCheckedChange={() =>
                        setSelectedPlanInterval((prev) =>
                          prev === "month" ? "year" : "month",
                        )
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {user.subscription && user.subscription.planId !== plans.free._id && (
          <div className="flex w-full flex-col items-center justify-evenly gap-2 border-border p-6 pt-0">
            {user.subscription.status === "trialing" && (
              <div className="flex w-full items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-950/30">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  {t("billing.trialBanner", "You are on a free trial.")}{" "}
                  {t("billing.trialEnds", "Trial ends")}:{" "}
                  <span className="font-medium">
                    {new Date(user.subscription.currentPeriodEnd * 1000).toLocaleDateString()}
                  </span>
                  .
                </p>
              </div>
            )}
            <div className="flex w-full items-center overflow-hidden rounded-md border border-primary/60">
              <div className="flex w-full flex-col items-start p-4">
                <div className="flex items-end gap-2">
                  <span className="text-base font-medium text-primary">
                    {user.subscription.planKey.charAt(0).toUpperCase() +
                      user.subscription.planKey.slice(1)}
                  </span>
                  {user.subscription.status === "trialing" ? (
                    <span className="flex h-[18px] items-center rounded-md bg-blue-100 px-1.5 text-sm font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {t("billing.trial", "Trial")}
                    </span>
                  ) : (
                    <p className="flex items-start gap-1 text-sm font-normal text-primary/60">
                      {user.subscription.cancelAtPeriodEnd === true ? (
                        <span className="flex h-[18px] items-center text-sm font-medium text-red-500">
                          {t("billing.expires", "Expires")}
                        </span>
                      ) : (
                        <span className="flex h-[18px] items-center text-sm font-medium text-green-500">
                          {t("billing.renews", "Renews")}
                        </span>
                      )}
                      on:{" "}
                      {new Date(
                        user.subscription.currentPeriodEnd * 1000,
                      ).toLocaleDateString("en-US")}
                      .
                    </p>
                  )}
                </div>
                <p className="text-start text-sm font-normal text-primary/60">
                  {plans.pro.description}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-t border-border bg-secondary px-6 py-3 dark:bg-card">
          <p className="text-sm font-normal text-primary/60">
            {t("billing.testDisclaimer", "You will not be charged for testing the subscription upgrade.")}
          </p>
          {user.subscription?.planId === plans.free._id && (
            <Button
              type="submit"
              size="sm"
              onClick={handleCreateSubscriptionCheckout}
              disabled={selectedPlanId === plans.free._id}
            >
              {t("billing.upgradeToPro", "Upgrade to PRO")}
            </Button>
          )}
        </div>
      </div>

      {/* Manage Subscription */}
      <div className="flex w-full flex-col items-start rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-xl font-medium text-primary">
            {t("billing.manageSubscription", "Manage Subscription")}
          </h2>
          <p className="flex items-start gap-1 text-sm font-normal text-primary/60">
            {t("billing.manageSubscriptionDescription", "Update your payment method, billing address, and more.")}
          </p>
        </div>

        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-t border-border bg-secondary px-6 py-3 dark:bg-card">
          <p className="text-sm font-normal text-primary/60">
            {t("billing.stripeRedirect", "You will be redirected to the Stripe Customer Portal.")}
          </p>
          <Button
            type="submit"
            size="sm"
            onClick={handleCreateCustomerPortal}
            disabled={!user?.customerId}
          >
            {t("billing.manage", "Manage")}
          </Button>
        </div>
      </div>
    </div>
  );
}
