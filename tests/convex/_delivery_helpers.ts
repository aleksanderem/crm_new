// Shared helpers for warehouse-delivery test suites.
//
// Used by: deliveryItemDecisions.test.ts, deliveryItemMatching.test.ts,
//          deliveryPostFromDecisions.test.ts

import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import type { ParsedInvoiceItem } from "../../convex/_ai/documentAnalyzer";

export function makeInvoiceItem(productName: string): ParsedInvoiceItem {
  return {
    productName,
    quantity: 1,
    unit: "szt",
    unitPrice: null,
    vatRate: null,
    vatCode: null,
    unitPriceGross: null,
    lineValueNet: null,
    lineValueGross: null,
    lotNumber: null,
    expiryDate: null,
  };
}

export const PRODUCT_A_ID = "prod-post-a-1234";
export const PRODUCT_B_ID = "prod-post-b-5678";

export async function seedProducts(organizationId: string) {
  const db = createSupabaseDb();
  await db.insert("products", {
    _id: PRODUCT_A_ID,
    organizationId,
    name: "Rękawiczki nitrylowe",
    sku: "RN-001",
    unitPrice: 5,
    isActive: true,
    trackStock: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await db.insert("products", {
    _id: PRODUCT_B_ID,
    organizationId,
    name: "Stylage XL 1 ml",
    sku: "SXL-001",
    unitPrice: 200,
    isActive: true,
    trackStock: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export const SAMPLE_ANALYSIS = {
  supplierName: "ACME Sp. z o.o.",
  invoiceNumber: "FV/2024/099",
  invoiceDate: "2024-03-10",
  items: [
    {
      productName: "Rękawiczki nitrylowe",
      quantity: 10,
      unit: "szt",
      unitPrice: 4.5,
      vatRate: 23,
      vatCode: "23",
      unitPriceGross: 5.54,
      lineValueNet: 45,
      lineValueGross: 55.4,
      lotNumber: null,
      expiryDate: null,
    },
    {
      productName: "Stylage XL 1 ml",
      quantity: 2,
      unit: "szt",
      unitPrice: 180,
      vatRate: 8,
      vatCode: "8",
      unitPriceGross: 194.4,
      lineValueNet: 360,
      lineValueGross: 388.8,
      lotNumber: "LOT-2024-A",
      expiryDate: "2026-06-30",
    },
    {
      productName: "Transport",
      quantity: 1,
      unit: "usł",
      unitPrice: 20,
      vatRate: 23,
      vatCode: "23",
      unitPriceGross: 24.6,
      lineValueNet: 20,
      lineValueGross: 24.6,
      lotNumber: null,
      expiryDate: null,
    },
  ],
  confidence: 0.95,
};

export async function seedDeliveryWithDecisions(
  organizationId: string,
  userId: string,
  options: {
    decisions?: Array<Record<string, unknown> | null>;
    status?: "draft" | "posted";
  } = {},
): Promise<string> {
  const db = createSupabaseDb();
  const decisions = options.decisions ?? [
    { type: "accepted", productId: PRODUCT_A_ID },
    { type: "choose_product", productId: PRODUCT_B_ID },
    { type: "non_inventory" },
  ];

  return db.insert("warehouseDeliveries", {
    organizationId,
    supplierName: "ACME Sp. z o.o.",
    invoiceNumber: "FV/2024/099",
    deliveryDate: "2024-03-10",
    locationId: null,
    notes: null,
    status: options.status ?? "draft",
    totalValue: null,
    totalValueGross: null,
    invoicePages: [{ storageId: "store-p1", mimeType: "image/jpeg", position: 0 }],
    analysisStatus: "completed",
    analysisResult: SAMPLE_ANALYSIS,
    analysisCompletedAt: Date.now(),
    analysisError: null,
    matchingProposals: null,
    itemDecisions: {
      decidedAt: Date.now(),
      items: decisions,
    },
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
