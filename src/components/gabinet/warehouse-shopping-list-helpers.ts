// Pure utility functions for the warehouse shopping list.
// Extracted into a separate file so they can be unit-tested without JSX.

export function getEffectiveQty(
  defaultQty: number,
  productId: string,
  quantities: Map<string, string>,
): number {
  const override = quantities.get(productId);
  return override !== undefined ? (parseInt(override, 10) || defaultQty) : defaultQty;
}

export function computeItemCost(qty: number, unitPriceGross: number | null): number | null {
  if (unitPriceGross === null) return null;
  return qty * unitPriceGross;
}

export interface GroupedItems<T> {
  supplier: string | null;
  items: T[];
}

export function groupShoppingItems<T extends { supplier: string | null }>(
  items: T[],
): GroupedItems<T>[] {
  const map = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.supplier;
    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }
  const named: [string, T[]][] = [];
  let noSupplier: T[] | undefined;
  for (const [key, groupItems] of map) {
    if (key === null) {
      noSupplier = groupItems;
    } else {
      named.push([key, groupItems]);
    }
  }
  named.sort((a, b) => a[0].localeCompare(b[0], "pl"));
  const result: GroupedItems<T>[] = named.map(([s, groupItems]) => ({
    supplier: s,
    items: groupItems,
  }));
  if (noSupplier !== undefined) {
    result.push({ supplier: null, items: noSupplier });
  }
  return result;
}
