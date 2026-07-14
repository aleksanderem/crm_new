export type StockStatus = "ok" | "low" | "out" | "untracked";

export type SimpleFiltersState = {
  productSection: string | null;
  categoryId: string | null;
  manufacturer: string | null;
  isActive: "true" | "false" | null;
  stockFilter: "below_min" | "zero" | "gt" | "lt" | null;
  stockValue: string;
  priceFrom: string;
  priceTo: string;
};

export const EMPTY_SIMPLE_FILTERS: SimpleFiltersState = {
  productSection: null,
  categoryId: null,
  manufacturer: null,
  isActive: null,
  stockFilter: null,
  stockValue: "",
  priceFrom: "",
  priceTo: "",
};

export function hasAnySimpleFilter(f: SimpleFiltersState): boolean {
  return (
    f.productSection !== null ||
    f.categoryId !== null ||
    f.manufacturer !== null ||
    f.isActive !== null ||
    f.stockFilter !== null ||
    f.priceFrom !== "" ||
    f.priceTo !== ""
  );
}

type StockFilterProduct = { _id: string; trackStock?: boolean };

export function applyStockFilter<T extends StockFilterProduct>(
  data: T[],
  stockFilter: SimpleFiltersState["stockFilter"],
  stockValue: string,
  productStockStatus: Map<string, StockStatus>,
  totalsByProductId: Map<string, { total: number }>,
): T[] {
  if (stockFilter === "below_min") {
    return data.filter((p) => {
      const s = productStockStatus.get(p._id);
      return s === "low" || s === "out";
    });
  }
  if (stockFilter === "zero") {
    return data.filter(
      (p) => p.trackStock && (totalsByProductId.get(p._id)?.total ?? 0) <= 0,
    );
  }
  if (stockFilter === "gt" && stockValue) {
    return data.filter(
      (p) =>
        p.trackStock &&
        (totalsByProductId.get(p._id)?.total ?? 0) > Number(stockValue),
    );
  }
  if (stockFilter === "lt" && stockValue) {
    return data.filter(
      (p) =>
        p.trackStock &&
        (totalsByProductId.get(p._id)?.total ?? 0) < Number(stockValue),
    );
  }
  return data;
}
