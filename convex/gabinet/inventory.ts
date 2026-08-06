// Gabinet warehouse — planned usage for the next 7 days (#2923).
//
// Reads upcoming appointments (now → +7 days, excluding completed/cancelled/
// no_show) and sums the product quantities defined in gabinetTreatmentProducts
// for each appointment's treatment. Returns one row per (product, location)
// pair with current stock, planned consumption, projected balance, and deficit.
//
// Read-only: does not touch stock levels or create reservations.

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { SupabaseRow } from "../_helpers/supabaseRows";

type AppointmentRow = SupabaseRow<"gabinetAppointments">;
type AppointmentTreatmentRow = SupabaseRow<"gabinetAppointmentTreatments">;
type TreatmentProductRow = SupabaseRow<"gabinetTreatmentProducts">;
type ProductRow = SupabaseRow<"products">;
type StockLevelRow = SupabaseRow<"productStockLevels">;

export interface PlannedUsageItem {
  productId: string;
  productName: string;
  unit: string;
  locationId: string | null;
  currentStock: number;
  plannedUsage: number;
  projectedStock: number;
  deficit: number | null;
}

export interface ShortagePreviewItem {
  productName: string;
  unit: string;
  currentStock: number;
  plannedAfterSave: number;
  deficit: number;
}

export const getPlannedUsage = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<PlannedUsageItem[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    // HH:MM — used to skip past appointments on today's date
    const currentTimeStr = now.toISOString().slice(11, 16);
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysStr = sevenDaysLater.toISOString().slice(0, 10);

    // Fetch all appointments in the 7-day window, excluding terminal statuses.
    const allAppts = await db
      .query<AppointmentRow>("gabinetAppointments")
      .eq("organizationId", String(args.organizationId))
      .gte("date", todayStr)
      .lte("date", sevenDaysStr)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .neq("status", "no_show")
      .collect();

    // For today, skip appointments whose start time has already passed.
    const appointments = allAppts.filter((a) => {
      if (String(a.date) === todayStr && String(a.startTime) < currentTimeStr) return false;
      return true;
    });

    if (appointments.length === 0) return [];

    // Resolve treatments from the junction table (multi-treatment support, #3356).
    // Fall back to scalar treatmentId for legacy rows not yet in the junction table.
    const appointmentIds = appointments.map((a) => String(a._id));
    const junctionRows = await db
      .query<AppointmentTreatmentRow>("gabinetAppointmentTreatments")
      .in("appointmentId", appointmentIds)
      .collect();

    const apptTreatmentMap = new Map<string, string[]>();
    for (const row of junctionRows) {
      if (!row.treatmentId) continue;
      const aid = String(row.appointmentId);
      if (!apptTreatmentMap.has(aid)) apptTreatmentMap.set(aid, []);
      apptTreatmentMap.get(aid)!.push(String(row.treatmentId));
    }
    const activeAppointments = appointments.filter((a) =>
      apptTreatmentMap.has(String(a._id)),
    );
    if (activeAppointments.length === 0) return [];

    const treatmentIds = [...new Set([...apptTreatmentMap.values()].flat())];

    const links = await db
      .query<TreatmentProductRow>("gabinetTreatmentProducts")
      .eq("organizationId", String(args.organizationId))
      .in("treatmentId", treatmentIds)
      .collect();

    if (links.length === 0) return [];

    // treatmentId → [{productId, quantity, unit}]
    const treatmentMap = new Map<
      string,
      Array<{ productId: string; quantity: number; unit: string | null }>
    >();
    for (const link of links) {
      const tid = String(link.treatmentId);
      if (!treatmentMap.has(tid)) treatmentMap.set(tid, []);
      treatmentMap.get(tid)!.push({
        productId: String(link.productId),
        quantity: Number(link.quantity),
        unit: (link.unit as string | null | undefined) ?? null,
      });
    }

    // Aggregate planned usage per (productId, locationId).
    // locationId comes from the appointment so that each salon's stock is
    // evaluated independently (per the issue requirement).
    type UsageEntry = {
      productId: string;
      locationId: string | null;
      unit: string | null;
      usage: number;
    };
    const usageMap = new Map<string, UsageEntry>();
    for (const appt of activeAppointments) {
      const tids = apptTreatmentMap.get(String(appt._id)) ?? [];
      const locationId = appt.locationId ? String(appt.locationId) : null;
      for (const tid of tids) {
        const products = treatmentMap.get(tid);
        if (!products) continue;
        for (const p of products) {
          const key = `${p.productId}::${locationId ?? ""}`;
          const existing = usageMap.get(key);
          if (existing) {
            existing.usage += p.quantity;
          } else {
            usageMap.set(key, {
              productId: p.productId,
              locationId,
              unit: p.unit,
              usage: p.quantity,
            });
          }
        }
      }
    }

    if (usageMap.size === 0) return [];

    const productIds = [...new Set([...usageMap.values()].map((e) => e.productId))];

    const [productRows, stockLevelRows] = await Promise.all([
      db.getMany<ProductRow>("products", productIds),
      db
        .query<StockLevelRow>("productStockLevels")
        .in("productId", productIds)
        .collect(),
    ]);

    const productMap = new Map(
      productRows.map((p) => [
        String(p._id),
        {
          name: String(p.name),
          stockUnit: (p.stockUnit as string | null | undefined) ?? null,
        },
      ]),
    );

    // `${productId}::${locationId ?? ""}` → quantity
    const stockLookup = new Map<string, number>();
    for (const level of stockLevelRows) {
      const key = `${String(level.productId)}::${level.locationId ? String(level.locationId) : ""}`;
      stockLookup.set(key, Number(level.quantity));
    }

    const result: PlannedUsageItem[] = [];
    for (const [, entry] of usageMap) {
      const product = productMap.get(entry.productId);
      if (!product) continue;
      const stockKey = `${entry.productId}::${entry.locationId ?? ""}`;
      const currentStock = stockLookup.get(stockKey) ?? 0;
      const projectedStock = currentStock - entry.usage;
      result.push({
        productId: entry.productId,
        productName: product.name,
        unit: entry.unit ?? product.stockUnit ?? "",
        locationId: entry.locationId,
        currentStock,
        plannedUsage: entry.usage,
        projectedStock,
        deficit: projectedStock < 0 ? -projectedStock : null,
      });
    }

    // Deficits first (largest first), then alphabetical by product name.
    return result.sort(
      (a, b) =>
        (b.deficit ?? 0) - (a.deficit ?? 0) ||
        a.productName.localeCompare(b.productName, "pl"),
    );
  },
});

// Check whether adding a single appointment for the given treatment would push
// any product into deficit given the current 7-day planned usage. Returns only
// products that would be in shortage after saving — empty means no issues.
// Called live from the appointment create/edit form for the inline warning
// (issue #2933). No inventory permission required since this is part of the
// appointment booking flow.
export const checkAppointmentShortage = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
    locationId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ShortagePreviewItem[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentTimeStr = now.toISOString().slice(11, 16);
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysStr = sevenDaysLater.toISOString().slice(0, 10);

    // 1. Get this treatment's product recipe
    const thisLinks = await db
      .query<TreatmentProductRow>("gabinetTreatmentProducts")
      .eq("organizationId", String(args.organizationId))
      .eq("treatmentId", args.treatmentId)
      .collect();

    if (thisLinks.length === 0) return [];

    const productIds = thisLinks.map((l) => String(l.productId));
    const locationId = args.locationId ?? null;

    // 2. Compute existing planned usage for the recipe products over the next 7 days
    const allAppts = await db
      .query<AppointmentRow>("gabinetAppointments")
      .eq("organizationId", String(args.organizationId))
      .gte("date", todayStr)
      .lte("date", sevenDaysStr)
      .neq("status", "completed")
      .neq("status", "cancelled")
      .neq("status", "no_show")
      .collect();

    const appointments = allAppts.filter((a) => {
      if (String(a.date) === todayStr && String(a.startTime) < currentTimeStr) return false;
      return true;
    });

    // `${productId}::${locationId}` → total already-planned quantity
    const usageMap = new Map<string, number>();
    if (appointments.length > 0) {
      // Resolve treatments from the junction table (multi-treatment support, #3356).
      // Fall back to scalar treatmentId for legacy rows not yet in the junction table.
      const apptIds = appointments.map((a) => String(a._id));
      const existingJunctionRows = await db
        .query<AppointmentTreatmentRow>("gabinetAppointmentTreatments")
        .in("appointmentId", apptIds)
        .collect();

      const apptTreatmentMap = new Map<string, string[]>();
      for (const row of existingJunctionRows) {
        if (!row.treatmentId) continue;
        const aid = String(row.appointmentId);
        if (!apptTreatmentMap.has(aid)) apptTreatmentMap.set(aid, []);
        apptTreatmentMap.get(aid)!.push(String(row.treatmentId));
      }
      const allExistingTreatmentIds = [
        ...new Set([...apptTreatmentMap.values()].flat()),
      ];
      const existingLinks = await db
        .query<TreatmentProductRow>("gabinetTreatmentProducts")
        .eq("organizationId", String(args.organizationId))
        .in("treatmentId", allExistingTreatmentIds)
        .collect();

      // Only track products that appear in this treatment's recipe
      const relevantLinks = existingLinks.filter((l) =>
        productIds.includes(String(l.productId)),
      );

      for (const appt of appointments) {
        const tids = apptTreatmentMap.get(String(appt._id)) ?? [];
        const apptLoc = appt.locationId ? String(appt.locationId) : null;
        for (const tid of tids) {
          const apptLinks = relevantLinks.filter((l) => String(l.treatmentId) === tid);
          for (const link of apptLinks) {
            const key = `${String(link.productId)}::${apptLoc ?? ""}`;
            usageMap.set(key, (usageMap.get(key) ?? 0) + Number(link.quantity));
          }
        }
      }
    }

    // 3. Current stock levels
    const [productRows, stockLevelRows] = await Promise.all([
      db.getMany<ProductRow>("products", productIds),
      db.query<StockLevelRow>("productStockLevels").in("productId", productIds).collect(),
    ]);

    const productMap = new Map(
      productRows.map((p) => [
        String(p._id),
        {
          name: String(p.name),
          stockUnit: (p.stockUnit as string | null | undefined) ?? null,
        },
      ]),
    );

    const stockLookup = new Map<string, number>();
    for (const level of stockLevelRows) {
      const key = `${String(level.productId)}::${level.locationId ? String(level.locationId) : ""}`;
      stockLookup.set(key, Number(level.quantity));
    }

    // 4. Check each recipe product: will saving this appointment cause a deficit?
    const result: ShortagePreviewItem[] = [];
    for (const link of thisLinks) {
      const pid = String(link.productId);
      const key = `${pid}::${locationId ?? ""}`;
      const currentStock = stockLookup.get(key) ?? 0;
      const existingPlanned = usageMap.get(key) ?? 0;
      const thisQty = Number(link.quantity);
      const plannedAfterSave = existingPlanned + thisQty;
      const projectedStock = currentStock - plannedAfterSave;
      if (projectedStock < 0) {
        const product = productMap.get(pid);
        result.push({
          productName: product?.name ?? pid,
          unit: (link.unit as string | null | undefined) ?? product?.stockUnit ?? "",
          currentStock,
          plannedAfterSave,
          deficit: -projectedStock,
        });
      }
    }
    return result;
  },
});
