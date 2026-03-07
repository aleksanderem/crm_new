/**
 * Document Data Source Registry — platform core.
 *
 * Each module registers DataSourceDefinition objects describing what entity data
 * it can provide for document template field bindings.  The registry is in-code
 * (not a DB table) because resolvers are functions and adding a source requires
 * a deployment anyway.
 *
 * To add a new module's sources: create a file like
 *   convex/<module>/documentDataSources.ts
 * that exports an array of DataSourceDefinition, then import and spread it
 * into `ALL_DATA_SOURCES` below.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataSourceField {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "currency" | "phone" | "email" | "pesel" | "datetime";
}

export interface DataSourceResolverContext {
  orgId: string;
  userId: string;
}

export type DataSourceResolver = (
  ctx: GenericQueryCtx<DataModel>,
  sourceInstanceId: string | null,
  rctx: DataSourceResolverContext,
) => Promise<Record<string, string>>;

export interface DataSourceDefinition {
  key: string;
  label: string;
  module: string;
  fields: DataSourceField[];
  resolve: DataSourceResolver;
}

// ---------------------------------------------------------------------------
// Platform (core) sources — always available
// ---------------------------------------------------------------------------

const systemSource: DataSourceDefinition = {
  key: "system",
  label: "System",
  module: "platform",
  fields: [
    { key: "today", label: "Dzisiejsza data", type: "date" },
    { key: "datetime", label: "Data i godzina", type: "datetime" },
    { key: "year", label: "Bieżący rok", type: "text" },
  ],
  resolve: async () => {
    const now = new Date();
    return {
      today: now.toISOString().split("T")[0],
      datetime: now.toISOString(),
      year: now.getFullYear().toString(),
    };
  },
};

const currentUserSource: DataSourceDefinition = {
  key: "current_user",
  label: "Bieżący użytkownik",
  module: "platform",
  fields: [
    { key: "name", label: "Imię i nazwisko", type: "text" },
    { key: "email", label: "E-mail", type: "email" },
  ],
  resolve: async (ctx, _id, rctx) => {
    const user = await ctx.db.get(rctx.userId as any) as any;
    return {
      name: user?.name ?? "",
      email: user?.email ?? "",
    };
  },
};

const orgSource: DataSourceDefinition = {
  key: "org",
  label: "Organizacja",
  module: "platform",
  fields: [
    { key: "name", label: "Nazwa firmy", type: "text" },
  ],
  resolve: async (ctx, _id, rctx) => {
    const org = await ctx.db.get(rctx.orgId as any) as any;
    return {
      name: org?.name ?? "",
    };
  },
};

export const PLATFORM_DATA_SOURCES: DataSourceDefinition[] = [
  systemSource,
  currentUserSource,
  orgSource,
];

// ---------------------------------------------------------------------------
// Module sources — imported from module files
// ---------------------------------------------------------------------------

import { GABINET_DATA_SOURCES } from "./gabinet/documentDataSources";
import { CRM_DATA_SOURCES } from "./crm/documentDataSources";

// ---------------------------------------------------------------------------
// Aggregate registry
// ---------------------------------------------------------------------------

export const ALL_DATA_SOURCES: DataSourceDefinition[] = [
  ...PLATFORM_DATA_SOURCES,
  ...GABINET_DATA_SOURCES,
  ...CRM_DATA_SOURCES,
];

// ---------------------------------------------------------------------------
// Registry helpers (used by backend)
// ---------------------------------------------------------------------------

const sourceMap = new Map<string, DataSourceDefinition>();
for (const src of ALL_DATA_SOURCES) {
  sourceMap.set(src.key, src);
}

export function getDataSource(key: string): DataSourceDefinition | undefined {
  return sourceMap.get(key);
}

export function getDataSourcesForModule(module: string): DataSourceDefinition[] {
  return ALL_DATA_SOURCES.filter(
    (s) => s.module === "platform" || s.module === module,
  );
}

export async function resolveSource(
  ctx: GenericQueryCtx<DataModel>,
  sourceKey: string,
  instanceId: string | null,
  rctx: DataSourceResolverContext,
): Promise<Record<string, string>> {
  const src = sourceMap.get(sourceKey);
  if (!src) return {};
  return src.resolve(ctx, instanceId, rctx);
}

// ---------------------------------------------------------------------------
// Query: list available sources for UI (field declarations only, no resolver)
// ---------------------------------------------------------------------------

export const listAvailableSources = query({
  args: { module: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    const sources = args.module
      ? getDataSourcesForModule(args.module)
      : ALL_DATA_SOURCES;

    return sources.map((s) => ({
      key: s.key,
      label: s.label,
      module: s.module,
      fields: s.fields,
    }));
  },
});

/**
 * Resolve all sources and return a flat map of field values.
 * Used by the document-from-template preview to show real data.
 */
export const resolveSourceValues = query({
  args: {
    organizationId: v.id("organizations"),
    sources: v.any(), // Record<string, string | null>
  },
  handler: async (ctx, args) => {
    const userId = await (await import("@cvx/auth")).auth.getUserId(ctx);
    if (!userId) return {};

    const rctx: DataSourceResolverContext = {
      orgId: args.organizationId as string,
      userId: userId as string,
    };

    const sources: Record<string, string | null> = args.sources ?? {};
    const result: Record<string, Record<string, string>> = {};

    // Always resolve platform sources
    result.system = await resolveSource(ctx, "system", null, rctx);
    result.current_user = await resolveSource(ctx, "current_user", null, rctx);
    result.org = await resolveSource(ctx, "org", null, rctx);

    // Resolve additional sources
    for (const [key, instanceId] of Object.entries(sources)) {
      if (key === "system" || key === "current_user" || key === "org") continue;
      if (instanceId) {
        result[key] = await resolveSource(ctx, key, instanceId, rctx);
      }
    }

    return result;
  },
});
