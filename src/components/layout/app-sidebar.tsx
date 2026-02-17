import { Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  Calendar,
  CheckCircle,
  Clock,
  ClipboardList,
  Download,
  FileText,
  Filter,
  Gift,
  Heart,
  Kanban,
  LayoutDashboard,
  Mail,
  Package,
  Phone,
  PieChart,
  PlusCircle,
  Power,
  RefreshCw,
  Send,
  Settings,
  Stethoscope,
  TrendingUp,
  Trophy,
  Upload,
  UserCog,
  UserPlus,
  Users,
  X,
} from "@/lib/ez-icons";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSidebarActions } from "@/components/layout/sidebar-context";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { cn } from "@/utils/misc";
import Logo from "@/assets/svg/logo";

type Workspace = "crm" | "gabinet";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
}

interface ContextAction {
  label: string;
  icon: React.ElementType;
  quickCreate?: string;
  href?: string;
}

interface PageContext {
  titleKey: string;
  actions: ContextAction[];
}

const crmNav: NavItem[] = [
  { label: "nav.insights", href: "/dashboard", icon: BarChart3 },
  { label: "nav.deals", href: "/dashboard/leads", icon: TrendingUp },
  { label: "nav.activities", href: "/dashboard/activities", icon: CalendarCheck },
  { label: "nav.calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "nav.inbox", href: "/dashboard/inbox", icon: Mail },
  { label: "nav.contacts", href: "/dashboard/contacts", icon: Users },
  { label: "nav.companies", href: "/dashboard/companies", icon: Building2 },
  { label: "nav.products", href: "/dashboard/products", icon: Package },
  { label: "nav.documents", href: "/dashboard/documents", icon: FileText },
  { label: "nav.calls", href: "/dashboard/calls", icon: Phone },
  { label: "nav.settings", href: "/dashboard/settings", icon: Settings },
];

const gabinetNav: NavItem[] = [
  { label: "nav.gabinet.dashboard", href: "/dashboard/gabinet", icon: LayoutDashboard },
  { label: "nav.gabinet.calendar", href: "/dashboard/gabinet/calendar", icon: Calendar },
  { label: "nav.gabinet.patients", href: "/dashboard/gabinet/patients", icon: Heart },
  { label: "nav.gabinet.treatments", href: "/dashboard/gabinet/treatments", icon: Stethoscope },
  { label: "nav.gabinet.packages", href: "/dashboard/gabinet/packages", icon: Gift },
  { label: "nav.gabinet.employees", href: "/dashboard/gabinet/employees", icon: UserCog },
  { label: "nav.gabinet.documents", href: "/dashboard/gabinet/documents", icon: ClipboardList },
  { label: "nav.gabinet.reports", href: "/dashboard/gabinet/reports", icon: PieChart },
];

// Contextual actions per entity route — designed around what users actually do on each page
const pageContexts: Record<string, PageContext> = {
  contacts: {
    titleKey: "nav.contacts",
    actions: [
      { label: "nav.actions.addContact", icon: UserPlus, quickCreate: "contact" },
      { label: "nav.actions.importCsv", icon: Upload, href: "/dashboard/contacts" },
      { label: "nav.actions.exportCsv", icon: Download, href: "/dashboard/contacts" },
      { label: "nav.actions.addDeal", icon: TrendingUp, quickCreate: "lead" },
      { label: "nav.actions.addActivity", icon: CalendarCheck, quickCreate: "activity" },
    ],
  },
  companies: {
    titleKey: "nav.companies",
    actions: [
      { label: "nav.actions.addCompany", icon: PlusCircle, quickCreate: "company" },
      { label: "nav.actions.importCsv", icon: Upload, href: "/dashboard/companies" },
      { label: "nav.actions.exportCsv", icon: Download, href: "/dashboard/companies" },
      { label: "nav.actions.addContact", icon: UserPlus, quickCreate: "contact" },
      { label: "nav.actions.addDeal", icon: TrendingUp, quickCreate: "lead" },
    ],
  },
  leads: {
    titleKey: "nav.deals",
    actions: [
      { label: "nav.actions.addDeal", icon: PlusCircle, quickCreate: "lead" },
      { label: "nav.actions.viewKanban", icon: Kanban, href: "/dashboard/pipelines" },
      { label: "nav.actions.importCsv", icon: Upload, href: "/dashboard/leads" },
      { label: "nav.actions.exportCsv", icon: Download, href: "/dashboard/leads" },
      { label: "nav.actions.markWon", icon: Trophy, href: "/dashboard/leads" },
      { label: "nav.actions.markLost", icon: X, href: "/dashboard/leads" },
    ],
  },
  products: {
    titleKey: "nav.products",
    actions: [
      { label: "nav.actions.addProduct", icon: PlusCircle, quickCreate: "document" },
      { label: "nav.actions.importCsv", icon: Upload, href: "/dashboard/products" },
      { label: "nav.actions.exportCsv", icon: Download, href: "/dashboard/products" },
      { label: "nav.actions.activate", icon: Power, href: "/dashboard/products" },
    ],
  },
  documents: {
    titleKey: "nav.documents",
    actions: [
      { label: "nav.actions.uploadDocument", icon: Upload, quickCreate: "document" },
      { label: "nav.actions.exportCsv", icon: Download, href: "/dashboard/documents" },
      { label: "nav.actions.changeStatus", icon: RefreshCw, href: "/dashboard/documents" },
      { label: "nav.actions.addDeal", icon: TrendingUp, quickCreate: "lead" },
    ],
  },
  activities: {
    titleKey: "nav.activities",
    actions: [
      { label: "nav.actions.addActivity", icon: PlusCircle, quickCreate: "activity" },
      { label: "nav.actions.markComplete", icon: CheckCircle, href: "/dashboard/activities" },
      { label: "nav.actions.dueToday", icon: Clock, href: "/dashboard/activities" },
      { label: "nav.actions.overdue", icon: Filter, href: "/dashboard/activities" },
    ],
  },
  calls: {
    titleKey: "nav.calls",
    actions: [
      { label: "nav.actions.logCall", icon: Phone, quickCreate: "call" },
      { label: "nav.actions.addContact", icon: UserPlus, quickCreate: "contact" },
      { label: "nav.actions.addActivity", icon: CalendarCheck, quickCreate: "activity" },
    ],
  },
  inbox: {
    titleKey: "nav.inbox",
    actions: [
      { label: "nav.actions.composeEmail", icon: Send, href: "/dashboard/inbox" },
      { label: "nav.actions.viewUnread", icon: Mail, href: "/dashboard/inbox" },
      { label: "nav.actions.syncGmail", icon: RefreshCw, href: "/dashboard/settings/email" },
      { label: "nav.actions.addContact", icon: UserPlus, quickCreate: "contact" },
    ],
  },
};

const gabinetPageContexts: Record<string, PageContext> = {
  calendar: {
    titleKey: "nav.gabinet.calendar",
    actions: [
      { label: "nav.actions.bookAppointment", icon: CalendarCheck, quickCreate: "appointment" },
      { label: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
    ],
  },
  patients: {
    titleKey: "nav.gabinet.patients",
    actions: [
      { label: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
      { label: "nav.actions.bookAppointment", icon: CalendarCheck, quickCreate: "appointment" },
      { label: "nav.actions.importCsv", icon: Upload, href: "/dashboard/gabinet/patients" },
      { label: "nav.actions.exportCsv", icon: Download, href: "/dashboard/gabinet/patients" },
    ],
  },
  treatments: {
    titleKey: "nav.gabinet.treatments",
    actions: [
      { label: "nav.actions.addTreatment", icon: PlusCircle, quickCreate: "treatment" },
    ],
  },
  packages: {
    titleKey: "nav.gabinet.packages",
    actions: [
      { label: "nav.actions.addPackage", icon: PlusCircle, quickCreate: "package" },
    ],
  },
  employees: {
    titleKey: "nav.gabinet.employees",
    actions: [
      { label: "nav.actions.addEmployee", icon: UserPlus, quickCreate: "employee" },
    ],
  },
  documents: {
    titleKey: "nav.gabinet.documents",
    actions: [
      { label: "nav.actions.addDocument", icon: PlusCircle, quickCreate: "gabinetDocument" },
    ],
  },
};

const gabinetRouteKeys = ["calendar", "patients", "treatments", "packages", "employees", "documents"];

const entityRouteKeys = ["contacts", "companies", "leads", "products", "documents", "activities", "calls", "inbox"];

interface SettingsNavItem {
  labelKey: string;
  to: string;
  section?: string;
}

const settingsNav: SettingsNavItem[] = [
  { labelKey: "settings.general", to: "/dashboard/settings" },
  { labelKey: "settings.profile", to: "/dashboard/settings/profile" },
  { labelKey: "settings.billing", to: "/dashboard/settings/billing" },
  { labelKey: "settings.pipelines", to: "/dashboard/settings/pipelines" },
  { labelKey: "settings.customFields", to: "/dashboard/settings/custom-fields" },
  { labelKey: "settings.activityTypes", to: "/dashboard/settings/activity-types" },
  { labelKey: "settingsNav.lostReasons", to: "/dashboard/settings/lost-reasons" },
  { labelKey: "settingsNav.sources", to: "/dashboard/settings/sources" },
  { labelKey: "settings.team", to: "/dashboard/settings/team" },
  { labelKey: "settings.permissions", to: "/dashboard/settings/permissions" },
  { labelKey: "settings.auditLog", to: "/dashboard/settings/audit-log" },
  { labelKey: "settings.email", to: "/dashboard/settings/email" },
  { labelKey: "settings.integrations", to: "/dashboard/settings/integrations" },
  { labelKey: "settings.organization", to: "/dashboard/settings/organization" },
  { labelKey: "gabinet.scheduling.title", to: "/dashboard/gabinet/settings/scheduling", section: "settings.gabinetSection" },
  { labelKey: "gabinet.leaveTypes.title", to: "/dashboard/gabinet/settings/leave-types" },
  { labelKey: "gabinet.leaveBalances.title", to: "/dashboard/gabinet/settings/leave-balances" },
  { labelKey: "gabinet.leaves.title", to: "/dashboard/gabinet/settings/leaves" },
  { labelKey: "gabinet.documentTemplates.title", to: "/dashboard/gabinet/settings/document-templates" },
];

export function AppSidebar() {
  const matchRoute = useMatchRoute();
  const { t } = useTranslation();
  const { openQuickCreate, navigateTo } = useSidebarActions();
  const { organizationId } = useOrganization();

  const { data: activeProducts } = useQuery(
    convexQuery(api.productSubscriptions.getActiveProducts, { organizationId })
  );

  // During loading (undefined), show all sections to avoid flash
  const hasCrm = !activeProducts || activeProducts.includes("crm");
  const hasGabinet = !activeProducts || activeProducts.includes("gabinet");

  const isGabinetRoute = matchRoute({ to: "/dashboard/gabinet", fuzzy: true });
  const activeWorkspace: Workspace = isGabinetRoute ? "gabinet" : "crm";

  const navItems =
    activeWorkspace === "crm" && hasCrm
      ? crmNav
      : activeWorkspace === "gabinet" && hasGabinet
        ? gabinetNav
        : [];


  // Detect active entity page for contextual actions
  const isSettingsRoute = !!matchRoute({ to: "/dashboard/settings", fuzzy: true })
    || !!matchRoute({ to: "/dashboard/gabinet/settings", fuzzy: true });
  const activeEntity = activeWorkspace === "crm" && !isSettingsRoute
    ? entityRouteKeys.find((key) => matchRoute({ to: `/dashboard/${key}`, fuzzy: true }))
    : undefined;
  const activeGabinetEntity = activeWorkspace === "gabinet" && !isSettingsRoute
    ? gabinetRouteKeys.find((key) => matchRoute({ to: `/dashboard/gabinet/${key}`, fuzzy: true }))
    : undefined;
  const pageContext = activeEntity
    ? pageContexts[activeEntity]
    : activeGabinetEntity
      ? gabinetPageContexts[activeGabinetEntity]
      : null;

  return (
    <>
      {/* Column 1: Narrow icon sidebar */}
      <Sidebar collapsible="icon" className="[&_[data-slot=sidebar-inner]]:bg-card">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="gap-2.5 !bg-transparent group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-1! [&>svg]:size-8"
                asChild
              >
                <Link to="/dashboard">
                  <Logo className="[&_rect]:fill-card [&_rect:first-child]:fill-primary" />
                  <span className="text-xl font-semibold">CRM</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive = item.href === "/dashboard"
                    ? matchRoute({ to: "/dashboard" }) !== false &&
                      !matchRoute({ to: "/dashboard/leads", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/activities", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/inbox", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/contacts", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/companies", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/documents", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/products", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/calls", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/calendar", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/settings", fuzzy: true }) &&
                      !matchRoute({ to: "/dashboard/gabinet", fuzzy: true })
                    : !!matchRoute({ to: item.href, fuzzy: true });

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        className="[&>svg]:text-primary [&>easier-icon]:text-primary group-data-[collapsible=icon]:size-10! [&>svg]:size-6 [&>easier-icon]:size-6"
                        tooltip={t(item.label)}
                        isActive={isActive}
                        asChild
                      >
                        <Link to={item.href}>
                          <item.icon />
                          <span>{t(item.label)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      {/* Column 2: Detail panel */}
      <div className="bg-muted sticky top-0 flex h-dvh w-65 flex-col border-r max-lg:hidden">
        {/* Workspace switcher */}
        <div className="px-4 pt-3 pb-2">
          <WorkspaceSwitcher activeWorkspace={activeWorkspace} />
        </div>

        {/* Settings sub-navigation */}
        {isSettingsRoute && (
          <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
            <div className="px-1 pb-2 text-lg font-semibold">
              {t("nav.settings")}
            </div>
            {settingsNav.map((item) => {
              const isActive = !!matchRoute({ to: item.to });
              return (
                <div key={item.to}>
                  {item.section && (
                    <div className="mt-4 mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t(item.section)}
                    </div>
                  )}
                  <Link
                    to={item.to}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground hover:bg-muted-foreground/10"
                    )}
                  >
                    {t(item.labelKey)}
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* Context title when on entity page */}
        {pageContext && (
          <div className="px-4 pb-1 text-lg font-semibold">
            {t(pageContext.titleKey)}
          </div>
        )}

        {/* Contextual actions section */}
        {pageContext && (
          <div className="mt-3 flex flex-col px-4">
            <p className="text-foreground/70 mb-2 text-sm">{t("nav.sections.actions")}</p>
            <div className="mb-4 grid grid-cols-2 gap-4">
              {pageContext.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="hover:bg-primary/5 flex flex-col items-center gap-2 rounded-md border px-2 py-4 text-sm transition-colors"
                  onClick={() => {
                    if (action.quickCreate) {
                      openQuickCreate(action.quickCreate);
                    } else if (action.href) {
                      navigateTo(action.href);
                    }
                  }}
                >
                  <action.icon className="size-7" />
                  <span className="text-center leading-tight">{t(action.label)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
