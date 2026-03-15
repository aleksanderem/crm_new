import { crmManifest } from "@/modules/crm/manifest";
import { gabinetManifest } from "@/modules/gabinet/manifest";
import type { ModuleManifest, ModuleId, ProductKey } from "@/modules/types";

export const moduleRegistry: ModuleManifest[] = [crmManifest, gabinetManifest];

export function getModuleById(id: ModuleId) {
  return moduleRegistry.find((module) => module.id === id);
}

export function getVisibleModules(activeProducts?: readonly ProductKey[]) {
  if (!activeProducts) {
    return moduleRegistry;
  }

  const productSet = new Set(activeProducts);
  return moduleRegistry.filter((module) => productSet.has(module.productKey));
}
