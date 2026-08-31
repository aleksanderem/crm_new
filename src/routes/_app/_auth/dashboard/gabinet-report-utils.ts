export type DateRangeKey = "today" | "yesterday" | "7d" | "30d" | "90d" | "365d" | "custom";

export function getPresetDateRange(key: Exclude<DateRangeKey, "custom">): {
  startDate: string;
  endDate: string;
} {
  const today = new Date();
  if (key === "today") {
    const iso = today.toISOString().split("T")[0];
    return { startDate: iso!, endDate: iso! };
  }
  if (key === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = yesterday.toISOString().split("T")[0];
    return { startDate: iso!, endDate: iso! };
  }
  const past = new Date(today);
  const days = key === "7d" ? 7 : key === "30d" ? 30 : key === "90d" ? 90 : 365;
  past.setDate(past.getDate() - days);
  return {
    startDate: past.toISOString().split("T")[0]!,
    endDate: today.toISOString().split("T")[0]!,
  };
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "other"
  );
}

export function bucketizePairs(
  pairs: [string, number][],
): { index: number; count: number }[] {
  if (!pairs.length)
    return Array.from({ length: 7 }, (_, i) => ({ index: i, count: 0 }));
  const sorted = [...pairs].sort((a, b) => a[0]!.localeCompare(b[0]!));
  const bucketSize = Math.max(1, Math.ceil(sorted.length / 7));
  const buckets: { index: number; count: number }[] = [];
  for (let i = 0; i < sorted.length; i += bucketSize) {
    const slice = sorted.slice(i, i + bucketSize);
    buckets.push({
      index: buckets.length,
      count: slice.reduce((s, d) => s + d[1]!, 0),
    });
  }
  return buckets;
}

export type AppointmentForStats = {
  _id: string;
  treatmentId?: string;
  employeeId: string;
  date: string;
  status: string;
  priceAtBooking?: number;
};

export type TreatmentInfo = { name: string; price: number; currency: string };

export function computeTreatmentStats(
  appointments: AppointmentForStats[],
  treatmentMap: Map<string, TreatmentInfo>,
  gratisBarterIds: Set<string>,
): { name: string; count: number; revenue: number }[] {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const a of appointments) {
    const tid = a.treatmentId ?? "";
    const prev = map.get(tid) ?? { count: 0, revenue: 0 };
    const price =
      a.status === "completed" && !gratisBarterIds.has(a._id)
        ? (a.priceAtBooking ?? treatmentMap.get(tid)?.price ?? 0)
        : 0;
    map.set(tid, { count: prev.count + 1, revenue: prev.revenue + price });
  }
  return Array.from(map.entries())
    .map(([id, stats]) => ({
      name: treatmentMap.get(id)?.name ?? id,
      count: stats.count,
      revenue: stats.revenue,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function computeStatusStats(
  appointments: Pick<AppointmentForStats, "status">[],
): { status: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of appointments) {
    map.set(a.status, (map.get(a.status) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeDailyStats(
  appointments: Pick<AppointmentForStats, "date">[],
): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const a of appointments) {
    map.set(a.date, (map.get(a.date) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeEmployeeStats(
  appointments: AppointmentForStats[],
  employeeMap: Map<string, string>,
  treatmentMap: Map<string, TreatmentInfo>,
  gratisBarterIds: Set<string>,
): { name: string; count: number; completedCount: number; revenue: number }[] {
  const map = new Map<string, { count: number; completedCount: number; revenue: number }>();
  for (const a of appointments) {
    const uid = a.employeeId;
    const prev = map.get(uid) ?? { count: 0, completedCount: 0, revenue: 0 };
    const isCompleted = a.status === "completed";
    const price =
      isCompleted && !gratisBarterIds.has(a._id)
        ? (a.priceAtBooking ?? treatmentMap.get(a.treatmentId ?? "")?.price ?? 0)
        : 0;
    map.set(uid, {
      count: prev.count + 1,
      completedCount: prev.completedCount + (isCompleted ? 1 : 0),
      revenue: prev.revenue + price,
    });
  }
  return Array.from(map.entries())
    .map(([userId, stats]) => ({
      name: employeeMap.get(userId) ?? userId,
      count: stats.count,
      completedCount: stats.completedCount,
      revenue: stats.revenue,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface GratisBarterDetail {
  appointmentId: string;
  paymentMethod: "gratis" | "barter";
  amount: number;
  gratisReason?: string;
  barterDescription?: string;
}

export function computeGratisBarterStats(details: GratisBarterDetail[]): {
  gratisCount: number;
  gratisValue: number;
  barterCount: number;
  barterValue: number;
} {
  let gratisCount = 0, gratisValue = 0, barterCount = 0, barterValue = 0;
  for (const d of details) {
    if (d.paymentMethod === "gratis") {
      gratisCount++;
      gratisValue += d.amount;
    } else {
      barterCount++;
      barterValue += d.amount;
    }
  }
  return { gratisCount, gratisValue, barterCount, barterValue };
}

const PAYMENT_CATEGORIES = ["cash", "card", "transfer", "package", "other"] as const;
export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

export function computePaymentMethodBreakdown(
  payments: { paymentMethod: string; amount: number }[],
): { method: PaymentCategory; total: number; count: number }[] {
  const categoryOf = (method: string): PaymentCategory => {
    if (
      method === "cash" ||
      method === "card" ||
      method === "transfer" ||
      method === "package"
    )
      return method;
    return "other";
  };
  const map = new Map<PaymentCategory, { total: number; count: number }>();
  for (const p of payments) {
    const cat = categoryOf(p.paymentMethod);
    const prev = map.get(cat) ?? { total: 0, count: 0 };
    map.set(cat, { total: prev.total + p.amount, count: prev.count + 1 });
  }
  return PAYMENT_CATEGORIES.map((key) => ({
    method: key,
    total: map.get(key)?.total ?? 0,
    count: map.get(key)?.count ?? 0,
  }));
}

// Aggregates direct_sale movements into a per-payment-method breakdown and
// deducts returns from the matching bucket when their paymentMethod is known.
// Returns with a null paymentMethod cannot be attributed to any bucket and are
// tracked separately as unattributedReturnAmount / unattributedReturnCount so
// the UI can surface the limitation instead of silently discarding the amounts.
// The sum of breakdown totals equals netRevenue only when unattributedReturnCount === 0.
export function computeDirectSalesPaymentBreakdown(
  sales: { paymentMethod: string | null; revenue: number }[],
  returns: { paymentMethod: string | null; revenue: number }[],
): {
  breakdown: { method: PaymentCategory; total: number; count: number }[];
  unattributedReturnAmount: number;
  unattributedReturnCount: number;
} {
  const categoryOf = (method: string): PaymentCategory => {
    if (method === "cash" || method === "card" || method === "transfer" || method === "package")
      return method;
    return "other";
  };

  const map = new Map<PaymentCategory, { total: number; count: number }>();

  for (const s of sales) {
    const cat = categoryOf(s.paymentMethod ?? "other");
    const prev = map.get(cat) ?? { total: 0, count: 0 };
    map.set(cat, { total: prev.total + s.revenue, count: prev.count + 1 });
  }

  let unattributedReturnAmount = 0;
  let unattributedReturnCount = 0;
  for (const r of returns) {
    if (r.paymentMethod == null) {
      unattributedReturnAmount += r.revenue;
      unattributedReturnCount += 1;
    } else {
      const cat = categoryOf(r.paymentMethod);
      const prev = map.get(cat) ?? { total: 0, count: 0 };
      map.set(cat, { total: prev.total - r.revenue, count: prev.count });
    }
  }

  return {
    breakdown: PAYMENT_CATEGORIES.map((key) => ({
      method: key,
      total: map.get(key)?.total ?? 0,
      count: map.get(key)?.count ?? 0,
    })),
    unattributedReturnAmount,
    unattributedReturnCount,
  };
}
