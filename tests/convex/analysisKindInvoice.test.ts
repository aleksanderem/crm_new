import { describe, expect, test } from "vitest";
import { invoiceKind } from "../../convex/_ai/kinds/invoice";

const VALID = {
  supplierName: "ACME Sp. z o.o.",
  supplierNip: "1234567890",
  invoiceNumber: "FV/2024/001",
  invoiceDate: "2024-06-01",
  deliveryDate: null,
  currency: "PLN",
  items: [
    {
      productName: "Krem regenerujący",
      quantity: 2,
      unit: "szt",
      unitPriceNet: 100,
      unitPriceGross: 123,
      vatRate: 23,
      vatCode: "A",
      lineValueNet: 200,
      lineValueGross: 246,
      lotNumber: "L-77",
      expiryDate: "2027-01-31",
    },
  ],
  confidence: 0.92,
};

describe("invoiceKind", () => {
  test("id and prompt", () => {
    expect(invoiceKind.id).toBe("invoice");
    expect(invoiceKind.buildPrompt()).toContain("supplierName");
    expect(invoiceKind.maxTokens).toBe(4096);
  });

  test("validate accepts a valid invoice and rejects garbage", () => {
    expect(invoiceKind.validate(VALID)).toBe(true);
    expect(invoiceKind.validate(null)).toBe(false);
    expect(invoiceKind.validate({ items: "nope" })).toBe(false);
    expect(invoiceKind.validate({ items: [{}] })).toBe(false); // item bez productName
  });

  test("map coerces types and carries rawJson as rawText", () => {
    const rawJson = JSON.stringify(VALID);
    const out = invoiceKind.map(VALID, { rawJson });
    expect(out.supplierName).toBe("ACME Sp. z o.o.");
    expect(out.items[0].unitPrice).toBe(100); // unitPriceNet → unitPrice
    expect(out.items[0].lotNumber).toBe("L-77");
    expect(out.confidence).toBe(0.92);
    expect(out.rawText).toBe(rawJson);
  });

  test("map nulls empty strings and non-finite numbers", () => {
    const messy = { ...VALID, supplierName: "", items: [{ ...VALID.items[0], quantity: "abc", unit: "" }] };
    const out = invoiceKind.map(messy, { rawJson: "{}" });
    expect(out.supplierName).toBeNull();
    expect(out.items[0].quantity).toBe(0);
    expect(out.items[0].unit).toBeNull();
  });
});
