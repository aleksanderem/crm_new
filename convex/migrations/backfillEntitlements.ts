import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { Id } from "../_generated/dataModel";

// One-off: ensure every org has a CRM entitlement, and every org with real
// gabinet data has a Gabinet entitlement. Idempotent. Pass dryRun to count only.
export const run = internalAction({
  args: { dryRun: v.optional(v.boolean()) },
  returns: v.object({
    orgs: v.number(),
    crmGranted: v.number(),
    gabinetGranted: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ orgs: number; crmGranted: number; gabinetGranted: number; dryRun: boolean }> => {
    const dryRun = args.dryRun ?? false;
    const db = createSupabaseDb();
    const orgs = await db.query("organizations").collect();
    const existing = await ctx.runQuery(
      internal.admin.entitlements._listEntitlementsInternal,
      {},
    );
    const has = (orgId: string, productId: string) =>
      existing.some(
        (e) => e.organizationId === orgId && e.productId === productId,
      );

    // Any org appearing in these gabinet tables counts as "using gabinet".
    const gabinetOrgIds = new Set<string>();
    for (const table of ["gabinetPatients", "gabinetEmployees", "gabinetAppointments"] as const) {
      const rows = await db.query(table).collect();
      for (const r of rows) gabinetOrgIds.add(String((r as { organizationId: unknown }).organizationId));
    }

    // A system actor id for grantedByUserId: reuse the first org owner if present.
    let crmGranted = 0;
    let gabinetGranted = 0;
    for (const o of orgs) {
      const orgId = String(o._id);
      const grantedBy = String((o as { ownerId?: unknown }).ownerId ?? o._id);
      if (!has(orgId, "crm")) {
        crmGranted++;
        if (!dryRun) {
          await ctx.runMutation(internal.admin.entitlements._upsertEntitlement, {
            organizationId: orgId as unknown as Id<"organizations">,
            productId: "crm",
            grant: true,
            grantedByUserId: grantedBy as unknown as Id<"users">,
          });
        }
      }
      if (gabinetOrgIds.has(orgId) && !has(orgId, "gabinet")) {
        gabinetGranted++;
        if (!dryRun) {
          await ctx.runMutation(internal.admin.entitlements._upsertEntitlement, {
            organizationId: orgId as unknown as Id<"organizations">,
            productId: "gabinet",
            grant: true,
            grantedByUserId: grantedBy as unknown as Id<"users">,
          });
        }
      }
    }

    return { orgs: orgs.length, crmGranted, gabinetGranted, dryRun };
  },
});
