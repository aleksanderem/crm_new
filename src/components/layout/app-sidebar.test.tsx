import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const shellSidebarMode = vi.hoisted(() => ({ value: "default" as "default" | "icon-only" }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useMatchRoute: () => ({ to }: { to: string }) => to === "/dashboard/leads",
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [] }),
}));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (...args: unknown[]) => args,
}));

vi.mock("@cvx/_generated/api", () => ({
  api: {
    productSubscriptions: { getActiveProducts: {} },
    gabinet: { scheduling: { listLeaves: {} } },
  },
}));

vi.mock("@/components/org-context", () => ({
  useOrganization: () => ({ organizationId: "org_1" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "sidebar.title") return "Transakcje";
      if (key === "nav.sections.actions") return "Akcje";
      if (key === "nav.settings") return "Ustawienia";
      return key;
    },
  }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <aside>{children}</aside>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
}));

vi.mock("@/components/layout/sidebar-context", () => ({
  useSidebarActions: () => ({
    openQuickCreate: vi.fn(),
    navigateTo: vi.fn(),
    dispatch: vi.fn(),
  }),
}));

vi.mock("@/components/layout/sidebar-slot-context", () => ({
  useSidebarSlot: () => ({
    content: null,
    wideContent: false,
    dayAgendaDate: null,
    shellSidebarMode: shellSidebarMode.value,
  }),
}));

vi.mock("@/hooks/use-permission", () => ({
  usePermissions: () => ({ can: () => true }),
}));

vi.mock("@/components/layout/mini-calendar-context", () => ({
  useMiniCalendar: () => ({ state: { visible: false } }),
}));

vi.mock("@untitled/app/calendar/base-components/calendar-mini-month", () => ({
  CalendarMiniMonth: () => null,
}));

vi.mock("@/components/layout/workspace-switcher", () => ({
  WorkspaceSwitcher: () => <div>Workspace switcher</div>,
}));

vi.mock("@/utils/misc", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
}));

vi.mock("@/assets/svg/logo", () => ({
  default: () => <div>Logo</div>,
}));

vi.mock("@/components/sidebar-widgets/gabinet/quick-actions-dropdown", () => ({
  GabinetQuickActionsDropdown: () => null,
}));

vi.mock("@/components/sidebar-widgets/day-timeline", () => ({
  DayTimeline: () => null,
}));

vi.mock("@/modules/registry", () => {
  const crmModule = {
    id: "crm",
    workspaceRoot: "/dashboard/leads",
    settingsRoots: [],
    primaryNav: [],
    pageContexts: [
      {
        key: "leads",
        titleKey: "sidebar.title",
        matches: [{ to: "/dashboard/leads", fuzzy: true }],
        actions: [],
      },
    ],
    fallbackPageContextKey: "leads",
    workspace: { id: "crm", label: "CRM" },
  };

  return {
    moduleRegistry: [crmModule],
    getVisibleModules: () => [crmModule],
    getModuleById: () => crmModule,
  };
});

import { AppSidebar } from "./app-sidebar";

describe("AppSidebar", () => {
  it("renders the wide shell panel by default", () => {
    shellSidebarMode.value = "default";

    const markup = renderToStaticMarkup(<AppSidebar />);

    expect(markup).toContain("Transakcje");
    expect(markup).toContain("Akcje");
  });

  it("does not render the wide shell panel in icon-only mode", () => {
    shellSidebarMode.value = "icon-only";

    const markup = renderToStaticMarkup(<AppSidebar />);

    expect(markup).not.toContain("Transakcje");
  });
});
