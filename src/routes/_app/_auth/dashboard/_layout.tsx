import type { CSSProperties } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseGlobalSearch } from "@/hooks/use-supabase-search";
import { useSupabaseScheduledActivityById } from "@/hooks/use-supabase-scheduled-activities";
import { useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppFooter } from "@/components/layout/app-footer";
import { RouteErrorBoundary } from "@/components/layout/route-error-boundary";
import { OrgProvider } from "@/components/org-context";
import { SupabaseProvider } from "@/components/supabase-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Button } from "@/ui/button";
import { ThemeSwitcher } from "@/ui/theme-switcher";
import { useSignOut } from "@/utils/misc";
import {
  Settings,
  LogOut,
  Users,
  Building2,
  TrendingUp,
  FileText,
  Package,
  SearchIcon,
  Mail,
  Calendar,
  UserPlus,
  CalendarCheck,
  BarChart3,
  Check,
} from "@/lib/ez-icons";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  GlobalSearch,
  type SearchResultGroup,
  type SearchResult,
  type QuickActionGroup,
} from "@/components/crm/global-search";
import {
  QuickCreateMenu,
  type QuickCreateMenuHandle,
  type QuickCreateEntityType,
  type FormEntityType,
} from "@/components/crm/quick-create-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SidebarActionsContext } from "@/components/layout/sidebar-context";
import { MiniCalendarProvider } from "@/components/layout/mini-calendar-context";
import { SidebarSlotProvider, useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { HeaderSlotProvider, HeaderBackButton } from "@/components/layout/header-slot-context";
import { getVisibleModules, moduleRegistry } from "@/modules/registry";
import { useMatchRoute } from "@tanstack/react-router";
import { useOrganization } from "@/components/org-context";
import { MigrationHealthBanner } from "@/components/migration-health-banner";
import { ContactForm } from "@/components/forms/contact-form";
import { CompanyForm } from "@/components/forms/company-form";
import { LeadForm } from "@/components/forms/lead-form";
import { PatientForm } from "@/components/forms/patient-form";
import { TreatmentForm } from "@/components/gabinet/treatment-form";
import { PackageForm } from "@/components/forms/package-form";
import { EmployeeForm } from "@/components/forms/employee-form";
import { ActivityForm } from "@/components/crm/activity-form";
import { ActivityDetailDrawer } from "@/components/crm/activity-detail-drawer";
import { LeaveForm } from "@/components/forms/leave-form";
import { UserInvitationForm } from "@/components/forms/user-invitation-form";
import { ProductForm } from "@/components/forms/product-form";
import { CallForm } from "@/components/forms/call-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DateRangeProvider } from "@/components/crm/date-range-context";
import { DateRangePicker } from "@/components/crm/date-range-picker";
import { AgendaStrip } from "@/components/layout/agenda-strip";
import type { Id } from "@cvx/_generated/dataModel";
import { NudgesProvider } from "@/contexts/nudges-context";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout")({
  errorComponent: ({ error, reset }) => (
    <RouteErrorBoundary error={error} reset={reset} />
  ),
  component: DashboardLayout,
});

// Sort modules by workspace root length (longest first) for accurate route matching
const routeAwareModules = [...moduleRegistry].sort(
  (left, right) => right.workspaceRoot.length - left.workspaceRoot.length,
);

/**
 * Compact module switcher shown in the header when the app sidebar is collapsed
 * to icon-only mode (entity detail views).
 */
function HeaderModuleSwitcher() {
  const { shellSidebarMode } = useSidebarSlot();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (same pattern as app-sidebar)
  const { data: activeProducts } = useQuery(
    convexQuery(api.productSubscriptions.getActiveProducts, { organizationId }),
  );

  if (shellSidebarMode !== "icon-only") return null;

  const visibleModules = getVisibleModules(activeProducts);
  const visibleWorkspaces = visibleModules.map((m) => m.workspace);
  if (visibleWorkspaces.length === 0) return null;

  const matchedModule = routeAwareModules.find((m) =>
    matchRoute({ to: m.workspaceRoot, fuzzy: true }),
  );
  const current =
    visibleWorkspaces.find((w) => w.id === matchedModule?.id) ?? visibleWorkspaces[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground">
            <current.icon className="size-3.5" />
          </div>
          <span className="hidden text-sm font-medium sm:inline">{t(current.nameKey)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {visibleWorkspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} onClick={() => navigate({ to: ws.href })}>
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                <ws.icon className="size-3.5" />
              </div>
              <span className="text-sm font-medium">{t(ws.nameKey)}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DEV_BANNER_KEY = "quera-dev-banner-dismissed";

function DevInfoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quera jest w fazie aktywnego rozwoju</DialogTitle>
          <DialogDescription className="space-y-3 pt-2 text-sm leading-relaxed">
            <span className="block">
              Miganie ekranu, błędy, odświeżenia strony czy wylogowania są na tym etapie normalne.
            </span>
            <span className="block">
              Okazjonalnie mogą pojawić się instrukcje dotyczące aktualnie wykonywanej operacji — prosimy o stosowanie się do nich.
            </span>
            <span className="block">
              Czas i miejsce na zgłaszanie błędów przed nami.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Rozumiem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const typeIcons: Record<string, React.ReactNode> = {
  contact: <Users className="h-4 w-4" variant="stroke" />,
  company: <Building2 className="h-4 w-4" variant="stroke" />,
  lead: <TrendingUp className="h-4 w-4" variant="stroke" />,
  document: <FileText className="h-4 w-4" variant="stroke" />,
  product: <Package className="h-4 w-4" variant="stroke" />,
};

// Inner component runs inside the provider stack so Supabase hooks (e.g.
// useSupabaseCustomFieldDefinitions) resolve their context. Mounting the
// providers and calling these hooks in the same component would throw —
// the context lookup walks ancestors, not descendants. See #1496.
interface DashboardLayoutInnerProps {
  // Loose typing avoids fighting Convex codegen's deep instantiation here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  firstOrg: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orgs: any[];
  onOrgSwitch: (orgId: string) => void;
}

function DashboardLayoutInner({ user, firstOrg, orgs, onOrgSwitch }: DashboardLayoutInnerProps) {
  const { t } = useTranslation();
  const quickCreateRef = useRef<QuickCreateMenuHandle>(null);
  const signOut = useSignOut();
  const navigate = useNavigate();
  const { client: supabase } = useSupabase();
  const queryClient = useQueryClient();

  const [searchOpen, setSearchOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const createContact = useAction(api.contacts.create);
  const createCompany = useAction(api.companies.create);
  const createLead = useAction(api.leads.create);
  const createPatient = useAction(api.gabinet.patients.create);
  const createTreatment = useAction(api.gabinet.treatments.create);
  const createPackage = useAction(api.gabinet.packages.create);
  const createEmployee = useAction(api.gabinet.employees.create);
  const createActivity = useAction(api.scheduledActivities.create);
  const createLeave = useAction(api.gabinet.scheduling.createLeave);
  const createProduct = useAction(api.products.create);
  const createCall = useAction(api.calls.create);
  const createInvitation = useAction(api.invitations.create);
  const updateActivity = useAction(api.scheduledActivities.update);
  const removeActivity = useAction(api.scheduledActivities.remove);
  const markActivityComplete = useAction(api.scheduledActivities.markComplete);
  const markActivityIncomplete = useAction(api.scheduledActivities.markIncomplete);

  // Global activity detail drawer
  const [activityDetailId, setActivityDetailId] = useState<string | null>(null);
  const [activityDetailSubmitting, setActivityDetailSubmitting] = useState(false);

  // Tag & category definitions for quick-create forms.
  // Tag defs are org-scoped (not entity-typed) so a single fetch covers all forms.
  // Category defs are entity-typed, so one fetch per entity type used in quick-create.
  const listTagDefinitionsAction = useAction(api.tagDefinitions.list);
  const { data: orgTags } = useQuery({
    queryKey: ["tagDefinitions.list", firstOrg?._id ?? null],
    queryFn: () => listTagDefinitionsAction({
      organizationId: firstOrg?._id as Id<"organizations">,
    }),
    enabled: !!firstOrg,
  }) as { data: any[] | undefined };
  const listCategoryDefinitionsAction = useAction(api.categoryDefinitions.list);
  const { data: contactCategories } = useQuery({
    queryKey: ["categoryDefinitions.list", firstOrg?._id ?? null, "contact"],
    queryFn: () => listCategoryDefinitionsAction({
      organizationId: firstOrg?._id as Id<"organizations">,
      entityType: "contact" as const,
    }),
    enabled: !!firstOrg,
  }) as { data: any[] | undefined };
  const { data: patientCategories } = useQuery({
    queryKey: ["categoryDefinitions.list", firstOrg?._id ?? null, "gabinetPatient"],
    queryFn: () => listCategoryDefinitionsAction({
      organizationId: firstOrg?._id as Id<"organizations">,
      entityType: "gabinetPatient" as const,
    }),
    enabled: !!firstOrg,
  }) as { data: any[] | undefined };
  const { data: productCategories } = useQuery({
    queryKey: ["categoryDefinitions.list", firstOrg?._id ?? null, "product"],
    queryFn: () => listCategoryDefinitionsAction({
      organizationId: firstOrg?._id as Id<"organizations">,
      entityType: "product" as const,
    }),
    enabled: !!firstOrg,
  }) as { data: any[] | undefined };
  const { data: contactCustomFieldDefs } = useSupabaseCustomFieldDefinitions(
    (firstOrg?._id ?? "") as string,
    "contact",
    { enabled: !!firstOrg },
  );

  // Global activity detail drawer data — Supabase-primary
  const { data: activityDetailData } = useSupabaseScheduledActivityById(
    firstOrg?._id ?? "",
    activityDetailId,
    { enabled: !!firstOrg && !!activityDetailId },
  );
  const listActivityTypesAction = useAction(api.activityTypes.list);
  const { data: activityTypeDefs } = useQuery({
    queryKey: ["activityTypes.list", firstOrg?._id ?? null, activityDetailId],
    queryFn: () => listActivityTypesAction({
      organizationId: firstOrg?._id ?? ("" as any),
    }),
    enabled: !!firstOrg && !!activityDetailId,
  }) as { data: any[] | undefined };

  const handleSearch = useCallback(
    async (query: string): Promise<SearchResultGroup[]> => {
      if (!firstOrg || !query.trim() || !supabase) return [];
      const raw = await supabaseGlobalSearch(supabase, firstOrg._id, query);
      return raw.map((group) => ({
        type: group.type,
        label: t(`globalSearch.types.${group.type}`),
        icon: typeIcons[group.type] ?? null,
        results: group.results.map((r) => ({
          ...r,
          type: group.type as SearchResult["type"],
        })),
        totalCount: group.results.length,
      }));
    },
    [supabase, firstOrg, t]
  );

  const handleSearchSelect = useCallback(
    (result: { href: string }) => {
      navigate({ to: result.href });
    },
    [navigate]
  );

  const quickActions = useMemo<QuickActionGroup[]>(() => [
    {
      heading: t("globalSearch.navigate", "Nawiguj"),
      actions: [
        { id: "nav:insights", label: t("nav.insights"), icon: <BarChart3 className="h-4 w-4" /> },
        { id: "nav:deals", label: t("nav.deals"), icon: <TrendingUp className="h-4 w-4" />, shortcut: "⌘D" },
        { id: "nav:contacts", label: t("nav.contacts"), icon: <Users className="h-4 w-4" /> },
        { id: "nav:companies", label: t("nav.companies"), icon: <Building2 className="h-4 w-4" /> },
        { id: "nav:calendar", label: t("nav.calendar"), icon: <Calendar className="h-4 w-4" /> },
        { id: "nav:inbox", label: t("nav.inbox"), icon: <Mail className="h-4 w-4" /> },
      ],
    },
    {
      heading: t("globalSearch.create", "Utwórz"),
      actions: [
        { id: "create:contact", label: t("nav.actions.addContact"), icon: <UserPlus className="h-4 w-4" />, shortcut: "⌘N" },
        { id: "create:company", label: t("nav.actions.addCompany"), icon: <Building2 className="h-4 w-4" /> },
        { id: "create:lead", label: t("nav.actions.addDeal"), icon: <TrendingUp className="h-4 w-4" /> },
        { id: "create:activity", label: t("nav.actions.addActivity"), icon: <CalendarCheck className="h-4 w-4" /> },
      ],
    },
    {
      heading: t("globalSearch.system", "System"),
      actions: [
        { id: "sys:settings", label: t("nav.settings"), icon: <Settings className="h-4 w-4" />, shortcut: "⌘," },
        { id: "sys:signout", label: t("auth.signOut", "Wyloguj się"), icon: <LogOut className="h-4 w-4" />, shortcut: "⌘Q" },
      ],
    },
  ], [t]);

  const handleQuickAction = useCallback(
    (actionId: string) => {
      const navRoutes: Record<string, string> = {
        "nav:insights": "/dashboard",
        "nav:deals": "/dashboard/leads",
        "nav:contacts": "/dashboard/contacts",
        "nav:companies": "/dashboard/companies",
        "nav:calendar": "/dashboard/calendar",
        "nav:inbox": "/dashboard/inbox",
        "sys:settings": "/dashboard/settings",
      };
      const route = navRoutes[actionId];
      if (route) {
        navigate({ to: route });
        return;
      }
      const createTypes: Record<string, QuickCreateEntityType> = {
        "create:contact": "contact",
        "create:company": "company",
        "create:lead": "lead",
        "create:activity": "activity",
      };
      const createType = createTypes[actionId];
      if (createType && quickCreateRef.current) {
        quickCreateRef.current.open(createType as FormEntityType);
        return;
      }
      if (actionId === "sys:signout") {
        signOut();
      }
    },
    [navigate, signOut]
  );

  const handleNavigateEntity = useCallback(
    (entityType: QuickCreateEntityType) => {
      const routes: Partial<Record<QuickCreateEntityType, string>> = {
        activity: "/dashboard/activities",
        call: "/dashboard/calls",
        document: "/dashboard/documents",
      };
      // "Appointment" navigates to the calendar with ?action=create-appointment
      // so the global "+" opens the same AppointmentDialog as every other
      // entry point (issue #1469; mirrors #1506).
      if (entityType === "appointment") {
        navigate({
          to: "/dashboard/gabinet/calendar",
          search: { action: "create-appointment" },
        });
        return;
      }
      const route = routes[entityType];
      if (route) navigate({ to: route });
    },
    [navigate]
  );

  const renderQuickCreateForm = useCallback(
    (
      type: FormEntityType,
      opts: { onSuccess: () => void; onCancel: () => void }
    ) => {
      if (!firstOrg) return null;
      const orgId = firstOrg._id;

      switch (type) {
        case "contact":
          return (
            <ContactForm
              onSubmit={async (data, customFieldRecord) => {
                setIsCreating(true);
                try {
                  const customFields = contactCustomFieldDefs && Object.keys(customFieldRecord).length > 0
                    ? contactCustomFieldDefs
                        .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
                        .map((d) => ({ fieldDefinitionId: d._id, value: customFieldRecord[d.fieldKey] }))
                    : undefined;
                  await createContact({
                    organizationId: orgId,
                    ...data,
                    customFields: customFields && customFields.length > 0 ? customFields : undefined,
                  });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.contacts.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "contacts.errors.createFailed",
                      defaultValue: "Nie udało się dodać kontaktu.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
              showSourceAndTags
              customFieldDefinitions={contactCustomFieldDefs as any}
              tagDefinitions={orgTags}
              categoryDefinitions={contactCategories}
              organizationId={orgId}
            />
          );
        case "company":
          return (
            <CompanyForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createCompany({ organizationId: orgId, ...data });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.companies.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "companies.errors.createFailed",
                      defaultValue: "Nie udało się dodać firmy.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "lead":
          return (
            <LeadForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createLead({
                    organizationId: orgId,
                    title: data.title,
                    value: data.value,
                    status: data.status,
                    priority: data.priority,
                    source: data.source,
                    notes: data.notes,
                  });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "leads.errors.createFailed",
                      defaultValue: "Nie udało się dodać szansy sprzedaży.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "patient":
          return (
            <PatientForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createPatient({ organizationId: orgId, ...data });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "gabinet.patients.errors.createFailed",
                      defaultValue: "Nie udało się dodać pacjenta.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
              organizationId={orgId}
              tagDefinitions={orgTags}
              categoryDefinitions={patientCategories}
            />
          );
        case "treatment":
          return (
            <TreatmentForm
              organizationId={orgId}
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createTreatment({ organizationId: orgId, ...data });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatments.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "gabinet.treatments.errors.createFailed",
                      defaultValue: "Nie udało się dodać zabiegu.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "package":
          return (
            <PackageForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createPackage({ organizationId: orgId, ...data });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetTreatmentPackages.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "gabinet.packages.errors.createFailed",
                      defaultValue: "Nie udało się dodać pakietu.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "employee":
          return (
            <EmployeeForm
              onSubmit={async (data) => {
                if (!data.userId) return;
                setIsCreating(true);
                try {
                  await createEmployee({ organizationId: orgId, ...data, userId: data.userId });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetEmployees.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "gabinet.employees.errors.createFailed",
                      defaultValue: "Nie udało się dodać pracownika.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "activity":
          return (
            <ActivityForm
              linkedEntityType="standalone"
              linkedEntityLabel={t("quickCreate.items.activity")}
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createActivity({
                    organizationId: orgId,
                    title: data.title,
                    activityType: data.activityType,
                    dueDate: data.dueDate,
                    endDate: data.endDate,
                    ownerId: user!._id,
                    description: data.description,
                  });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.scheduledActivities.list(orgId) });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.activities.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "activities.errors.createFailed",
                      defaultValue: "Nie udało się dodać aktywności.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "leave":
          return (
            <LeaveForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createLeave({
                    organizationId: orgId,
                    userId: data.userId,
                    type: data.type,
                    leaveTypeId: data.leaveTypeId,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    reason: data.reason,
                  });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetLeaves.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "gabinet.leaves.errors.createFailed",
                      defaultValue: "Nie udało się dodać urlopu.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "product":
          return (
            <ProductForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createProduct({ organizationId: orgId, ...data });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.products.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "products.errors.createFailed",
                      defaultValue: "Nie udało się dodać produktu.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
              tagDefinitions={orgTags}
              categoryDefinitions={productCategories}
              organizationId={orgId}
            />
          );
        case "call":
          return (
            <CallForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createCall({ organizationId: orgId, ...data });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.calls.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "calls.errors.createFailed",
                      defaultValue: "Nie udało się dodać rozmowy.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "user":
          return (
            <UserInvitationForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createInvitation({
                    organizationId: orgId,
                    email: data.email,
                    role: data.role,
                    module: data.module,
                    moduleData: data.moduleData,
                  });
                  void queryClient.invalidateQueries({ queryKey: supabaseKeys.invitations.list(orgId) });
                  opts.onSuccess();
                } catch (e) {
                  toast.error(
                    formatActionError(e, t, {
                      key: "invitations.errors.createFailed",
                      defaultValue: "Nie udało się wysłać zaproszenia.",
                    }),
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        default:
          return null;
      }
    },
    [firstOrg, isCreating, createContact, createCompany, createLead, createPatient, createTreatment, createPackage, createEmployee, createActivity, createLeave, createInvitation, createProduct, createCall, user, queryClient, orgTags, contactCategories, patientCategories, productCategories, contactCustomFieldDefs]
  );

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showDatePicker = /^\/(dashboard)\/?$/.test(pathname)
    || /^\/dashboard\/(activities|calls|leads|pipelines)/.test(pathname);
  const showAgendaStrip = !pathname.startsWith("/dashboard/gabinet");

  const [lastDispatch, setLastDispatch] = useState<{ id: string; seq: number } | null>(null);
  const dispatchSeqRef = useRef(0);

  const [devInfoOpen, setDevInfoOpen] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(DEV_BANNER_KEY)) setDevInfoOpen(true);
  }, []);
  const handleDevInfoClose = useCallback((v: boolean) => {
    if (!v) localStorage.setItem(DEV_BANNER_KEY, "1");
    setDevInfoOpen(v);
  }, []);

  const sidebarActionsValue = useMemo(
    () => ({
      openQuickCreate: (type: string) => {
        quickCreateRef.current?.open(type as FormEntityType);
      },
      navigateTo: (href: string, search?: Record<string, string>) =>
        navigate(search ? { to: href, search } : { to: href }),
      dispatch: (actionId: string) => {
        dispatchSeqRef.current += 1;
        setLastDispatch({ id: actionId, seq: dispatchSeqRef.current });
      },
      lastDispatch,
      openActivityDetail: (id: string) => setActivityDetailId(id),
    }),
    [navigate, lastDispatch]
  );

  return (
    <>
      <div className="flex h-dvh w-full flex-col overflow-hidden">
        {/* Beta strip */}
        <div
          className="relative z-40 flex h-[30px] shrink-0 items-center overflow-hidden px-4 text-xs font-medium text-white"
          style={{
            background: "repeating-linear-gradient(-45deg, #7c3aed, #7c3aed 10px, #6d28d9 10px, #6d28d9 20px)",
          }}
        >
          <span className="drop-shadow-sm">
            Quera — v. active beta{" "}
            <span className="mx-1.5 opacity-50">|</span>{" "}
            <button onClick={() => setDevInfoOpen(true)} className="underline underline-offset-2 opacity-80 hover:opacity-100">
              co to znaczy?
            </button>
          </span>
        </div>
        {(firstOrg?.role === "owner" || firstOrg?.role === "admin") && (
          <MigrationHealthBanner />
        )}
        <DevInfoDialog open={devInfoOpen} onOpenChange={handleDevInfoClose} />

        <div className="flex min-h-0 min-w-0 flex-1">
        <SidebarActionsContext.Provider value={sidebarActionsValue}>
          <SidebarProvider
            defaultOpen={false}
            className="!min-h-0 h-full"
            style={{ "--sidebar-width-icon": "3.5625rem" } as CSSProperties}
          >
            {/* Columns 1 & 2: Icon sidebar + Detail panel */}
            <AppSidebar />

            {/* Column 3: Main content */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <header className="bg-card sticky top-0 z-50 flex min-h-20 items-center justify-between gap-6 border-b px-4 py-2 sm:px-6">
                <div className="flex items-center gap-4">
                  <HeaderBackButton />
                  <SidebarTrigger className="[&_svg]:!size-4 [&_easier-icon]:!size-4" />
                  <HeaderModuleSwitcher />
                  <Separator orientation="vertical" className="hidden !h-4 sm:block" />
                  <Button
                    variant="ghost"
                    className="hidden !bg-transparent px-1 py-0 font-normal sm:block"
                    onClick={() => setSearchOpen(true)}
                  >
                    <div className="text-muted-foreground hidden items-center gap-2 text-sm sm:flex">
                      <SearchIcon className="size-4" variant="stroke" />
                      <span>{t("layout.search")}</span>
                      <kbd className="ml-1 pointer-events-none inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                        <span className="text-xs">⌘</span>K
                      </kbd>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="sm:hidden"
                    onClick={() => setSearchOpen(true)}
                    aria-label={t("layout.search")}
                  >
                    <SearchIcon className="size-4" variant="stroke" />
                  </Button>
                </div>

                <div className="flex items-center gap-1.5">
                  {showDatePicker && <DateRangePicker />}

                  <QuickCreateMenu
                    ref={quickCreateRef}
                    onNavigate={handleNavigateEntity}
                    renderForm={renderQuickCreateForm}
                  />
                  <NotificationBell />
                  <div className="hidden sm:block">
                    <ThemeSwitcher />
                  </div>

                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-full gap-2 p-0 font-normal sm:pr-1">
                        <Avatar className="size-9.5 rounded-md">
                          {user.avatarUrl && (
                            <AvatarImage
                              src={user.avatarUrl}
                              alt={user.username ?? user.email}
                            />
                          )}
                          <AvatarFallback className="rounded-md bg-gradient-to-br from-primary/80 to-primary text-xs font-medium text-primary-foreground">
                            {(user.name ?? user.username ?? user.email ?? "U")[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden flex-col items-start gap-0.5 sm:flex">
                          <span className="text-sm font-medium">{user.name ?? user.username ?? user.email}</span>
                          <span className="text-muted-foreground text-xs">{user.email}</span>
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <div className="px-2 py-1.5 sm:hidden">
                        <p className="text-sm font-medium">{user.name ?? user.username}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <DropdownMenuSeparator className="sm:hidden" />
                      {orgs.length > 1 && (
                        <>
                          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                            {t("layout.organizations")}
                          </DropdownMenuLabel>
                          {orgs.map((org: any) => (
                            <DropdownMenuItem
                              key={org._id}
                              onClick={() => onOrgSwitch(org._id)}
                              className="gap-2"
                            >
                              <Building2 className="h-4 w-4 shrink-0" variant="stroke" />
                              <span className="flex-1 truncate">{org.name}</span>
                              {org._id === firstOrg._id && (
                                <Check className="h-4 w-4 shrink-0 text-primary" variant="stroke" />
                              )}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem onClick={() => navigate({ to: "/dashboard/settings" })}>
                        <Settings className="mr-2 h-4 w-4" variant="stroke" />
                        {t("layout.settings")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => signOut()}>
                        <LogOut className="mr-2 h-4 w-4" variant="stroke" />
                        {t("layout.logOut")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </header>

              {showAgendaStrip && firstOrg && user && (
                <AgendaStrip organizationId={firstOrg._id} userId={user._id} />
              )}

              {/* Main content */}
              <main className="flex flex-col min-w-0 w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-2 pb-6 sm:px-6">
                <Outlet />
              </main>

              {/* Sticky footer with contextual actions */}
              <AppFooter />
            </div>
          </SidebarProvider>
        </SidebarActionsContext.Provider>
        </div>
      </div>

      {/* Global search dialog */}
      <GlobalSearch
        onSearch={handleSearch}
        onSelect={handleSearchSelect}
        quickActions={quickActions}
        onQuickAction={handleQuickAction}
        isOpen={searchOpen}
        onOpenChange={setSearchOpen}
      />

      {/* Global activity detail drawer */}
      <ActivityDetailDrawer
        open={!!activityDetailId}
        onOpenChange={(open) => { if (!open) setActivityDetailId(null); }}
        activity={activityDetailData ?? null}
        activityTypeDefs={activityTypeDefs?.map((td) => ({
          key: td.key,
          name: td.name,
          icon: td.icon ?? "",
          color: td.color,
        }))}
        onUpdate={async (data) => {
          setActivityDetailSubmitting(true);
          try {
            await updateActivity({
              organizationId: firstOrg!._id,
              activityId: data.activityId as Id<"scheduledActivities">,
              title: data.title,
              activityType: data.activityType,
              dueDate: data.dueDate,
              endDate: data.endDate,
              description: data.description,
            });
          } catch (e) {
            toast.error(
              formatActionError(e, t, {
                key: "activities.errors.updateFailed",
                defaultValue: "Nie udało się zapisać aktywności.",
              }),
            );
          } finally {
            setActivityDetailSubmitting(false);
          }
        }}
        onDelete={async (id) => {
          setActivityDetailSubmitting(true);
          try {
            await removeActivity({
              organizationId: firstOrg!._id,
              activityId: id as Id<"scheduledActivities">,
            });
            setActivityDetailId(null);
          } catch (e) {
            toast.error(
              formatActionError(e, t, {
                key: "activities.errors.deleteFailed",
                defaultValue: "Nie udało się usunąć aktywności.",
              }),
            );
          } finally {
            setActivityDetailSubmitting(false);
          }
        }}
        onToggleComplete={async (id, isCompleted) => {
          if (isCompleted) {
            await markActivityComplete({
              organizationId: firstOrg!._id,
              activityId: id as Id<"scheduledActivities">,
            });
          } else {
            await markActivityIncomplete({
              organizationId: firstOrg!._id,
              activityId: id as Id<"scheduledActivities">,
            });
          }
        }}
        isSubmitting={activityDetailSubmitting}
      />
    </>
  );
}

function DashboardLayout() {
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const { data: orgs } = useQuery(
    convexQuery(api.organizations.getMyOrganizations, {})
  );
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  if (!user || !orgs) return null;
  const firstOrg =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (activeOrgId && orgs.find((o: any) => o._id === activeOrgId)) || orgs[0];
  if (!firstOrg) return null;

  const handleOrgSwitch = (orgId: string) => {
    setActiveOrgId(orgId);
  };

  return (
    <DateRangeProvider>
      <OrgProvider key={firstOrg._id} initialOrgId={firstOrg._id}>
        <SupabaseProvider>
          <NudgesProvider>
            <MiniCalendarProvider>
              <SidebarSlotProvider>
                <HeaderSlotProvider>
                  <DashboardLayoutInner user={user} firstOrg={firstOrg} orgs={orgs} onOrgSwitch={handleOrgSwitch} />
                </HeaderSlotProvider>
              </SidebarSlotProvider>
            </MiniCalendarProvider>
          </NudgesProvider>
        </SupabaseProvider>
      </OrgProvider>
    </DateRangeProvider>
  );
}
