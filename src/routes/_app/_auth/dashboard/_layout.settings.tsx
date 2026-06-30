import { createFileRoute, Outlet, Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { getVisibleModules } from "@/modules/registry";
import { useRole } from "@/hooks/use-permission";
import { cn } from "@/utils/misc";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/settings")({
  component: DashboardSettingsLayout,
});

export default function DashboardSettingsLayout() {
  const { t } = useTranslation();
  const matchRoute = useMatchRoute();
  const { organizationId } = useOrganization();
  const { role, loading: roleLoading } = useRole();
  const isAdmin = role === "owner" || role === "admin";

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen
  const { data: activeProducts } = useQuery(
    convexQuery(api.productSubscriptions.getActiveProducts, { organizationId }),
  );

  const allSettingsNav = getVisibleModules(activeProducts).flatMap((m) => m.settingsNav);
  const settingsNav = allSettingsNav.filter((item) => !item.adminOnly || isAdmin);

  const currentNavItem = allSettingsNav.find((item) => !!matchRoute({ to: item.to }));
  const isAccessDenied = !roleLoading && !!currentNavItem?.adminOnly && !isAdmin;

  return (
    <>
      {/* Mobile settings navigation — horizontal scroll, hidden on lg+ where sidebar handles it */}
      <div className="lg:hidden -mx-4 sm:-mx-6 mb-4 overflow-x-auto border-b">
        <nav className="flex gap-1 px-4 sm:px-6 py-2">
          {settingsNav.map((item) => {
            const isActive = !!matchRoute({ to: item.to });
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-foreground hover:bg-muted-foreground/10",
                )}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </div>
      {isAccessDenied ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium">{t("permissions.noAccess")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("settings.adminOnlyDescription", "This page is only accessible to organization admins and owners.")}
          </p>
        </div>
      ) : (
        <Outlet />
      )}
    </>
  );
}
