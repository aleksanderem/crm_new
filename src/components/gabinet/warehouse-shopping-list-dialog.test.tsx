import { describe, expect, it } from "vitest";
import {
  computeItemCost,
  getEffectiveQty,
  groupShoppingItems,
} from "./warehouse-shopping-list-helpers";

// ---------------------------------------------------------------------------
// computeItemCost
// ---------------------------------------------------------------------------

describe("computeItemCost", () => {
  it("returns qty × price when price is set", () => {
    expect(computeItemCost(6, 200)).toBe(1200);
  });

  it("returns null when price is null (missing price)", () => {
    expect(computeItemCost(6, null)).toBeNull();
  });

  it("returns 0 when qty is 0 and price is set", () => {
    expect(computeItemCost(0, 200)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getEffectiveQty
// ---------------------------------------------------------------------------

describe("getEffectiveQty", () => {
  it("returns the default qty when no override exists", () => {
    expect(getEffectiveQty(6, "prod-1", new Map())).toBe(6);
  });

  it("returns the parsed override when the user typed a number", () => {
    const quantities = new Map([["prod-1", "10"]]);
    expect(getEffectiveQty(6, "prod-1", quantities)).toBe(10);
  });

  it("falls back to default qty when override is empty string", () => {
    const quantities = new Map([["prod-1", ""]]);
    expect(getEffectiveQty(6, "prod-1", quantities)).toBe(6);
  });

  it("falls back to default qty when override is not a valid number", () => {
    const quantities = new Map([["prod-1", "abc"]]);
    expect(getEffectiveQty(6, "prod-1", quantities)).toBe(6);
  });

  it("cost recalculates when quantity changes", () => {
    const quantities = new Map([["prod-1", "3"]]);
    const qty = getEffectiveQty(6, "prod-1", quantities);
    expect(computeItemCost(qty, 200)).toBe(600);
  });
});

// ---------------------------------------------------------------------------
// groupShoppingItems — multi-supplier, no supplier, no price
// ---------------------------------------------------------------------------

type MinItem = { supplier: string | null };

function makeItem(supplier: string | null): MinItem {
  return { supplier };
}

describe("groupShoppingItems", () => {
  it("groups items by supplier", () => {
    const items = [
      makeItem("Dostawca A"),
      makeItem("Dostawca B"),
      makeItem("Dostawca A"),
    ];
    const groups = groupShoppingItems(items);
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.supplier === "Dostawca A");
    expect(a?.items).toHaveLength(2);
    const b = groups.find((g) => g.supplier === "Dostawca B");
    expect(b?.items).toHaveLength(1);
  });

  it("puts null-supplier items in the last group", () => {
    const items = [
      makeItem("Dostawca A"),
      makeItem(null),
      makeItem("Dostawca B"),
    ];
    const groups = groupShoppingItems(items);
    expect(groups[groups.length - 1].supplier).toBeNull();
  });

  it("handles items with no supplier (all null)", () => {
    const items = [makeItem(null), makeItem(null)];
    const groups = groupShoppingItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.supplier).toBeNull();
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("sorts named suppliers alphabetically (pl locale)", () => {
    const items = [makeItem("Zeta"), makeItem("Alpha"), makeItem("Beta")];
    const groups = groupShoppingItems(items);
    const names = groups.map((g) => g.supplier);
    expect(names).toEqual(["Alpha", "Beta", "Zeta"]);
  });

  it("handles empty input", () => {
    expect(groupShoppingItems([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// cost totals with missing prices
// ---------------------------------------------------------------------------

describe("cost total with missing prices", () => {
  it("excludes items without price from total", () => {
    const quantities = new Map<string, string>();
    const items = [
      { id: "a", defaultQty: 5, unitPriceGross: 100 as number | null },
      { id: "b", defaultQty: 3, unitPriceGross: null },
    ];
    let total = 0;
    let hasMissing = false;
    for (const item of items) {
      const qty = getEffectiveQty(item.defaultQty, item.id, quantities);
      const cost = computeItemCost(qty, item.unitPriceGross);
      if (cost === null) {
        hasMissing = true;
      } else {
        total += cost;
      }
    }
    expect(total).toBe(500);
    expect(hasMissing).toBe(true);
  });
});
