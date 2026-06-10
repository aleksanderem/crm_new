import type { ComponentType, ElementType } from "react";
import type { Id } from "@cvx/_generated/dataModel";
import type { Feature } from "@/hooks/use-permission";

export type ModuleId = "crm" | "gabinet";
export type ProductKey = string;

export interface ModuleRouteMatch {
  to: string;
  fuzzy?: boolean;
}

export interface ModuleWorkspaceOption {
  id: ModuleId;
  icon: ElementType;
  nameKey: string;
  descKey: string;
  href: string;
}

export interface ModuleNavItem {
  labelKey: string;
  href: string;
  icon: ElementType;
  activeMatch?: "exact" | "fuzzy";
}

export interface ModuleContextAction {
  labelKey: string;
  icon: ElementType;
  quickCreate?: string;
  href?: string;
  search?: Record<string, string>;
  dispatch?: string;
  permissionFeature?: Feature;
}

export interface ModulePageContext {
  key: string;
  titleKey: string;
  actions: ModuleContextAction[];
  widgets?: ComponentType<{ organizationId: Id<"organizations"> }>;
  matches: ModuleRouteMatch[];
}

export interface ModuleSettingsNavItem {
  labelKey: string;
  to: string;
  sectionKey?: string;
}

export interface ModuleManifest {
  id: ModuleId;
  productKey: ProductKey;
  workspaceRoot: string;
  settingsRoots: string[];
  workspace: ModuleWorkspaceOption;
  primaryNav: ModuleNavItem[];
  settingsNav: ModuleSettingsNavItem[];
  pageContexts: ModulePageContext[];
  fallbackPageContextKey?: string;
}
