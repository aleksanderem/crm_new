import { Link, useMatchRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSidebarActions } from "@/components/layout/sidebar-context";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { usePermissions } from "@/hooks/use-permission";
import { useMiniCalendar } from "@/components/layout/mini-calendar-context";
import { CalendarMiniMonth } from "@untitled/app/calendar/base-components/calendar-mini-month";
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher";
import { cn } from "@/utils/misc";
import Logo from "@/assets/svg/logo";
import { DayTimeline } from "@/components/sidebar-widgets/day-timeline";
import { getModuleById, getVisibleModules, moduleRegistry } from "@/modules/registry";

const routeAwareModules = [...moduleRegistry].sort(
  (left, right) => right.workspaceRoot.length - left.workspaceRoot.length,
);

export function AppSidebar() {
  const matchRoute = useMatchRoute();
  const { t } = useTranslation();
  const { openQuickCreate, navigateTo, dispatch } = useSidebarActions();
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const { organizationId } = useOrganization();
  const { state: miniCalState } = useMiniCalendar();
  const { content: sidebarSlotContent, wideContent, dayAgendaDate, shellSidebarMode } = useSidebarSlot();

  const { can: canCreate } = usePermissions("create");

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen (same pattern as dashboard layout)
  const { data: activeProducts } = useQuery(convexQuery(api.productSubscriptions.getActiveProducts, { organizationId }));

  const visibleModules = getVisibleModules(activeProducts);
  const hasGabinet = visibleModules.some((module) => module.id === "gabinet");

  const listLeaves = useAction(api.gabinet.scheduling.listLeaves);
  const { data: pendingLeaves } = useQuery({
    queryKey: ["gabinet.scheduling.listLeaves", organizationId, "pending"],
    queryFn: () => listLeaves({ organizationId, status: "pending" as const }),
    enabled: hasGabinet && !!organizationId,
  });
  const pendingLeaveCount = pendingLeaves?.length ?? 0;

  const matchedModule = routeAwareModules.find((module) =>
    matchRoute({ to: module.workspaceRoot, fuzzy: true }),
  );
  const activeWorkspace = matchedModule?.id ?? "crm";
  const activeModule = getModuleById(activeWorkspace) ?? visibleModules[0] ?? moduleRegistry[0];
  const activeModuleVisible = visibleModules.some((module) => module.id === activeModule.id);
  const navItems = activeModuleVisible ? activeModule.primaryNav : [];

  const isSettingsRoute = moduleRegistry.some((module) =>
    module.settingsRoots.some((root) => matchRoute({ to: root, fuzzy: true })),
  );
  const settingsNav = visibleModules.flatMap((module) => module.settingsNav);

  const pageContext = !isSettingsRoute
    ? activeModule.pageContexts.find((context) =>
        context.matches.some((match) =>
          matchRoute({ to: match.to, ...(match.fuzzy ? { fuzzy: true } : {}) }),
        ),
      ) ??
      (activeModule.fallbackPageContextKey
        ? activeModule.pageContexts.find((context) => context.key === activeModule.fallbackPageContextKey)
        : null)
    : null;

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="[&_[data-slot=sidebar-inner]]:bg-card"
      >
        <SidebarHeader className="min-h-20 mt-[30px] flex justify-center">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="gap-2.5 !bg-transparent group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:p-1! [&>svg]:size-5"
                asChild
              >
                <Link to={activeModule.workspace.href} onClick={closeMobile}>
                  <Logo className="[&_rect]:fill-card [&_rect:first-child]:fill-primary" />
                  <span className="text-xl font-semibold">{t(activeModule.workspace.nameKey)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {visibleModules.length > 1 && (
            <div className="px-2 lg:hidden group-data-[collapsible=icon]:hidden">
              <WorkspaceSwitcher
                activeWorkspace={activeWorkspace}
                workspaces={visibleModules.map((module) => module.workspace)}
                onSelect={closeMobile}
              />
            </div>
          )}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const isActive =
                    item.activeMatch === "exact"
                      ? !!matchRoute({ to: item.href })
                      : !!matchRoute({ to: item.href, fuzzy: true });

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        className="[&>svg]:text-primary [&>easier-icon]:text-primary group-data-[collapsible=icon]:size-10! [&>svg]:size-4 [&>easier-icon]:size-4"
                        tooltip={t(item.labelKey)}
                        isActive={isActive}
                        asChild
                      >
                        <Link to={item.href} onClick={closeMobile}>
                          <item.icon variant="stroke" />
                          <span>{t(item.labelKey)}</span>
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

      {shellSidebarMode !== "icon-only" && (
        <div
          className={cn(
            "bg-sidebar sticky top-0 flex h-full w-65 shrink-0 flex-col border-r",
            wideContent ? "max-2xl:hidden lg:flex" : "max-lg:hidden",
          )}
        >
          <div className="px-4 pt-3 pb-2">
            <WorkspaceSwitcher
              activeWorkspace={activeWorkspace}
              workspaces={visibleModules.map((module) => module.workspace)}
            />
          </div>

          {isSettingsRoute ? (
            <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
              <div className="px-1 pb-2 text-lg font-semibold">{t("nav.settings")}</div>
              {settingsNav.map((item) => {
                const isActive = !!matchRoute({ to: item.to });
                return (
                  <div key={item.to}>
                    {item.sectionKey && (
                      <div className="mt-4 mb-1 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t(item.sectionKey)}
                      </div>
                    )}
                    <Link
                      to={item.to}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-muted-foreground/10",
                      )}
                    >
                      <span>{t(item.labelKey)}</span>
                      {item.to === "/dashboard/gabinet/settings/leaves" && pendingLeaveCount > 0 && (
                        <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[11px] leading-none text-white">
                          {pendingLeaveCount > 99 ? "99+" : pendingLeaveCount}
                        </span>
                      )}
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : sidebarSlotContent ? (
            <div className="flex-1 overflow-y-auto px-3 pb-4">{sidebarSlotContent}</div>
          ) : (
            <>
              {dayAgendaDate ? (
                <div className="flex-1 overflow-y-auto px-3 pb-4">
                  <DayTimeline organizationId={organizationId} date={dayAgendaDate} />
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {pageContext && (
                    <div className="px-4 pb-1 text-lg font-semibold">{t(pageContext.titleKey)}</div>
                  )}

                  {pageContext && (
                    <div className="flex flex-col px-4">
                      <p className="text-foreground/70 mb-2 text-sm">{t("nav.sections.actions")}</p>
                      <div className="mb-3 grid grid-cols-2 gap-4">
                        {pageContext.actions
                          .filter((action) => {
                            if (!action.permissionFeature) return true;
                            return canCreate(action.permissionFeature);
                          })
                          .map((action) => (
                            <button
                              key={action.labelKey}
                              type="button"
                              className="hover:bg-primary/5 flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-xs transition-colors"
                              onClick={() => {
                                if (action.quickCreate) {
                                  openQuickCreate(action.quickCreate);
                                } else if (action.dispatch) {
                                  dispatch(action.dispatch);
                                } else if (action.href) {
                                  navigateTo(action.href, action.search);
                                }
                              }}
                            >
                              <action.icon className="size-4" variant="stroke" />
                              <span className="text-center leading-tight">{t(action.labelKey)}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  {pageContext?.widgets && organizationId && (
                    <div className="flex flex-col gap-2 px-3 pb-2">
                      <pageContext.widgets organizationId={organizationId} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {miniCalState.visible &&
            miniCalState.selectedDate &&
            miniCalState.onDateChange && (
              <CalendarMiniMonth
                selectedDate={miniCalState.selectedDate}
                onDateChange={miniCalState.onDateChange}
                highlightedDates={miniCalState.highlightedDates}
                className="border-t-0 px-3 py-3"
              />
            )}
        </div>
      )}
    </>
  );
}
