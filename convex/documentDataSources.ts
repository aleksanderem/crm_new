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

import type { GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";

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
  resolve: async (_ctx, _id, rctx) => {
    // users live in Supabase as UUIDs — ctx.db.get fails with
    // "Unable to decode ID". Read from Supabase instead; same fix pattern
    // as #1125.
    const user = (await createSupabaseDb().get(
      "users",
      String(rctx.userId),
    )) as any;
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
  resolve: async (_ctx, _id, rctx) => {
    // organizations live in Supabase as UUIDs — ctx.db.get fails with
    // "Unable to decode ID". Read from Supabase instead; same fix pattern
    // as #1125.
    const org = (await createSupabaseDb().get(
      "organizations",
      String(rctx.orgId),
    )) as any;
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

import { CRM_DATA_SOURCES } from "./crm/documentDataSources";
import { GABINET_DATA_SOURCES } from "./gabinet/documentDataSources";

// ---------------------------------------------------------------------------
// Aggregate registry
// ---------------------------------------------------------------------------

export const ALL_DATA_SOURCES: DataSourceDefinition[] = [
  ...PLATFORM_DATA_SOURCES,
  ...CRM_DATA_SOURCES,
  ...GABINET_DATA_SOURCES,
];

// ---------------------------------------------------------------------------
// Registry helpers (used by backend)
// ---------------------------------------------------------------------------

const sourceMap = new Map<string, DataSourceDefinition>();
for (const src of ALL_DATA_SOURCES) {
  sourceMap.set(src.key, src);
}

export function getDataSourcesForModule(module: string): DataSourceDefinition[] {
  return ALL_DATA_SOURCES.filter(
    (s) => s.module === "platform" || s.module === module,
  );
}
