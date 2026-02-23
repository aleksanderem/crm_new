import type { CSSProperties } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useConvex, useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppFooter } from "@/components/layout/app-footer";
import { OrgProvider } from "@/components/org-context";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
} from "@/lib/ez-icons";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  GlobalSearch,
  type SearchResultGroup,
  type SearchResult,
} from "@/components/crm/global-search";
import {
  QuickCreateMenu,
  type QuickCreateEntityType,
  type FormEntityType,
} from "@/components/crm/quick-create-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SidebarActionsContext } from "@/components/layout/sidebar-context";
import { MiniCalendarProvider } from "@/components/layout/mini-calendar-context";
import { ContactForm } from "@/components/forms/contact-form";
import { CompanyForm } from "@/components/forms/company-form";
import { LeadForm } from "@/components/forms/lead-form";
import { PatientForm } from "@/components/forms/patient-form";
import { TreatmentForm } from "@/components/gabinet/treatment-form";
import { AppointmentForm } from "@/components/gabinet/appointment-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DateRangeProvider } from "@/components/crm/date-range-context";
import { DateRangePicker } from "@/components/crm/date-range-picker";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout")({
  component: DashboardLayout,
});

const typeIcons: Record<string, React.ReactNode> = {
  contact: <Users className="h-4 w-4" />,
  company: <Building2 className="h-4 w-4" />,
  lead: <TrendingUp className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  product: <Package className="h-4 w-4" />,
};

function DashboardLayout() {
  const { t } = useTranslation();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const { data: orgs } = useQuery(
    convexQuery(api.organizations.getMyOrganizations, {})
  );
  const signOut = useSignOut();
  const navigate = useNavigate();
  const convex = useConvex();

  const [searchOpen, setSearchOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const createContact = useMutation(api.contacts.create);
  const createCompany = useMutation(api.companies.create);
  const createLead = useMutation(api.leads.create);
  const createPatient = useMutation(api.gabinet.patients.create);
  const createTreatment = useMutation(api.gabinet.treatments.create);
  const createAppointment = useMutation(api.gabinet.appointments.create);

  const firstOrg = orgs?.[0];

  const handleSearch = useCallback(
    async (query: string): Promise<SearchResultGroup[]> => {
      if (!firstOrg || !query.trim()) return [];
      const raw = await convex.query(api.search.globalSearch, {
        organizationId: firstOrg._id,
        query,
      });
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
    [convex, firstOrg, t]
  );

  const handleSearchSelect = useCallback(
    (result: { href: string }) => {
      navigate({ to: result.href });
    },
    [navigate]
  );

  const handleNavigateEntity = useCallback(
    (entityType: QuickCreateEntityType) => {
      const routes: Partial<Record<QuickCreateEntityType, string>> = {
        activity: "/dashboard/activities",
        call: "/dashboard/calls",
        document: "/dashboard/documents",
      };
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
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createContact({ organizationId: orgId, ...data });
                  opts.onSuccess();
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "company":
          return (
            <CompanyForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createCompany({ organizationId: orgId, ...data });
                  opts.onSuccess();
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
                  opts.onSuccess();
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
                  opts.onSuccess();
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "appointment":
          return (
            <AppointmentForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createAppointment({ organizationId: orgId, ...data });
                  opts.onSuccess();
                } finally {
                  setIsCreating(false);
                }
              }}
              onCancel={opts.onCancel}
              isSubmitting={isCreating}
            />
          );
        case "treatment":
          return (
            <TreatmentForm
              onSubmit={async (data) => {
                setIsCreating(true);
                try {
                  await createTreatment({ organizationId: orgId, ...data });
                  opts.onSuccess();
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
    [firstOrg, isCreating, createContact, createCompany, createLead, createPatient, createAppointment, createTreatment]
  );

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showDatePicker = /^\/(dashboard)\/?$/.test(pathname)
    || /^\/dashboard\/(activities|calls|leads|pipelines)/.test(pathname);

  const sidebarActionsValue = useMemo(
    () => ({
      openQuickCreate: (type: string) => handleNavigateEntity(type as QuickCreateEntityType),
      navigateTo: (href: string) => navigate({ to: href }),
    }),
    [handleNavigateEntity, navigate]
  );

  if (!user || !orgs) {
    return null;
  }

  if (!firstOrg) {
    return null;
  }

  return (
    <DateRangeProvider>
    <OrgProvider initialOrgId={firstOrg?._id}>
      <MiniCalendarProvider>
      <div className="flex min-h-dvh w-full">
        <SidebarActionsContext.Provider value={sidebarActionsValue}>
          <SidebarProvider
            defaultOpen={false}
            style={{ "--sidebar-width-icon": "3.5625rem" } as CSSProperties}
          >
            {/* Columns 1 & 2: Icon sidebar + Detail panel */}
            <AppSidebar />

            {/* Column 3: Main content */}
            <div className="flex flex-1 flex-col">
              <header className="bg-card sticky top-0 z-50 flex min-h-20 items-center justify-between gap-6 border-b px-4 py-2 sm:px-6">
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="[&_svg]:!size-5 [&_easier-icon]:!size-5" />
                  <Separator orientation="vertical" className="hidden !h-4 sm:block" />
                  <Button
                    variant="ghost"
                    className="hidden !bg-transparent px-1 py-0 font-normal sm:block"
                    onClick={() => setSearchOpen(true)}
                  >
                    <div className="text-muted-foreground hidden items-center gap-1.5 text-sm sm:flex">
                      <SearchIcon />
                      <span>{t("layout.search")}</span>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="sm:hidden"
                    onClick={() => setSearchOpen(true)}
                  >
                    <SearchIcon />
                  </Button>
                </div>

                <div className="flex items-center gap-1.5">
                  {showDatePicker && <DateRangePicker />}

                  <QuickCreateMenu
                    onNavigate={handleNavigateEntity}
                    renderForm={renderQuickCreateForm}
                  />
                  <NotificationBell />
                  <ThemeSwitcher />

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
                            {(user.username ?? user.email ?? "U")[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden flex-col items-start gap-0.5 sm:flex">
                          <span className="text-sm font-medium">{user.username ?? user.name ?? user.email}</span>
                          <span className="text-muted-foreground text-xs">{user.email}</span>
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <div className="px-2 py-1.5 sm:hidden">
                        <p className="text-sm font-medium">{user.username ?? user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <DropdownMenuSeparator className="sm:hidden" />
                      <DropdownMenuItem onClick={() => navigate({ to: "/dashboard/settings" })}>
                        <Settings className="mr-2 h-4 w-4" />
                        {t("layout.settings")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => signOut()}>
                        <LogOut className="mr-2 h-4 w-4" />
                        {t("layout.logOut")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </header>

              {/* Main content */}
              <main className="size-full flex-1 px-4 py-6 sm:px-6">
                <Outlet />
              </main>

              {/* Sticky footer with contextual actions */}
              <AppFooter />
            </div>
          </SidebarProvider>
        </SidebarActionsContext.Provider>
      </div>

      {/* Global search dialog */}
      <GlobalSearch
        onSearch={handleSearch}
        onSelect={handleSearchSelect}
        isOpen={searchOpen}
        onOpenChange={setSearchOpen}
      />

    </MiniCalendarProvider>
    </OrgProvider>
    </DateRangeProvider>
  );
}
