import { useMatchRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/ui/language-switcher";
import {
  CalendarCheck,
  ClipboardList,
  Download,
  Filter,
  Kanban,
  Phone,
  PlusCircle,
  Send,
  ShoppingCart,
  Tag,
  TruckIcon,
  Upload,
  UserPlus,
} from "@/lib/ez-icons";
import { useSidebarActions } from "@/components/layout/sidebar-context";
import { GabinetQuickActionsDropdown } from "@/components/sidebar-widgets/gabinet/quick-actions-dropdown";

interface FooterAction {
  labelKey: string;
  icon: React.ElementType;
  quickCreate?: string;
  href?: string;
  search?: Record<string, string>;
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
    { labelKey: "nav.actions.addProduct", icon: PlusCircle, action: "addProduct" },
    { labelKey: "nav.actions.addDelivery", icon: TruckIcon, action: "addDelivery" },
    { labelKey: "nav.actions.openShoppingList", icon: ShoppingCart, action: "openShoppingList" },
    { labelKey: "nav.actions.startInventory", icon: ClipboardList, action: "openInventory" },
    { labelKey: "nav.actions.importCsv", icon: Upload, action: "importCsv" },
    { labelKey: "nav.actions.exportCsv", icon: Download, action: "exportCsv" },
  ],
};

const defaultGabinetActions: FooterAction[] = [
  // "Bookings" off-calendar pages route through the calendar so every
  // entry point opens the same AppointmentDialog (issue #1506).
  {
    labelKey: "nav.actions.bookAppointment",
    icon: CalendarCheck,
    href: "/dashboard/gabinet/calendar",
    search: { action: "create-appointment" },
  },
  { labelKey: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
];

const gabinetRouteActions: Record<string, FooterAction[]> = {
  calendar: [
    { labelKey: "nav.actions.filters", icon: Filter, action: "openFilter" },
    { labelKey: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
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
  const isProductsRoute = !!matchRoute({ to: "/dashboard/products", fuzzy: true });
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

  const handleActionClick = (action: FooterAction) => {
    if (action.quickCreate) {
      openQuickCreate(action.quickCreate);
    } else if (action.action) {
      dispatch(action.action);
    } else if (action.href) {
      navigateTo(action.href, action.search);
    }
  };

  return (
    <footer className="bg-card sticky bottom-0 z-40 border-t">
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-2 max-sm:hidden">
          <p className="text-muted-foreground text-xs whitespace-nowrap">
            {`© ${new Date().getFullYear()}`}
          </p>
          <LanguageSwitcher />
        </div>

        {isProductsRoute && actions.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5">
            <span className="shrink-0 border-r border-border pr-2 text-xs font-semibold text-muted-foreground">
              {t("nav.actions.sectionLabel", { defaultValue: "Akcje" })}
            </span>
            {actions.map((action) => {
              const label = t(action.labelKey);
              return (
                <Button
                  key={action.labelKey}
                  variant="outline"
                  size="sm"
                  aria-label={label}
                  className="h-7 shrink-0 text-xs"
                  onClick={() => handleActionClick(action)}
                >
                  <action.icon className="mr-1 h-3.5 w-3.5" />
                  {label}
                </Button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 max-sm:min-w-0 max-sm:flex-1 max-sm:flex-nowrap max-sm:justify-end sm:flex-wrap">
            {actions.map((action) => {
              const label = t(action.labelKey);
              return (
                <Button
                  key={action.labelKey}
                  variant="outline"
                  size="sm"
                  aria-label={label}
                  className="h-7 text-xs shrink-0 max-sm:h-8 max-sm:w-8 max-sm:p-0"
                  onClick={() => handleActionClick(action)}
                >
                  <action.icon className="h-3.5 w-3.5 sm:mr-1" />
                  <span className="max-sm:sr-only">{label}</span>
                </Button>
              );
            })}
            {showGabinetQuickActions && <GabinetQuickActionsDropdown />}
          </div>
        )}
      </div>
    </footer>
  );
}
