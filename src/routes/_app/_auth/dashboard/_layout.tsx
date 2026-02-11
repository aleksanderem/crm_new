import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useConvex, useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Sidebar } from "@/components/layout/sidebar";
import { OrgProvider } from "@/components/org-context";
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
  Search,
  Bell,
  Users,
  Building2,
  TrendingUp,
  FileText,
  Package,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  GlobalSearch,
  type SearchResultGroup,
  type SearchResult,
} from "@/components/crm/global-search";
import {
  QuickCreateMenu,
  type QuickCreateEntityType,
} from "@/components/crm/quick-create-menu";
import { SidePanel } from "@/components/crm/side-panel";
import { ContactForm } from "@/components/forms/contact-form";
import { CompanyForm } from "@/components/forms/company-form";
import { LeadForm } from "@/components/forms/lead-form";

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
  const [createPanel, setCreatePanel] = useState<
    "contact" | "company" | "lead" | null
  >(null);
  const [isCreating, setIsCreating] = useState(false);

  const createContact = useMutation(api.contacts.create);
  const createCompany = useMutation(api.companies.create);
  const createLead = useMutation(api.leads.create);

  const firstOrg = orgs?.[0];

  const { data: unreadCount } = useQuery({
    ...convexQuery(api.emails.getUnreadCount, {
      organizationId: firstOrg?._id!,
    }),
    enabled: !!firstOrg,
  });

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

  const handleCreateEntity = useCallback(
    (entityType: QuickCreateEntityType) => {
      switch (entityType) {
        case "contact":
        case "company":
        case "lead":
          setCreatePanel(entityType);
          break;
        case "activity":
          navigate({ to: "/dashboard/activities" });
          break;
        case "call":
          navigate({ to: "/dashboard/calls" });
          break;
        case "document":
          navigate({ to: "/dashboard/documents" });
          break;
      }
    },
    [navigate]
  );

  const handleCreateContact = useCallback(
    async (
      data: {
        firstName: string;
        lastName?: string;
        email?: string;
        phone?: string;
        title?: string;
        source?: string;
        tags?: string[];
        notes?: string;
      },
      _customFields: Record<string, unknown>
    ) => {
      if (!firstOrg) return;
      setIsCreating(true);
      try {
        await createContact({ organizationId: firstOrg._id, ...data });
        setCreatePanel(null);
      } finally {
        setIsCreating(false);
      }
    },
    [createContact, firstOrg]
  );

  const handleCreateCompany = useCallback(
    async (
      data: {
        name: string;
        domain?: string;
        industry?: string;
        size?: string;
        website?: string;
        phone?: string;
        address?: {
          street?: string;
          city?: string;
          state?: string;
          zip?: string;
          country?: string;
        };
        notes?: string;
      },
      _customFields: Record<string, unknown>
    ) => {
      if (!firstOrg) return;
      setIsCreating(true);
      try {
        await createCompany({ organizationId: firstOrg._id, ...data });
        setCreatePanel(null);
      } finally {
        setIsCreating(false);
      }
    },
    [createCompany, firstOrg]
  );

  const handleCreateLead = useCallback(
    async (
      data: {
        title: string;
        value?: number;
        status: "open" | "won" | "lost" | "archived";
        priority?: "low" | "medium" | "high" | "urgent";
        source?: string;
        notes?: string;
      },
      _customFields: Record<string, unknown>
    ) => {
      if (!firstOrg) return;
      setIsCreating(true);
      try {
        await createLead({
          organizationId: firstOrg._id,
          title: data.title,
          value: data.value,
          status: data.status,
          priority: data.priority,
          source: data.source,
          notes: data.notes,
        });
        setCreatePanel(null);
      } finally {
        setIsCreating(false);
      }
    },
    [createLead, firstOrg]
  );

  if (!user || !orgs) {
    return null;
  }

  if (!firstOrg) {
    return null;
  }

  return (
    <OrgProvider initialOrgId={firstOrg?._id}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar orgName={firstOrg?.name} />

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 shrink-0 items-center border-b px-6">
            <div className="flex-1" />

            {/* Search trigger */}
            <Button
              variant="outline"
              className="relative h-8 w-60 justify-start rounded-md text-sm text-muted-foreground"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="mr-2 h-4 w-4" />
              {t("layout.search")}
              <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>

            <div className="flex flex-1 items-center justify-end gap-2">
              {/* Notification bell with unread count */}
              <Button
                variant="ghost"
                size="icon"
                className="relative h-8 w-8"
                onClick={() => navigate({ to: "/dashboard/inbox" as string })}
              >
                <Bell className="h-4 w-4" />
                {(unreadCount ?? 0) > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                    {unreadCount! > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>

              {/* Quick create */}
              <QuickCreateMenu onCreateEntity={handleCreateEntity} />

              <ThemeSwitcher />

              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                    {user.avatarUrl ? (
                      <img
                        className="h-8 w-8 rounded-full object-cover"
                        alt={user.username ?? user.email}
                        src={user.avatarUrl}
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 from-10% via-cyan-300 to-blue-500 text-xs font-medium text-white">
                        {(user.username ?? user.email ?? "U")[0].toUpperCase()}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({ to: "/dashboard/settings" })
                    }
                  >
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
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>

        {/* Global search dialog */}
        <GlobalSearch
          onSearch={handleSearch}
          onSelect={handleSearchSelect}
          isOpen={searchOpen}
          onOpenChange={setSearchOpen}
        />

        {/* Quick Create panels */}
        <SidePanel
          open={createPanel === "contact"}
          onOpenChange={(o) => !o && setCreatePanel(null)}
          title={t("contacts.createContact")}
          description={t("contacts.createDescription")}
        >
          <ContactForm
            onSubmit={handleCreateContact}
            onCancel={() => setCreatePanel(null)}
            isSubmitting={isCreating}
          />
        </SidePanel>

        <SidePanel
          open={createPanel === "company"}
          onOpenChange={(o) => !o && setCreatePanel(null)}
          title={t("companies.createCompany")}
          description={t("companies.createDescription")}
        >
          <CompanyForm
            onSubmit={handleCreateCompany}
            onCancel={() => setCreatePanel(null)}
            isSubmitting={isCreating}
          />
        </SidePanel>

        <SidePanel
          open={createPanel === "lead"}
          onOpenChange={(o) => !o && setCreatePanel(null)}
          title={t("deals.newDeal")}
          description={t("deals.createDescription")}
        >
          <LeadForm
            onSubmit={handleCreateLead}
            onCancel={() => setCreatePanel(null)}
            isSubmitting={isCreating}
          />
        </SidePanel>
      </div>
    </OrgProvider>
  );
}
