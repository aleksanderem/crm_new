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

export const getPlannedUsage = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<PlannedUsageItem[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(
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
      if (!a.treatmentId) return false;
      if (String(a.date) === todayStr && String(a.startTime) < currentTimeStr) return false;
      return true;
    });

    if (appointments.length === 0) return [];

    const treatmentIds = [...new Set(appointments.map((a) => String(a.treatmentId)))];

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
    for (const appt of appointments) {
      const tid = String(appt.treatmentId);
      const locationId = appt.locationId ? String(appt.locationId) : null;
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
