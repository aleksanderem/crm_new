import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
} from "@tanstack/react-router";
import { cn } from "@/utils/misc";
import { buttonVariants } from "@/ui/button-util";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/settings")({
  component: DashboardSettingsLayout,
});

const settingsNav = [
  { label: "General", to: "/dashboard/settings" },
  { label: "Billing", to: "/dashboard/settings/billing" },
  { label: "Pipelines", to: "/dashboard/settings/pipelines" },
  { label: "Custom Fields", to: "/dashboard/settings/custom-fields" },
  { label: "Team", to: "/dashboard/settings/team" },
];

export default function DashboardSettingsLayout() {
  const matchRoute = useMatchRoute();

  return (
    <div className="flex h-full w-full gap-8">
      <div className="hidden w-full max-w-48 flex-col gap-0.5 lg:flex">
        {settingsNav.map((item) => {
          const isActive = matchRoute({ to: item.to });
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                `${buttonVariants({ variant: "ghost" })} ${isActive && "bg-primary/5"}`,
                "justify-start rounded-md"
              )}
            >
              <span
                className={cn(
                  "text-sm text-primary/80",
                  isActive && "font-medium text-primary"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
