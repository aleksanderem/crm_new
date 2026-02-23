import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  Users,
  Building2,
  TrendingUp,
  FileText,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  CalendarCheck,
  Mail,
  BarChart3,
  Package,
  Phone,
  Heart,
  Stethoscope,
  Calendar,
  Gift,
  ClipboardList,
  LayoutDashboard,
  UserCog,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCheck,
  TreePalm,
  PieChart,
} from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

const crmItems: NavItem[] = [
  { label: "nav.deals", href: "/dashboard/leads", icon: TrendingUp },
  { label: "nav.activities", href: "/dashboard/activities", icon: CalendarCheck },
  { label: "nav.inbox", href: "/dashboard/inbox", icon: Mail },
  { label: "nav.documents", href: "/dashboard/documents", icon: FileText },
  { label: "nav.contacts", href: "/dashboard/contacts", icon: Users },
  { label: "nav.companies", href: "/dashboard/companies", icon: Building2 },
  { label: "nav.insights", href: "/dashboard", icon: BarChart3 },
  { label: "nav.products", href: "/dashboard/products", icon: Package },
  { label: "nav.calls", href: "/dashboard/calls", icon: Phone },
];

const gabinetSection: NavSection = {
  label: "nav.gabinet.dashboard",
  icon: Stethoscope,
  items: [
    { label: "nav.gabinet.dashboard", href: "/dashboard/gabinet", icon: LayoutDashboard },
    { label: "nav.gabinet.patients", href: "/dashboard/gabinet/patients", icon: Heart },
    { label: "nav.gabinet.treatments", href: "/dashboard/gabinet/treatments", icon: Stethoscope },
    { label: "nav.gabinet.calendar", href: "/dashboard/gabinet/calendar", icon: Calendar },
    { label: "nav.gabinet.packages", href: "/dashboard/gabinet/packages", icon: Gift },
    { label: "nav.gabinet.documents", href: "/dashboard/gabinet/documents", icon: ClipboardList },
    { label: "nav.gabinet.employees", href: "/dashboard/gabinet/employees", icon: UserCog },
    { label: "nav.gabinet.reports", href: "/dashboard/gabinet/reports", icon: PieChart },
    { label: "nav.gabinet.scheduling", href: "/dashboard/gabinet/settings/scheduling", icon: Clock },
    { label: "nav.gabinet.leaves", href: "/dashboard/gabinet/settings/leaves", icon: TreePalm },
    { label: "nav.gabinet.documentTemplates", href: "/dashboard/gabinet/settings/document-templates", icon: FileCheck },
  ],
};

interface SidebarProps {
  orgName?: string;
  todayActivitiesCount?: number;
  openDealsCount?: number;
}

export function Sidebar({
  orgName,
  todayActivitiesCount = 0,
  openDealsCount = 0,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [gabinetOpen, setGabinetOpen] = useState(true);
  const matchRoute = useMatchRoute();
  const { t } = useTranslation();

  const isGabinetActive = matchRoute({ to: "/dashboard/gabinet", fuzzy: true });

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-card transition-all duration-200",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-3">
        {!collapsed && (
          <span className="truncate text-sm font-semibold">
            {orgName || "CRM"}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-1 px-2">
          {/* CRM Items */}
          {crmItems.map((item) => {
            const isActive = matchRoute({ to: item.href, fuzzy: true });
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted/50 text-foreground"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(item.label)}</span>}
              </Link>
            );
          })}

          {/* Gabinet Collapsible Section */}
          {collapsed ? (
            <Link
              to="/dashboard/gabinet"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isGabinetActive
                  ? "bg-muted/50 text-foreground"
                  : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              )}
            >
              <gabinetSection.icon className="h-4 w-4 shrink-0" />
            </Link>
          ) : (
            <>
              <button
                onClick={() => setGabinetOpen(!gabinetOpen)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isGabinetActive
                    ? "bg-muted/50 text-foreground"
                    : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                )}
              >
                <gabinetSection.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">
                  {t(gabinetSection.label)}
                </span>
                {gabinetOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
              </button>
              {gabinetOpen && (
                <div className="ml-3 flex flex-col gap-0.5 border-l pl-2">
                  {gabinetSection.items.map((item) => {
                    const isActive = matchRoute({ to: item.href, fuzzy: true });
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-muted/50 text-foreground font-medium"
                            : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{t(item.label)}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Settings */}
          <Link
            to="/dashboard/settings"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              matchRoute({ to: "/dashboard/settings", fuzzy: true })
                ? "bg-muted/50 text-foreground"
                : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{t("nav.settings")}</span>}
          </Link>
        </nav>
      </ScrollArea>

      {/* Footer indicators */}
      {!collapsed && (
        <div className="border-t px-3 py-3 space-y-1.5">
          <Link
            to="/dashboard/activities"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            {t('sidebar.todayActivities', { count: todayActivitiesCount })}
          </Link>
          <Link
            to="/dashboard/leads"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            {t('sidebar.openDeals', { count: openDealsCount })}
          </Link>
        </div>
      )}
    </aside>
  );
}
