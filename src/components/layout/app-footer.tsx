import { useMatchRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/ui/language-switcher";
import { NudgesBadge } from "@/components/notifications/nudges-badge";
import {
  CalendarCheck,
  Download,
  Filter,
  Kanban,
  Phone,
  PlusCircle,
  Send,
  Tag,
  UserPlus,
} from "@/lib/ez-icons";
import { useSidebarActions } from "@/components/layout/sidebar-context";
import { GabinetQuickActionsDropdown } from "@/components/sidebar-widgets/gabinet/quick-actions-dropdown";

interface FooterAction {
  labelKey: string;
  icon: React.ElementType;
  quickCreate?: string;
  href?: string;
  action?: string;
}

const routeActions: Record<string, FooterAction[]> = {
  leads: [
    { labelKey: "nav.actions.viewKanban", icon: Kanban, href: "/dashboard/pipelines" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/leads" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  contacts: [
    { labelKey: "nav.actions.addContact", icon: UserPlus, quickCreate: "contact" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/contacts" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  companies: [
    { labelKey: "nav.actions.addCompany", icon: PlusCircle, quickCreate: "company" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/companies" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  activities: [
    { labelKey: "nav.actions.addActivity", icon: PlusCircle, quickCreate: "activity" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  calls: [
    { labelKey: "nav.actions.logCall", icon: Phone, quickCreate: "call" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  documents: [
    { labelKey: "nav.actions.createFromTemplate", icon: PlusCircle, href: "/dashboard/settings/form-templates" },
  ],
  inbox: [
    { labelKey: "nav.actions.composeEmail", icon: Send, href: "/dashboard/inbox" },
  ],
  products: [
    { labelKey: "nav.actions.addProduct", icon: PlusCircle, quickCreate: "document" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/products" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
};

const defaultGabinetActions: FooterAction[] = [
  { labelKey: "nav.actions.bookAppointment", icon: CalendarCheck, quickCreate: "appointment" },
  { labelKey: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
];

const gabinetRouteActions: Record<string, FooterAction[]> = {
  calendar: [
    { labelKey: "nav.actions.bookAppointment", icon: CalendarCheck, quickCreate: "appointment" },
    { labelKey: "nav.actions.filters", icon: Filter, action: "openFilter" },
    { labelKey: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.printSchedule", icon: Download, action: "printSchedule" },
  ],
  patients: [
    { labelKey: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/gabinet/patients" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  treatments: [
    { labelKey: "nav.actions.addTreatment", icon: PlusCircle, quickCreate: "treatment" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  packages: [
    { labelKey: "nav.actions.addPackage", icon: PlusCircle, quickCreate: "package" },
  ],
  employees: [
    { labelKey: "nav.actions.addEmployee", icon: UserPlus, quickCreate: "employee" },
    { labelKey: "nav.actions.manageTags", icon: Tag, action: "manageTags" },
    { labelKey: "nav.actions.manageCategories", icon: Filter, action: "manageCategories" },
  ],
  documents: [
    { labelKey: "nav.actions.addDocument", icon: PlusCircle, quickCreate: "gabinetDocument" },
  ],
};

const crmRouteKeys = ["contacts", "companies", "leads", "products", "documents", "activities", "calls", "inbox"];
const gabinetRouteKeys = ["calendar", "patients", "treatments", "packages", "employees", "documents"];

export function AppFooter() {
  const { t } = useTranslation();
  const matchRoute = useMatchRoute();
  const { openQuickCreate, navigateTo, dispatch } = useSidebarActions();

  const isGabinetRoute = !!matchRoute({ to: "/dashboard/gabinet", fuzzy: true });
  const showGabinetQuickActions = isGabinetRoute;

  let actions: FooterAction[] = [];

  if (isGabinetRoute) {
    const key = gabinetRouteKeys.find((k) =>
      matchRoute({ to: `/dashboard/gabinet/${k}`, fuzzy: true })
    );
    actions = key ? (gabinetRouteActions[key] ?? defaultGabinetActions) : defaultGabinetActions;
  } else {
    const key = crmRouteKeys.find((k) =>
      matchRoute({ to: `/dashboard/${k}`, fuzzy: true })
    );
    if (key) actions = routeActions[key] ?? [];
  }

  return (
    <footer className="bg-card sticky bottom-0 z-40 border-t">
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2 max-sm:hidden">
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            {`© ${new Date().getFullYear()}`}
          </p>
          <LanguageSwitcher />
          <NudgesBadge />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {actions.map((action) => (
            <Button
              key={action.labelKey}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (action.quickCreate) {
                  openQuickCreate(action.quickCreate);
                } else if (action.action) {
                  dispatch(action.action);
                } else if (action.href) {
                  navigateTo(action.href);
                }
              }}
            >
              <action.icon className="mr-1 h-3.5 w-3.5" />
              {t(action.labelKey)}
            </Button>
          ))}
          {showGabinetQuickActions && <GabinetQuickActionsDropdown />}
        </div>
      </div>
    </footer>
  );
}
