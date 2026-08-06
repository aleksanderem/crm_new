// Warehouse deliveries backend (#2961).
//
// Manages goods-receipt documents: a delivery header with supplier / invoice
// metadata plus line items (one per product).  Posting a draft delivery writes
// one product_stock_movements row per item via applyMovementInternal and
// stamps the resulting movement_id back onto each item for cross-linking.
//
// Status lifecycle: draft → posted (one-way, irreversible from this layer).

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { applyMovementInternal } from "./inventory";
import type { SupabaseRow } from "./_helpers/supabaseRows";
import { getDocumentTransport, analyzeDocument } from "./_ai/documentAnalyzer";
import type { DocumentPage, ParsedInvoice, ParsedInvoiceItem } from "./_ai/documentAnalyzer";
import { invoiceKind } from "./_ai/kinds/invoice";
import { matchInvoiceItems, normalizeName } from "./_ai/invoiceMatching";
import type { MatchingProposals, ProductForMatching } from "./_ai/invoiceMatching";

type DeliveryRow = SupabaseRow<"warehouseDeliveries">;
type ProductRow = SupabaseRow<"products">;
type DeliveryItemRow = SupabaseRow<"warehouseDeliveryItems">;

// Throws if the same (productId, lotNumber) pair appears more than once within
// a single delivery. Cross-delivery duplicates are allowed per issue #2989.
function checkDuplicateLot(
  items: Array<{ productId: string; lotNumber?: string | null }>,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.lotNumber) continue;
    const key = `${item.productId}::${item.lotNumber}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate LOT "${item.lotNumber}" for the same product within this delivery`);
    }
    seen.add(key);
  }
}

function computeTotals(
  items: Array<{ quantity: number; unitPrice?: number | null; unitPriceGross?: number | null }>,
): { net: number | null; gross: number | null } {
  let net = 0, gross = 0;
  let hasNet = false, hasGross = false;
  for (const item of items) {
    if (item.unitPrice != null) {
      net += item.quantity * item.unitPrice;
      hasNet = true;
    }
    if (item.unitPriceGross != null) {
      gross += item.quantity * item.unitPriceGross;
      hasGross = true;
    }
  }
  return { net: hasNet ? net : null, gross: hasGross ? gross : null };
}

export interface DeliveryWithItems {
  delivery: DeliveryRow;
  items: DeliveryItemRow[];
}

export interface InvoicePageUrl {
  url: string | null;
  mimeType: string;
  position: number;
}

export interface DeliveryWithUrls {
  delivery: DeliveryRow;
  items: DeliveryItemRow[];
  invoicePageUrls: InvoicePageUrl[];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listDeliveries = action({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.union(v.literal("draft"), v.literal("posted"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DeliveryRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    let query = db
      .query<DeliveryRow>("warehouseDeliveries")
      .eq("organizationId", String(args.organizationId));
    if (args.status) {
      query = query.eq("status", args.status);
    }
    return await query.order("createdAt", false).take(limit).collect();
  },
});

export const getDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
  },
  handler: async (ctx, args): Promise<DeliveryWithUrls> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    const items = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();

    const rawPages = Array.isArray(delivery.invoicePages)
      ? (delivery.invoicePages as Array<{ storageId: string; mimeType: string; position: number }>)
          .slice()
          .sort((a, b) => a.position - b.position)
      : [];
    const invoicePageUrls: InvoicePageUrl[] = await Promise.all(
      rawPages.map(async (p) => ({
        url: await ctx.storage.getUrl(p.storageId as unknown as Id<"_storage">),
        mimeType: p.mimeType,
        position: p.position,
      })),
    );

    return { delivery, items, invoicePageUrls };
  },
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const createDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    supplierName: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
    notes: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.string(),
      quantity: v.number(),
      unitPrice: v.optional(v.number()),
      vatRate: v.optional(v.number()),
      vatCode: v.optional(v.string()),
      unitPriceGross: v.optional(v.number()),
      lineValueNet: v.optional(v.number()),
      lineValueGross: v.optional(v.number()),
      lotNumber: v.optional(v.string()),
      expiryDate: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args): Promise<{ deliveryId: string }> => {
    const auth = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.items.length === 0) {
      throw new Error("Delivery must have at least one item");
    }

    // Block duplicate LOT within the same delivery (same product + same lot number)
    checkDuplicateLot(args.items);

    const db = createSupabaseDb();
    const now = Date.now();

    const { net: totalValue, gross: totalValueGross } = computeTotals(args.items);

    const deliveryId = await db.insert("warehouseDeliveries", {
      organizationId: String(args.organizationId),
      supplierName: args.supplierName ?? null,
      invoiceNumber: args.invoiceNumber ?? null,
      deliveryDate: args.deliveryDate ?? null,
      locationId: args.locationId ?? null,
      notes: args.notes ?? null,
      status: "draft",
      totalValue,
      totalValueGross,
      createdBy: String(auth.userId),
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await db.insert("warehouseDeliveryItems", {
        organizationId: String(args.organizationId),
        deliveryId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? null,
        vatRate: item.vatRate ?? null,
        vatCode: item.vatCode ?? null,
        unitPriceGross: item.unitPriceGross ?? null,
        lineValueNet: item.lineValueNet ?? null,
        lineValueGross: item.lineValueGross ?? null,
        lotNumber: item.lotNumber ?? null,
        expiryDate: item.expiryDate ?? null,
        movementId: null,
        createdAt: now,
      });
    }

    return { deliveryId };
  },
});

export const updateDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
    supplierName: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
    notes: v.optional(v.string()),
    items: v.optional(v.array(v.object({
      productId: v.string(),
      quantity: v.number(),
      unitPrice: v.optional(v.number()),
      vatRate: v.optional(v.number()),
      vatCode: v.optional(v.string()),
      unitPriceGross: v.optional(v.number()),
      lineValueNet: v.optional(v.number()),
      lineValueGross: v.optional(v.number()),
      lotNumber: v.optional(v.string()),
      expiryDate: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status !== "draft") {
      throw new Error("Only draft deliveries can be edited");
    }

    const headerPatch: Record<string, unknown> = {
      supplierName: args.supplierName ?? null,
      invoiceNumber: args.invoiceNumber ?? null,
      deliveryDate: args.deliveryDate ?? null,
      locationId: args.locationId ?? null,
      notes: args.notes ?? null,
      updatedAt: Date.now(),
    };

    if (args.items !== undefined) {
      if (args.items.length === 0) {
        throw new Error("Delivery must have at least one item");
      }
      checkDuplicateLot(args.items);
      const { net: totalValue, gross: totalValueGross } = computeTotals(args.items);
      headerPatch.totalValue = totalValue;
      headerPatch.totalValueGross = totalValueGross;

      const existing = await db
        .query<DeliveryItemRow>("warehouseDeliveryItems")
        .eq("deliveryId", args.deliveryId)
        .collect();
      for (const item of existing) {
        await db.delete("warehouseDeliveryItems", String(item._id));
      }
      const now = Date.now();
      for (const item of args.items) {
        await db.insert("warehouseDeliveryItems", {
          organizationId: String(args.organizationId),
          deliveryId: args.deliveryId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? null,
          vatRate: item.vatRate ?? null,
          vatCode: item.vatCode ?? null,
          unitPriceGross: item.unitPriceGross ?? null,
          lineValueNet: item.lineValueNet ?? null,
          lineValueGross: item.lineValueGross ?? null,
          lotNumber: item.lotNumber ?? null,
          expiryDate: item.expiryDate ?? null,
          movementId: null,
          createdAt: now,
        });
      }
    }

    await db.patch("warehouseDeliveries", args.deliveryId, headerPatch);
  },
});

export const cancelDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
  },
  handler: async (ctx, args): Promise<{ warnings: string[] }> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status !== "draft") {
      throw new Error("Only draft deliveries can be cancelled");
    }

    const items = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();
    for (const item of items) {
      await db.delete("warehouseDeliveryItems", String(item._id));
    }

    // Best-effort: delete each invoice page from storage. Failures are collected
    // and returned as warnings rather than aborting the cancellation — a stuck
    // delivery is worse than an orphaned file that can be cleaned up manually.
    const invoicePages = Array.isArray(delivery.invoicePages)
      ? (delivery.invoicePages as Array<{ storageId: string }>)
      : [];
    const failedStorageIds: string[] = [];
    for (const page of invoicePages) {
      try {
        await ctx.storage.delete(page.storageId as unknown as Id<"_storage">);
      } catch {
        failedStorageIds.push(page.storageId);
      }
    }

    await db.delete("warehouseDeliveries", args.deliveryId);

    const warnings: string[] = failedStorageIds.length > 0
      ? [
          `Nie udało się usunąć ${failedStorageIds.length} z ${invoicePages.length} pliku/plików faktury ze storage.` +
          ` ID: ${failedStorageIds.join(", ")}`,
        ]
      : [];

    return { warnings };
  },
});

// Creates a draft delivery pre-linked to uploaded invoice pages (#3016).
// Unlike createDelivery, items are not required — the invoice content will be
// filled in manually or via OCR in a subsequent step.
export const createDeliveryFromInvoice = action({
  args: {
    organizationId: v.id("organizations"),
    pages: v.array(v.object({
      storageId: v.string(),
      mimeType: v.string(),
      position: v.number(),
    })),
    supplierName: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
  },
  handler: async (ctx, args): Promise<{ deliveryId: string }> => {
    const auth = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.pages.length === 0) {
      throw new Error("At least one invoice page is required");
    }

    const db = createSupabaseDb();
    const now = Date.now();

    const deliveryId = await db.insert("warehouseDeliveries", {
      organizationId: String(args.organizationId),
      supplierName: args.supplierName ?? null,
      invoiceNumber: args.invoiceNumber ?? null,
      deliveryDate: args.deliveryDate ?? null,
      locationId: args.locationId ?? null,
      notes: null,
      status: "draft",
      totalValue: null,
      totalValueGross: null,
      invoicePages: args.pages,
      createdBy: String(auth.userId),
      createdAt: now,
      updatedAt: now,
    });

    return { deliveryId };
  },
});

// ParsedInvoice stored on the delivery — rawText is debug-only and is never
// persisted as business data per issue #3045.
export type StoredAnalysisResult = Omit<ParsedInvoice, "rawText">;

// ---------------------------------------------------------------------------
// Invoice analysis
// ---------------------------------------------------------------------------

// Runs AI/OCR analysis on all invoice pages attached to a draft delivery and
// persists the result.  Safe to re-run: a fresh success replaces the previous
// result; a failure preserves the last successful result if one exists.
export const analyzeDeliveryInvoice = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | { status: "completed"; result: StoredAnalysisResult }
    | { status: "failed"; error: string }
  > => {
    // 1. Auth + permission
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_inventory",
        action: "edit",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    // 2. Load and validate delivery
    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>(
      "warehouseDeliveries",
      args.deliveryId,
    );
    if (
      !delivery ||
      String(delivery.organizationId) !== String(args.organizationId)
    ) {
      throw new Error("Delivery not found");
    }
    if (delivery.status !== "draft") {
      throw new Error("Only draft deliveries can be analyzed");
    }

    const rawPages = Array.isArray(delivery.invoicePages)
      ? (delivery.invoicePages as Array<{
          storageId: string;
          mimeType: string;
          position: number;
        }>)
      : [];
    if (rawPages.length === 0) {
      throw new Error("Delivery has no invoice pages to analyze");
    }

    // 3. Capture previous successful result before overwriting status
    const prevResult: StoredAnalysisResult | null =
      delivery.analysisStatus === "completed" &&
      delivery.analysisResult != null
        ? (delivery.analysisResult as StoredAnalysisResult)
        : null;

    // 4. Mark as processing
    await db.patch("warehouseDeliveries", args.deliveryId, {
      analysisStatus: "processing",
      updatedAt: Date.now(),
    });

    // 5. Sort pages by position and invoke the analyzer
    const pages: DocumentPage[] = rawPages
      .slice()
      .sort((a, b) => a.position - b.position);

    const transport = await getDocumentTransport(
      (id: string) => ctx.storage.get(id as unknown as Id<"_storage">),
    );

    const analysisResult = await analyzeDocument(transport, invoiceKind, pages);
    const now = Date.now();

    // 6. Persist result
    if (analysisResult.status === "ok") {
      // Strip rawText — it is debug-only and must not be stored as business data
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { rawText: _discard, ...stored } = analysisResult.data;
      await db.patch("warehouseDeliveries", args.deliveryId, {
        analysisStatus: "completed",
        analysisResult: stored,
        analysisCompletedAt: now,
        analysisError: null,
        updatedAt: now,
      });
      return { status: "completed", result: stored };
    }

    // Map all non-ok outcomes to a user-facing error message
    let errorMessage: string;
    switch (analysisResult.status) {
      case "not_implemented":
        errorMessage = "AI analysis provider is not configured";
        break;
      case "no_pages":
        errorMessage = "No invoice pages to analyze";
        break;
      case "unsupported_format":
        errorMessage = `Unsupported file format: ${analysisResult.mimeType}`;
        break;
      case "error":
        errorMessage = analysisResult.message;
        break;
      default:
        errorMessage = "Unknown analysis error";
    }

    // On failure: preserve the last successful result if one exists
    const failurePatch: Record<string, unknown> = {
      analysisStatus: "failed",
      analysisError: errorMessage,
      updatedAt: now,
    };
    if (prevResult === null) {
      failurePatch.analysisResult = null;
    }
    await db.patch("warehouseDeliveries", args.deliveryId, failurePatch);

    return { status: "failed", error: errorMessage };
  },
});

// ---------------------------------------------------------------------------
// Invoice item → product matching (#3050)
// ---------------------------------------------------------------------------

// Matches each item from a completed invoice analysis against active products
// in the organisation and saves the proposals on the delivery for use in the
// verification screen.  Re-running replaces only matchingProposals — it never
// touches analysisResult or posted deliveries.
export const matchDeliveryItems = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
  },
  handler: async (ctx, args): Promise<MatchingProposals> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>(
      "warehouseDeliveries",
      args.deliveryId,
    );
    if (
      !delivery ||
      String(delivery.organizationId) !== String(args.organizationId)
    ) {
      throw new Error("Delivery not found");
    }
    if (delivery.status !== "draft") {
      throw new Error("Only draft deliveries can be matched");
    }
    if (delivery.analysisStatus !== "completed" || !delivery.analysisResult) {
      throw new Error(
        "Invoice analysis must be completed before matching items",
      );
    }

    const analysis = delivery.analysisResult as StoredAnalysisResult;
    const invoiceItems = Array.isArray(analysis.items)
      ? (analysis.items as ParsedInvoiceItem[])
      : [];

    const productRows = await db
      .query<ProductRow>("products")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .collect();

    const products: ProductForMatching[] = productRows.map((p) => ({
      productId: String(p._id),
      productName: String(p.name),
    }));

    // Load saved name mappings and build a normalized-name → productId Map
    // for priority #1 matching (#3053).
    const mappingRows = await db
      .query("deliveryNameMappings")
      .eq("organizationId", String(args.organizationId))
      .collect();
    const savedMappings = new Map<string, string>(
      mappingRows.map((m) => [
        normalizeName(String(m.invoiceName)),
        String(m.productId),
      ]),
    );

    const proposals = matchInvoiceItems(invoiceItems, products, savedMappings);

    // Write back exact-name matches as saved mappings so future deliveries use
    // priority #1 for the same invoice names.  Saved-mapping results are skipped
    // (they are already persisted); other statuses produce no match to save.
    for (const item of proposals.items) {
      if (item.status !== "matched" || !item.matched) continue;
      if (item.matched.matchReason === "saved_mapping") continue;
      const existing = await db
        .query("deliveryNameMappings")
        .eq("organizationId", String(args.organizationId))
        .eq("invoiceName", item.invoiceName)
        .first();
      if (!existing) {
        await db.insert("deliveryNameMappings", {
          organizationId: String(args.organizationId),
          invoiceName: item.invoiceName,
          productId: item.matched.productId,
          createdAt: Date.now(),
        });
      }
    }

    await db.patch("warehouseDeliveries", args.deliveryId, {
      matchingProposals: proposals,
      updatedAt: Date.now(),
    });

    return proposals;
  },
});

// ---------------------------------------------------------------------------
// saveItemDecisions (#3055)
// ---------------------------------------------------------------------------
// Persists user decisions from the verification screen onto the draft delivery.
// Writes only itemDecisions — never touches analysisResult or matchingProposals.

export const saveItemDecisions = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
    decisions: v.any(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status === "posted") {
      throw new Error("Cannot modify a posted delivery");
    }

    await db.patch("warehouseDeliveries", args.deliveryId, {
      itemDecisions: args.decisions,
      updatedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// postDeliveryFromDecisions (#3073)
// ---------------------------------------------------------------------------
// Posts an existing draft delivery by building delivery lines from the
// approved itemDecisions (persisted by saveItemDecisions).
//
// Validation:
//   - all decisions must be resolved (non-null)
//   - create_later decisions block posting — they must be changed first
// Line creation:
//   - accepted / choose_product → delivery line with OCR quantity + price data
//   - non_inventory → skipped (no stock movement, no line)
// Idempotency: delivery already posted → throws; UI disables during request.

interface ItemDecisionData {
  type: "accepted" | "choose_product" | "create_later" | "non_inventory";
  productId?: string;
  createLaterType?: string;
}

interface ItemDecisionsData {
  decidedAt: number;
  items: (ItemDecisionData | null)[];
}

export const postDeliveryFromDecisions = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    movementsCreated: number;
    nonInventorySkipped: number;
    autoMatchedCount: number;
    newMappingsLearned: number;
  }> => {
    const auth = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status === "posted") {
      throw new Error("Delivery is already posted");
    }

    const decisions = delivery.itemDecisions as ItemDecisionsData | null;
    if (!decisions || !Array.isArray(decisions.items) || decisions.items.length === 0) {
      throw new Error("No item decisions found. Verify all invoice items before posting.");
    }

    const analysis = delivery.analysisResult as StoredAnalysisResult | null;
    const analysisItems: ParsedInvoiceItem[] =
      analysis && Array.isArray(analysis.items)
        ? (analysis.items as ParsedInvoiceItem[])
        : [];

    // Validate: all decisions complete, none are create_later
    const blocking: string[] = [];
    for (let i = 0; i < decisions.items.length; i++) {
      const d = decisions.items[i];
      const name = analysisItems[i]?.productName ?? `#${i + 1}`;
      if (!d) {
        blocking.push(`"${name}"`);
      } else if (d.type === "create_later") {
        blocking.push(`"${name}" (utwórz później)`);
      } else if ((d.type === "accepted" || d.type === "choose_product") && !d.productId) {
        blocking.push(`"${name}" (brak produktu)`);
      }
    }
    if (blocking.length > 0) {
      throw new Error(
        `Nie można zaksięgować dostawy. Nierozwiązane pozycje: ${blocking.join(", ")}.`,
      );
    }

    // Build delivery lines — skip non_inventory, use OCR data for the rest
    const inventoryLines: Array<{
      productId: string;
      quantity: number;
      unitPrice: number | null;
      vatRate: number | null;
      vatCode: string | null;
      unitPriceGross: number | null;
      lineValueNet: number | null;
      lineValueGross: number | null;
      lotNumber: string | null;
      expiryDate: string | null;
    }> = [];

    for (let i = 0; i < decisions.items.length; i++) {
      const d = decisions.items[i]!;
      if (d.type === "non_inventory") continue;

      const ai = analysisItems[i];
      const qty = (ai?.quantity != null && ai.quantity > 0) ? ai.quantity : 1;
      const unitPrice = ai?.unitPrice ?? null;
      const vatRate = ai?.vatRate ?? null;
      const vatCode = ai?.vatCode ?? null;
      const unitPriceGross = ai?.unitPriceGross ?? null;
      const lineValueNet =
        unitPrice !== null ? Math.round(qty * unitPrice * 100) / 100 : null;
      const lineValueGross =
        unitPriceGross !== null ? Math.round(qty * unitPriceGross * 100) / 100 : null;

      inventoryLines.push({
        productId: d.productId!,
        quantity: qty,
        unitPrice,
        vatRate,
        vatCode,
        unitPriceGross,
        lineValueNet,
        lineValueGross,
        lotNumber: ai?.lotNumber ?? null,
        expiryDate: ai?.expiryDate ?? null,
      });
    }

    const now = Date.now();
    let nonInventorySkipped = 0;
    let autoMatchedCount = 0;
    for (const d of decisions.items) {
      if (!d) continue;
      if (d.type === "non_inventory") nonInventorySkipped++;
      else if (d.type === "accepted") autoMatchedCount++;
    }

    // Replace existing items with lines derived from decisions
    const existingItems = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();
    for (const item of existingItems) {
      await db.delete("warehouseDeliveryItems", String(item._id));
    }

    for (const line of inventoryLines) {
      await db.insert("warehouseDeliveryItems", {
        organizationId: String(args.organizationId),
        deliveryId: args.deliveryId,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        vatCode: line.vatCode,
        unitPriceGross: line.unitPriceGross,
        lineValueNet: line.lineValueNet,
        lineValueGross: line.lineValueGross,
        lotNumber: line.lotNumber,
        expiryDate: line.expiryDate,
        movementId: null,
        createdAt: now,
      });
    }

    // Update header totals
    const { net: totalValue, gross: totalValueGross } = computeTotals(inventoryLines);
    await db.patch("warehouseDeliveries", args.deliveryId, {
      totalValue,
      totalValueGross,
      updatedAt: now,
    });

    // Create stock movements
    const newItems = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();

    const locationId = delivery.locationId ? String(delivery.locationId) : null;
    const noteText = delivery.invoiceNumber
      ? `Delivery ${delivery.invoiceNumber}`
      : null;

    for (const item of newItems) {
      const { movementId } = await applyMovementInternal({
        organizationId: String(args.organizationId),
        productId: String(item.productId),
        locationId,
        delta: Number(item.quantity),
        reason: "warehouse_receive",
        sourceType: "warehouse_delivery",
        sourceId: args.deliveryId,
        note: noteText,
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : undefined,
        lotNumber: item.lotNumber ? String(item.lotNumber) : undefined,
        expiryDate: item.expiryDate ? String(item.expiryDate) : undefined,
        performedBy: String(auth.userId),
      });
      await db.patch("warehouseDeliveryItems", String(item._id), { movementId });
    }

    await db.patch("warehouseDeliveries", args.deliveryId, {
      status: "posted",
      updatedAt: Date.now(),
    });

    // Save name mappings from approved decisions (#3077).
    // Only runs after a successful post; skips non_inventory, create_later, and
    // null decisions. Upserts so a manual override replaces the previous mapping.
    let newMappingsLearned = 0;
    const mappingNow = Date.now();
    for (let i = 0; i < decisions.items.length; i++) {
      const d = decisions.items[i]!;
      if (d.type !== "accepted" && d.type !== "choose_product") continue;
      if (!d.productId) continue;
      const ai = analysisItems[i];
      if (!ai?.productName) continue;

      const existing = await db
        .query("deliveryNameMappings")
        .eq("organizationId", String(args.organizationId))
        .eq("invoiceName", ai.productName)
        .first();

      if (!existing) {
        await db.insert("deliveryNameMappings", {
          organizationId: String(args.organizationId),
          invoiceName: ai.productName,
          productId: d.productId,
          createdAt: mappingNow,
        });
        newMappingsLearned++;
      } else if (String(existing.productId) !== String(d.productId)) {
        // User chose a different product — update the existing mapping.
        await db.patch("deliveryNameMappings", String(existing._id), {
          productId: d.productId,
        });
      }
      // Same productId as existing mapping → no-op; avoids redundant writes.
    }

    return { movementsCreated: newItems.length, nonInventorySkipped, autoMatchedCount, newMappingsLearned };
  },
});

export const postDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ movementsCreated: number }> => {
    const auth = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status === "posted") {
      throw new Error("Delivery is already posted");
    }

    const items = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();

    const locationId = delivery.locationId ? String(delivery.locationId) : null;
    const noteText = args.note
      ?? (delivery.invoiceNumber ? `Delivery ${delivery.invoiceNumber}` : null);

    for (const item of items) {
      const { movementId } = await applyMovementInternal({
        organizationId: String(args.organizationId),
        productId: String(item.productId),
        locationId,
        delta: Number(item.quantity),
        reason: "warehouse_receive",
        sourceType: "warehouse_delivery",
        sourceId: args.deliveryId,
        note: noteText,
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : undefined,
        lotNumber: item.lotNumber ? String(item.lotNumber) : undefined,
        expiryDate: item.expiryDate ? String(item.expiryDate) : undefined,
        performedBy: String(auth.userId),
      });
      await db.patch("warehouseDeliveryItems", String(item._id), { movementId });
    }

    await db.patch("warehouseDeliveries", args.deliveryId, {
      status: "posted",
      updatedAt: Date.now(),
    });

    return { movementsCreated: items.length };
  },
});
