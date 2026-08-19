import type { ModuleManifest, ModuleId, ProductKey } from "@/modules/types";

const manifestModules = import.meta.glob<Record<string, unknown>>(
  "./*/manifest.ts",
  { eager: true },
);

function isManifest(value: unknown): value is ModuleManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "productKey" in value &&
    "workspaceRoot" in value
  );
}

export const moduleRegistry: ModuleManifest[] = Object.values(manifestModules).flatMap(
  (mod) => Object.values(mod).filter(isManifest),
);

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
