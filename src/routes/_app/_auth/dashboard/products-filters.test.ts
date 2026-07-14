import { describe, expect, it } from "vitest";
import {
  hasAnySimpleFilter,
  applyStockFilter,
  EMPTY_SIMPLE_FILTERS,
  type SimpleFiltersState,
  type StockStatus,
} from "./products-filters";

// ─── hasAnySimpleFilter ───────────────────────────────────────────────────────

describe("hasAnySimpleFilter", () => {
  it("returns false for the empty-filters baseline", () => {
    expect(hasAnySimpleFilter(EMPTY_SIMPLE_FILTERS)).toBe(false);
  });

  it("returns true when productSection is set", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, productSection: "sale" })).toBe(true);
  });

  it("returns true when categoryId is set", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, categoryId: "cat_1" })).toBe(true);
  });

  it("returns true when manufacturer is set", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, manufacturer: "Acme" })).toBe(true);
  });

  it("returns true when isActive is set to 'true'", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, isActive: "true" })).toBe(true);
  });

  it("returns true when isActive is set to 'false'", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, isActive: "false" })).toBe(true);
  });

  it("returns true when stockFilter is set", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, stockFilter: "zero" })).toBe(true);
  });

  it("returns true when priceFrom is non-empty", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, priceFrom: "10" })).toBe(true);
  });

  it("returns true when priceTo is non-empty", () => {
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, priceTo: "200" })).toBe(true);
  });

  it("does NOT count stockValue alone as an active filter (stockFilter is null)", () => {
    // stockValue is only meaningful when stockFilter is "gt" or "lt"
    expect(hasAnySimpleFilter({ ...EMPTY_SIMPLE_FILTERS, stockValue: "5" })).toBe(false);
  });
});

// ─── applyStockFilter ─────────────────────────────────────────────────────────

type MinProduct = { _id: string; trackStock?: boolean };

function makeProduct(id: string, trackStock = true): MinProduct {
  return { _id: id, trackStock };
}

describe("applyStockFilter", () => {
  it("returns all products unchanged when stockFilter is null", () => {
    const products = [makeProduct("p1"), makeProduct("p2")];
    const result = applyStockFilter(products, null, "", new Map(), new Map());
    expect(result).toEqual(products);
  });

  describe("below_min branch", () => {
    it("keeps products whose stock status is 'low' or 'out'", () => {
      const products = [makeProduct("p1"), makeProduct("p2"), makeProduct("p3"), makeProduct("p4")];
      const statusMap = new Map<string, StockStatus>([
        ["p1", "out"],
        ["p2", "low"],
        ["p3", "ok"],
        ["p4", "untracked"],
      ]);
      const result = applyStockFilter(products, "below_min", "", statusMap, new Map());
      expect(result.map((p) => p._id)).toEqual(["p1", "p2"]);
    });

    it("returns empty list when all products have ok/untracked status", () => {
      const products = [makeProduct("p1"), makeProduct("p2")];
      const statusMap = new Map<string, StockStatus>([
        ["p1", "ok"],
        ["p2", "untracked"],
      ]);
      const result = applyStockFilter(products, "below_min", "", statusMap, new Map());
      expect(result).toHaveLength(0);
    });
  });

  describe("zero branch", () => {
    it("keeps tracked products with total <= 0", () => {
      const products = [makeProduct("p1"), makeProduct("p2"), makeProduct("p3", false)];
      const totalsMap = new Map([
        ["p1", { total: 0 }],
        ["p2", { total: 5 }],
      ]);
      const result = applyStockFilter(products, "zero", "", new Map(), totalsMap);
      expect(result.map((p) => p._id)).toEqual(["p1"]);
    });

    it("includes tracked products with no entry in the totals map (defaults to 0)", () => {
      const products = [makeProduct("p1")];
      const result = applyStockFilter(products, "zero", "", new Map(), new Map());
      expect(result.map((p) => p._id)).toEqual(["p1"]);
    });

    it("excludes untracked products even when total is 0", () => {
      const products = [makeProduct("untracked_p", false)];
      const totalsMap = new Map([["untracked_p", { total: 0 }]]);
      const result = applyStockFilter(products, "zero", "", new Map(), totalsMap);
      expect(result).toHaveLength(0);
    });
  });

  describe("gt branch", () => {
    it("keeps tracked products with total strictly greater than the threshold", () => {
      const products = [makeProduct("p1"), makeProduct("p2"), makeProduct("p3")];
      const totalsMap = new Map([
        ["p1", { total: 3 }],
        ["p2", { total: 10 }],
        ["p3", { total: 3 }],
      ]);
      const result = applyStockFilter(products, "gt", "3", new Map(), totalsMap);
      expect(result.map((p) => p._id)).toEqual(["p2"]);
    });

    it("returns all products unchanged when stockValue is empty string", () => {
      const products = [makeProduct("p1"), makeProduct("p2")];
      const totalsMap = new Map([["p1", { total: 100 }], ["p2", { total: 1 }]]);
      const result = applyStockFilter(products, "gt", "", new Map(), totalsMap);
      expect(result).toEqual(products);
    });

    it("excludes untracked products", () => {
      const products = [makeProduct("p1"), makeProduct("p2", false)];
      const totalsMap = new Map([["p1", { total: 5 }], ["p2", { total: 10 }]]);
      const result = applyStockFilter(products, "gt", "3", new Map(), totalsMap);
      expect(result.map((p) => p._id)).toEqual(["p1"]);
    });
  });

  describe("lt branch", () => {
    it("keeps tracked products with total strictly less than the threshold", () => {
      const products = [makeProduct("p1"), makeProduct("p2"), makeProduct("p3")];
      const totalsMap = new Map([
        ["p1", { total: 2 }],
        ["p2", { total: 5 }],
        ["p3", { total: 5 }],
      ]);
      const result = applyStockFilter(products, "lt", "5", new Map(), totalsMap);
      expect(result.map((p) => p._id)).toEqual(["p1"]);
    });

    it("returns all products unchanged when stockValue is empty string", () => {
      const products = [makeProduct("p1"), makeProduct("p2")];
      const result = applyStockFilter(products, "lt", "", new Map(), new Map());
      expect(result).toEqual(products);
    });

    it("excludes untracked products", () => {
      const products = [makeProduct("p1"), makeProduct("p2", false)];
      const totalsMap = new Map([["p1", { total: 1 }], ["p2", { total: 1 }]]);
      const result = applyStockFilter(products, "lt", "5", new Map(), totalsMap);
      expect(result.map((p) => p._id)).toEqual(["p1"]);
    });
  });
});
