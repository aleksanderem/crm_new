import { describe, expect, it } from "vitest";
import {
  bucketizePairs,
  computeDailyStats,
  computeDirectSalesPaymentBreakdown,
  computeEmployeeStats,
  computePaymentMethodBreakdown,
  computeStatusStats,
  computeTreatmentStats,
  getPresetDateRange,
  slugify,
} from "./gabinet-report-utils";

// ─── getPresetDateRange ───────────────────────────────────────────────────────

describe("getPresetDateRange", () => {
  it("today: startDate === endDate === today's ISO date", () => {
    const today = new Date().toISOString().split("T")[0];
    const result = getPresetDateRange("today");
    expect(result.startDate).toBe(today);
    expect(result.endDate).toBe(today);
  });

  it("yesterday: startDate === endDate === yesterday's ISO date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const iso = yesterday.toISOString().split("T")[0];
    const result = getPresetDateRange("yesterday");
    expect(result.startDate).toBe(iso);
    expect(result.endDate).toBe(iso);
  });

  it("7d: endDate is today, startDate is 7 days ago", () => {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 7);
    const result = getPresetDateRange("7d");
    expect(result.endDate).toBe(today.toISOString().split("T")[0]);
    expect(result.startDate).toBe(past.toISOString().split("T")[0]);
  });

  it("30d: correct span", () => {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 30);
    const result = getPresetDateRange("30d");
    expect(result.startDate).toBe(past.toISOString().split("T")[0]);
    expect(result.endDate).toBe(today.toISOString().split("T")[0]);
  });

  it("90d: correct span", () => {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 90);
    expect(getPresetDateRange("90d").startDate).toBe(past.toISOString().split("T")[0]);
  });

  it("365d: correct span", () => {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 365);
    expect(getPresetDateRange("365d").startDate).toBe(past.toISOString().split("T")[0]);
  });
});

// ─── slugify ─────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases input", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces and special chars with hyphens", () => {
    expect(slugify("in_progress")).toBe("in-progress");
    expect(slugify("No Show!")).toBe("no-show");
  });

  it("collapses multiple non-alphanumeric chars into a single hyphen", () => {
    expect(slugify("a -- b")).toBe("a-b");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("-hello-")).toBe("hello");
  });

  it("returns 'other' for empty or all-special strings", () => {
    expect(slugify("")).toBe("other");
    expect(slugify("---")).toBe("other");
  });

  it("leaves valid alphanumeric strings unchanged", () => {
    expect(slugify("completed")).toBe("completed");
    expect(slugify("abc123")).toBe("abc123");
  });
});

// ─── bucketizePairs ───────────────────────────────────────────────────────────

describe("bucketizePairs", () => {
  it("returns 7 zero-count buckets for empty input", () => {
    const result = bucketizePairs([]);
    expect(result).toHaveLength(7);
    expect(result.every((b) => b.count === 0)).toBe(true);
    expect(result.map((b) => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("single pair produces one bucket with its count", () => {
    const result = bucketizePairs([["2025-01-01", 5]]);
    expect(result).toHaveLength(1);
    expect(result[0]!.count).toBe(5);
  });

  it("exactly 7 pairs produce 7 buckets each with one entry", () => {
    const pairs: [string, number][] = Array.from({ length: 7 }, (_, i) => [
      `2025-01-0${i + 1}`,
      i + 1,
    ]);
    const result = bucketizePairs(pairs);
    expect(result).toHaveLength(7);
    result.forEach((b, i) => {
      expect(b.index).toBe(i);
      expect(b.count).toBe(i + 1);
    });
  });

  it("sorts pairs by date before bucketing", () => {
    const pairs: [string, number][] = [
      ["2025-01-03", 3],
      ["2025-01-01", 1],
      ["2025-01-02", 2],
    ];
    const result = bucketizePairs(pairs);
    const total = result.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(6);
  });

  it("sums counts within each bucket", () => {
    // 14 pairs → bucketSize = ceil(14/7) = 2, each bucket sums 2 values
    const pairs: [string, number][] = Array.from({ length: 14 }, (_, i) => [
      `2025-${String(i + 1).padStart(2, "0")}-01`,
      10,
    ]);
    const result = bucketizePairs(pairs);
    expect(result).toHaveLength(7);
    expect(result.every((b) => b.count === 20)).toBe(true);
  });
});

// ─── computeTreatmentStats ────────────────────────────────────────────────────

describe("computeTreatmentStats", () => {
  const treatmentMap = new Map([
    ["t1", { name: "Massage", price: 100, currency: "PLN" }],
    ["t2", { name: "Facial", price: 200, currency: "PLN" }],
  ]);

  it("returns empty array for no appointments", () => {
    expect(computeTreatmentStats([], treatmentMap, new Set())).toEqual([]);
  });

  it("counts all appointments regardless of status", () => {
    const appts = [
      { _id: "a1", treatmentId: "t1", employeeId: "e1", date: "2025-01-01", status: "completed" },
      { _id: "a2", treatmentId: "t1", employeeId: "e1", date: "2025-01-02", status: "cancelled" },
    ];
    const result = computeTreatmentStats(appts, treatmentMap, new Set());
    expect(result[0]!.name).toBe("Massage");
    expect(result[0]!.count).toBe(2);
  });

  it("only adds revenue for completed, non-gratis appointments", () => {
    const appts = [
      { _id: "a1", treatmentId: "t1", employeeId: "e1", date: "2025-01-01", status: "completed" },
      { _id: "a2", treatmentId: "t1", employeeId: "e1", date: "2025-01-02", status: "completed" },
      { _id: "a3", treatmentId: "t1", employeeId: "e1", date: "2025-01-03", status: "cancelled" },
    ];
    const gratisIds = new Set(["a2"]);
    const result = computeTreatmentStats(appts, treatmentMap, gratisIds);
    expect(result[0]!.revenue).toBe(100); // only a1 contributes
    expect(result[0]!.count).toBe(3);
  });

  it("uses priceAtBooking when available instead of treatment price", () => {
    const appts = [
      { _id: "a1", treatmentId: "t1", employeeId: "e1", date: "2025-01-01", status: "completed", priceAtBooking: 150 },
    ];
    const result = computeTreatmentStats(appts, treatmentMap, new Set());
    expect(result[0]!.revenue).toBe(150);
  });

  it("sorts by count descending and limits to 10", () => {
    const manyTreatments = new Map(
      Array.from({ length: 12 }, (_, i) => [`t${i}`, { name: `T${i}`, price: 10, currency: "PLN" }])
    );
    // t0 gets 12 appointments, t1 gets 11, ..., t11 gets 1
    const appts = Array.from({ length: 12 }, (_, i) =>
      Array.from({ length: 12 - i }, (__, j) => ({
        _id: `a${i}_${j}`,
        treatmentId: `t${i}`,
        employeeId: "e1",
        date: "2025-01-01",
        status: "scheduled",
      }))
    ).flat();
    const result = computeTreatmentStats(appts, manyTreatments, new Set());
    expect(result).toHaveLength(10);
    expect(result[0]!.count).toBeGreaterThanOrEqual(result[1]!.count);
  });
});

// ─── computeStatusStats ───────────────────────────────────────────────────────

describe("computeStatusStats", () => {
  it("returns empty array for no appointments", () => {
    expect(computeStatusStats([])).toEqual([]);
  });

  it("counts each status correctly", () => {
    const appts = [
      { status: "completed" },
      { status: "completed" },
      { status: "cancelled" },
      { status: "no_show" },
    ];
    const result = computeStatusStats(appts);
    const completed = result.find((r) => r.status === "completed");
    const cancelled = result.find((r) => r.status === "cancelled");
    const noShow = result.find((r) => r.status === "no_show");
    expect(completed?.count).toBe(2);
    expect(cancelled?.count).toBe(1);
    expect(noShow?.count).toBe(1);
  });

  it("sorts by count descending", () => {
    const appts = [
      { status: "cancelled" },
      { status: "completed" },
      { status: "completed" },
      { status: "completed" },
    ];
    const result = computeStatusStats(appts);
    expect(result[0]!.status).toBe("completed");
    expect(result[0]!.count).toBe(3);
  });
});

// ─── computeDailyStats ───────────────────────────────────────────────────────

describe("computeDailyStats", () => {
  it("returns empty array for no appointments", () => {
    expect(computeDailyStats([])).toEqual([]);
  });

  it("counts appointments per date", () => {
    const appts = [
      { date: "2025-01-01" },
      { date: "2025-01-01" },
      { date: "2025-01-02" },
    ];
    const result = computeDailyStats(appts);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.date === "2025-01-01")?.count).toBe(2);
    expect(result.find((r) => r.date === "2025-01-02")?.count).toBe(1);
  });

  it("sorts by date ascending", () => {
    const appts = [
      { date: "2025-01-03" },
      { date: "2025-01-01" },
      { date: "2025-01-02" },
    ];
    const result = computeDailyStats(appts);
    expect(result.map((r) => r.date)).toEqual(["2025-01-01", "2025-01-02", "2025-01-03"]);
  });
});

// ─── computeEmployeeStats ─────────────────────────────────────────────────────

describe("computeEmployeeStats", () => {
  const employeeMap = new Map([
    ["e1", "Anna Kowalska"],
    ["e2", "Jan Nowak"],
  ]);
  const treatmentMap = new Map([
    ["t1", { name: "Massage", price: 100, currency: "PLN" }],
    ["t2", { name: "Facial", price: 200, currency: "PLN" }],
  ]);
  const noGratis = new Set<string>();

  it("returns empty array for no appointments", () => {
    expect(computeEmployeeStats([], employeeMap, treatmentMap, noGratis)).toEqual([]);
  });

  it("resolves employee names from the map, falls back to id when missing", () => {
    const appts = [
      { _id: "a1", employeeId: "e1", status: "completed", date: "2025-01-01" },
      { _id: "a2", employeeId: "e_unknown", status: "completed", date: "2025-01-01" },
    ];
    const result = computeEmployeeStats(appts, employeeMap, treatmentMap, noGratis);
    expect(result.find((r) => r.name === "Anna Kowalska")).toBeTruthy();
    expect(result.find((r) => r.name === "e_unknown")).toBeTruthy();
  });

  it("counts total and completed appointments per employee", () => {
    const appts = [
      { _id: "a1", employeeId: "e1", status: "completed", date: "2025-01-01" },
      { _id: "a2", employeeId: "e1", status: "completed", date: "2025-01-01" },
      { _id: "a3", employeeId: "e1", status: "cancelled", date: "2025-01-01" },
      { _id: "a4", employeeId: "e2", status: "completed", date: "2025-01-01" },
    ];
    const result = computeEmployeeStats(appts, employeeMap, treatmentMap, noGratis);
    const anna = result.find((r) => r.name === "Anna Kowalska");
    expect(anna?.count).toBe(3);
    expect(anna?.completedCount).toBe(2);
  });

  it("sums PLN revenue for completed non-gratis appointments", () => {
    const appts = [
      { _id: "a1", employeeId: "e1", treatmentId: "t1", status: "completed", date: "2025-01-01" },
      { _id: "a2", employeeId: "e1", treatmentId: "t1", status: "completed", date: "2025-01-01" },
      { _id: "a3", employeeId: "e1", treatmentId: "t1", status: "cancelled", date: "2025-01-01" },
    ];
    const result = computeEmployeeStats(appts, employeeMap, treatmentMap, noGratis);
    const anna = result.find((r) => r.name === "Anna Kowalska");
    expect(anna?.revenue).toBe(200); // 2 completed × 100 PLN
  });

  it("excludes gratis/barter appointments from revenue", () => {
    const appts = [
      { _id: "a1", employeeId: "e1", treatmentId: "t1", status: "completed", date: "2025-01-01" },
      { _id: "a2", employeeId: "e1", treatmentId: "t1", status: "completed", date: "2025-01-01" },
    ];
    const gratis = new Set(["a2"]);
    const result = computeEmployeeStats(appts, employeeMap, treatmentMap, gratis);
    const anna = result.find((r) => r.name === "Anna Kowalska");
    expect(anna?.revenue).toBe(100); // only a1 contributes
  });

  it("uses priceAtBooking over treatment price when set", () => {
    const appts = [
      { _id: "a1", employeeId: "e1", treatmentId: "t1", status: "completed", date: "2025-01-01", priceAtBooking: 150 },
    ];
    const result = computeEmployeeStats(appts, employeeMap, treatmentMap, noGratis);
    const anna = result.find((r) => r.name === "Anna Kowalska");
    expect(anna?.revenue).toBe(150);
  });

  it("sorts by total count descending", () => {
    const appts = [
      { _id: "a1", employeeId: "e1", status: "scheduled", date: "2025-01-01" },
      { _id: "a2", employeeId: "e2", status: "completed", date: "2025-01-01" },
      { _id: "a3", employeeId: "e2", status: "completed", date: "2025-01-01" },
    ];
    const result = computeEmployeeStats(appts, employeeMap, treatmentMap, noGratis);
    expect(result[0]!.name).toBe("Jan Nowak");
  });
});

// ─── computePaymentMethodBreakdown ───────────────────────────────────────────

describe("computePaymentMethodBreakdown", () => {
  it("returns all 5 categories with zero counts for empty input", () => {
    const result = computePaymentMethodBreakdown([]);
    expect(result).toHaveLength(5);
    expect(result.every((r) => r.total === 0 && r.count === 0)).toBe(true);
    expect(result.map((r) => r.method)).toEqual(["cash", "card", "transfer", "package", "other"]);
  });

  it("maps known methods to their categories", () => {
    const payments = [
      { paymentMethod: "cash", amount: 100 },
      { paymentMethod: "card", amount: 200 },
      { paymentMethod: "transfer", amount: 50 },
      { paymentMethod: "package", amount: 75 },
    ];
    const result = computePaymentMethodBreakdown(payments);
    expect(result.find((r) => r.method === "cash")?.total).toBe(100);
    expect(result.find((r) => r.method === "card")?.total).toBe(200);
    expect(result.find((r) => r.method === "transfer")?.total).toBe(50);
    expect(result.find((r) => r.method === "package")?.total).toBe(75);
    expect(result.find((r) => r.method === "other")?.total).toBe(0);
  });

  it("groups unknown methods into 'other'", () => {
    const payments = [
      { paymentMethod: "blik", amount: 30 },
      { paymentMethod: "voucher", amount: 20 },
      { paymentMethod: "cash", amount: 10 },
    ];
    const result = computePaymentMethodBreakdown(payments);
    expect(result.find((r) => r.method === "other")?.total).toBe(50);
    expect(result.find((r) => r.method === "other")?.count).toBe(2);
    expect(result.find((r) => r.method === "cash")?.count).toBe(1);
  });

  it("aggregates multiple payments of the same method", () => {
    const payments = [
      { paymentMethod: "card", amount: 100 },
      { paymentMethod: "card", amount: 150 },
      { paymentMethod: "card", amount: 50 },
    ];
    const result = computePaymentMethodBreakdown(payments);
    const card = result.find((r) => r.method === "card");
    expect(card?.total).toBe(300);
    expect(card?.count).toBe(3);
  });
});

// ─── computeDirectSalesPaymentBreakdown ───────────────────────────────────────

describe("computeDirectSalesPaymentBreakdown", () => {
  it("returns all 5 categories with zero values and no unattributed when both arrays are empty", () => {
    const { breakdown, unattributedReturnAmount, unattributedReturnCount } =
      computeDirectSalesPaymentBreakdown([], []);
    expect(breakdown).toHaveLength(5);
    expect(breakdown.every((b) => b.total === 0 && b.count === 0)).toBe(true);
    expect(unattributedReturnAmount).toBe(0);
    expect(unattributedReturnCount).toBe(0);
  });

  it("aggregates cash, card, and transfer sales correctly", () => {
    const sales = [
      { paymentMethod: "cash", revenue: 100 },
      { paymentMethod: "card", revenue: 200 },
      { paymentMethod: "transfer", revenue: 50 },
    ];
    const { breakdown } = computeDirectSalesPaymentBreakdown(sales, []);
    expect(breakdown.find((b) => b.method === "cash")?.total).toBe(100);
    expect(breakdown.find((b) => b.method === "card")?.total).toBe(200);
    expect(breakdown.find((b) => b.method === "transfer")?.total).toBe(50);
  });

  it("accumulates multiple sales with the same payment method", () => {
    const sales = [
      { paymentMethod: "card", revenue: 100 },
      { paymentMethod: "card", revenue: 150 },
      { paymentMethod: "card", revenue: 50 },
    ];
    const { breakdown } = computeDirectSalesPaymentBreakdown(sales, []);
    const card = breakdown.find((b) => b.method === "card");
    expect(card?.total).toBe(300);
    expect(card?.count).toBe(3);
  });

  it("deducts a return with known paymentMethod from the correct bucket", () => {
    const sales = [
      { paymentMethod: "cash", revenue: 200 },
      { paymentMethod: "card", revenue: 100 },
    ];
    const returns = [{ paymentMethod: "cash", revenue: 50 }];
    const { breakdown, unattributedReturnAmount, unattributedReturnCount } =
      computeDirectSalesPaymentBreakdown(sales, returns);
    expect(breakdown.find((b) => b.method === "cash")?.total).toBe(150);
    expect(breakdown.find((b) => b.method === "card")?.total).toBe(100);
    expect(unattributedReturnAmount).toBe(0);
    expect(unattributedReturnCount).toBe(0);
  });

  it("tracks returns with null paymentMethod as unattributed instead of guessing", () => {
    const sales = [{ paymentMethod: "cash", revenue: 200 }];
    const returns = [
      { paymentMethod: null, revenue: 40 },
      { paymentMethod: null, revenue: 30 },
    ];
    const { breakdown, unattributedReturnAmount, unattributedReturnCount } =
      computeDirectSalesPaymentBreakdown(sales, returns);
    expect(breakdown.find((b) => b.method === "cash")?.total).toBe(200);
    expect(unattributedReturnAmount).toBe(70);
    expect(unattributedReturnCount).toBe(2);
  });

  it("does not double-count: each sale and return appears exactly once", () => {
    const sales = [
      { paymentMethod: "card", revenue: 300 },
      { paymentMethod: "cash", revenue: 100 },
    ];
    const returns = [{ paymentMethod: "card", revenue: 50 }];
    const { breakdown } = computeDirectSalesPaymentBreakdown(sales, returns);
    const grandTotal = breakdown.reduce((s, b) => s + b.total, 0);
    expect(grandTotal).toBe(350);
  });

  it("sum of breakdown totals equals net revenue when all returns are attributed", () => {
    const sales = [
      { paymentMethod: "cash", revenue: 500 },
      { paymentMethod: "card", revenue: 300 },
      { paymentMethod: "transfer", revenue: 200 },
    ];
    const returns = [
      { paymentMethod: "cash", revenue: 100 },
      { paymentMethod: "card", revenue: 50 },
    ];
    const totalRevenue = sales.reduce((s, m) => s + m.revenue, 0);
    const totalReturns = returns.reduce((s, m) => s + m.revenue, 0);
    const netRevenue = totalRevenue - totalReturns;
    const { breakdown, unattributedReturnAmount, unattributedReturnCount } =
      computeDirectSalesPaymentBreakdown(sales, returns);
    expect(unattributedReturnCount).toBe(0);
    const breakdownSum = breakdown.reduce((s, b) => s + b.total, 0);
    expect(breakdownSum).toBe(netRevenue);
    expect(unattributedReturnAmount).toBe(0);
  });

  it("sum of breakdown differs from netRevenue by unattributedReturnAmount when some returns lack paymentMethod", () => {
    const sales = [{ paymentMethod: "cash", revenue: 300 }];
    const returns = [
      { paymentMethod: "cash", revenue: 50 },
      { paymentMethod: null, revenue: 30 },
    ];
    const totalRevenue = sales.reduce((s, m) => s + m.revenue, 0);
    const totalReturns = returns.reduce((s, m) => s + m.revenue, 0);
    const netRevenue = totalRevenue - totalReturns;
    const { breakdown, unattributedReturnAmount } =
      computeDirectSalesPaymentBreakdown(sales, returns);
    const breakdownSum = breakdown.reduce((s, b) => s + b.total, 0);
    expect(breakdownSum).toBe(netRevenue + unattributedReturnAmount);
  });
});
