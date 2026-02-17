import { useMatchRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/ui/language-switcher";
import {
  CalendarCheck,
  Download,
  FileText,
  Kanban,
  Mail,
  Phone,
  PlusCircle,
  Send,
  TrendingUp,
  Upload,
  UserPlus,
} from "@/lib/ez-icons";
import { useSidebarActions } from "@/components/layout/sidebar-context";

interface FooterAction {
  labelKey: string;
  icon: React.ElementType;
  quickCreate?: string;
  href?: string;
}

const routeActions: Record<string, FooterAction[]> = {
  leads: [
    { labelKey: "nav.actions.addDeal", icon: PlusCircle, quickCreate: "lead" },
    { labelKey: "nav.actions.viewKanban", icon: Kanban, href: "/dashboard/pipelines" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/leads" },
  ],
  contacts: [
    { labelKey: "nav.actions.addContact", icon: UserPlus, quickCreate: "contact" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/contacts" },
  ],
  companies: [
    { labelKey: "nav.actions.addCompany", icon: PlusCircle, quickCreate: "company" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/companies" },
  ],
  activities: [
    { labelKey: "nav.actions.addActivity", icon: PlusCircle, quickCreate: "activity" },
  ],
  calls: [
    { labelKey: "nav.actions.logCall", icon: Phone, quickCreate: "call" },
  ],
  documents: [
    { labelKey: "nav.actions.uploadDocument", icon: Upload, quickCreate: "document" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/documents" },
  ],
  inbox: [
    { labelKey: "nav.actions.composeEmail", icon: Send, href: "/dashboard/inbox" },
  ],
  products: [
    { labelKey: "nav.actions.addProduct", icon: PlusCircle, quickCreate: "document" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/products" },
  ],
};

const gabinetRouteActions: Record<string, FooterAction[]> = {
  calendar: [
    { labelKey: "nav.actions.bookAppointment", icon: CalendarCheck, quickCreate: "appointment" },
    { labelKey: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
  ],
  patients: [
    { labelKey: "nav.actions.addPatient", icon: UserPlus, quickCreate: "patient" },
    { labelKey: "nav.actions.exportCsv", icon: Download, href: "/dashboard/gabinet/patients" },
  ],
  treatments: [
    { labelKey: "nav.actions.addTreatment", icon: PlusCircle, quickCreate: "treatment" },
  ],
  packages: [
    { labelKey: "nav.actions.addPackage", icon: PlusCircle, quickCreate: "package" },
  ],
  employees: [
    { labelKey: "nav.actions.addEmployee", icon: UserPlus, quickCreate: "employee" },
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
  const { openQuickCreate, navigateTo } = useSidebarActions();

  const isGabinetRoute = !!matchRoute({ to: "/dashboard/gabinet", fuzzy: true });

  let actions: FooterAction[] = [];

  if (isGabinetRoute) {
    const key = gabinetRouteKeys.find((k) =>
      matchRoute({ to: `/dashboard/gabinet/${k}`, fuzzy: true })
    );
    if (key) actions = gabinetRouteActions[key] ?? [];
  } else {
    const key = crmRouteKeys.find((k) =>
      matchRoute({ to: `/dashboard/${k}`, fuzzy: true })
    );
    if (key) actions = routeActions[key] ?? [];
  }

  return (
    <footer className="bg-card sticky bottom-0 z-40 border-t">
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <p className="text-muted-foreground text-xs text-balance max-sm:hidden">
          {`© ${new Date().getFullYear()}`}
        </p>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />

          {actions.map((action) => (
            <Button
              key={action.labelKey}
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (action.quickCreate) {
                  openQuickCreate(action.quickCreate);
                } else if (action.href) {
                  navigateTo(action.href);
                }
              }}
            >
              <action.icon className="mr-1 h-3.5 w-3.5" />
              {t(action.labelKey)}
            </Button>
          ))}
        </div>
      </div>
    </footer>
  );
}
