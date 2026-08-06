import {
  action,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logAudit } from "../auditLog";
import type { Id } from "../_generated/dataModel";

// VAT multipliers for each Polish fiscal rate code.
// A=23%, B=8%, C=5%, D=ZW (exempt, 0% — applies to medical services).
const VAT_RATES: Record<string, number> = {
  A: 0.23,
  B: 0.08,
  C: 0.05,
  D: 0,
};

// Default PKWiU for health/medical services not otherwise classified.
const DEFAULT_PKWIU = "86.90.19";

interface ReceiptLineItem {
  name: string;
  pkwiu: string;
  quantity: number;
  unitPriceGross: number;
  vatRate: string; // "A"|"B"|"C"|"D"
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

function computeLineItem(
  name: string,
  quantity: number,
  unitPriceGross: number,
  vatRate: string,
  pkwiu?: string,
): ReceiptLineItem {
  const rate = VAT_RATES[vatRate] ?? 0;
  const grossAmount = Math.round(unitPriceGross * quantity * 100) / 100;
  const netAmount = Math.round((grossAmount / (1 + rate)) * 100) / 100;
  const vatAmount = Math.round((grossAmount - netAmount) * 100) / 100;
  return {
    name,
    pkwiu: pkwiu ?? DEFAULT_PKWIU,
    quantity,
    unitPriceGross,
    vatRate,
    netAmount,
    vatAmount,
    grossAmount,
  };
}

function formatPLN(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " zl";
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function paymentMethodPL(method: string): string {
  // Handle compound split-payment methods like "cash+card".
  if (method.includes("+")) {
    return method
      .split("+")
      .map((m) => paymentMethodPL(m.trim()))
      .join(" + ");
  }
  const map: Record<string, string> = {
    cash: "Gotowka",
    card: "Karta platnicza",
    transfer: "Przelew bankowy",
    package: "Pakiet",
    gratis: "Gratis",
    barter: "Barter",
    other: "Inne",
  };
  return map[method] ?? method;
}

/**
 * Returns the next sequential receipt number for the org in the given year.
 * Format: PREFIX/YYYY/NNNNN (e.g. REC/2026/00001, KOR/2026/00001).
 *
 * Delegates to the `next_gabinet_receipt_number` Postgres function (migration
 * 00085) which uses INSERT ... ON CONFLICT DO UPDATE RETURNING for an atomic
 * counter increment — no read-modify-write race condition under concurrent
 * writes (fixes #3766).
 */
async function nextReceiptNumber(
  orgId: string,
  year: number,
  prefix = "REC",
): Promise<string> {
  const db = createSupabaseDb();
  const client = db.raw();
  const { data, error } = await client.rpc("next_gabinet_receipt_number", {
    p_org_id: orgId,
    p_year: year,
    p_prefix: prefix,
  });
  if (error) throw new Error(`nextReceiptNumber: ${error.message}`);
  return data as string;
}

// ---------------------------------------------------------------------------
// PDF generator
// ---------------------------------------------------------------------------

/**
 * Generates a PDF receipt using pdf-lib. Attempts to embed Roboto from Google
 * Fonts (supports Polish diacritics: ą ę ó ś ź ż ć ń ł). Falls back to the
 * built-in Helvetica when the network call fails.
 */
async function buildReceiptPdf(params: {
  receiptNumber: string;
  issuedAt: number;
  organizationName: string;
  organizationNip?: string;
  organizationAddress?: string;
  items: ReceiptLineItem[];
  totalNet: number;
  totalVat: number;
  totalGross: number;
  paymentMethod: string;
  fiscalReceiptId?: string;
}): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

  const pdfDoc = await PDFDocument.create();

  // Embed a font with Latin Extended coverage for Polish characters.
  let font;
  try {
    const fontRes = await fetch(
      "https://fonts.gstatic.com/s/roboto/v32/KFOmCnqEu92Fr1Me5g.ttf",
    );
    if (fontRes.ok) {
      const fontBytes = await fontRes.arrayBuffer();
      font = await pdfDoc.embedFont(fontBytes);
    }
  } catch {
    // Network unreachable — fall through.
  }
  if (!font) {
    font = await pdfDoc.embedStandardFont(StandardFonts.Helvetica);
  }

  const page = pdfDoc.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const draw = (
    text: string,
    x: number,
    yPos: number,
    size = 10,
    color = rgb(0, 0, 0),
  ) => {
    page.drawText(text, { x, y: yPos, size, font, color });
  };

  const hline = (yPos: number) => {
    page.drawLine({
      start: { x: margin, y: yPos },
      end: { x: width - margin, y: yPos },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
  };

  // --- Header: org details ---
  draw(params.organizationName, margin, y, 14, rgb(0.1, 0.1, 0.1));
  y -= 20;
  if (params.organizationNip) {
    draw(`NIP: ${params.organizationNip}`, margin, y, 9, rgb(0.4, 0.4, 0.4));
    y -= 13;
  }
  if (params.organizationAddress) {
    draw(params.organizationAddress, margin, y, 9, rgb(0.4, 0.4, 0.4));
    y -= 13;
  }

  // --- Receipt title ---
  y -= 10;
  hline(y);
  y -= 20;
  draw("PARAGON", margin, y, 20, rgb(0.1, 0.1, 0.1));
  y -= 24;
  draw(`Nr: ${params.receiptNumber}`, margin, y, 10);
  draw(`Data: ${formatDate(params.issuedAt)}`, width / 2, y, 10);
  y -= 16;
  hline(y);

  // --- Items table header ---
  y -= 16;
  const col = {
    lp:        margin,
    name:      margin + 22,
    pkwiu:     margin + 230,
    qty:       margin + 310,
    unitPrice: margin + 342,
    vatRate:   margin + 390,
    net:       margin + 420,
    vatAmt:    margin + 458,
    gross:     margin + 490,
  };

  const grey = rgb(0.35, 0.35, 0.35);
  draw("Lp.", col.lp, y, 7, grey);
  draw("Nazwa uslugi", col.name, y, 7, grey);
  draw("PKWiU", col.pkwiu, y, 7, grey);
  draw("Ilosc", col.qty, y, 7, grey);
  draw("Cena br.", col.unitPrice, y, 7, grey);
  draw("VAT", col.vatRate, y, 7, grey);
  draw("Netto", col.net, y, 7, grey);
  draw("VAT zl", col.vatAmt, y, 7, grey);
  draw("Brutto", col.gross, y, 7, grey);
  y -= 4;
  hline(y);

  // --- Items rows ---
  for (let i = 0; i < params.items.length; i++) {
    const it = params.items[i];
    y -= 14;
    draw(`${i + 1}.`, col.lp, y, 9);
    const name = it.name.length > 30 ? it.name.slice(0, 28) + ".." : it.name;
    draw(name, col.name, y, 9);
    draw(it.pkwiu, col.pkwiu, y, 9);
    draw(String(it.quantity), col.qty, y, 9);
    draw(formatPLN(it.unitPriceGross), col.unitPrice, y, 9);
    const vatLabel =
      it.vatRate === "D"
        ? "ZW"
        : `${Math.round((VAT_RATES[it.vatRate] ?? 0) * 100)}%`;
    draw(vatLabel, col.vatRate, y, 9);
    draw(formatPLN(it.netAmount), col.net, y, 9);
    draw(formatPLN(it.vatAmount), col.vatAmt, y, 9);
    draw(formatPLN(it.grossAmount), col.gross, y, 9);
  }

  // --- Totals ---
  y -= 6;
  hline(y);
  y -= 16;
  draw("RAZEM:", col.vatRate - 50, y, 10);
  draw(formatPLN(params.totalNet), col.net, y, 10);
  draw(formatPLN(params.totalVat), col.vatAmt, y, 10);
  draw(formatPLN(params.totalGross), col.gross, y, 10);
  y -= 4;
  hline(y);

  // --- Payment method ---
  y -= 18;
  draw(
    `Forma platnosci: ${paymentMethodPL(params.paymentMethod)}`,
    margin,
    y,
    10,
  );

  // --- Fiscal receipt reference ---
  if (params.fiscalReceiptId) {
    y -= 14;
    draw(
      `Nr paragonu fiskalnego: ${params.fiscalReceiptId}`,
      margin,
      y,
      9,
      rgb(0.4, 0.4, 0.4),
    );
  }

  // --- Footer ---
  y -= 30;
  draw(
    "Dokument wystawiony zgodnie z ustawa o podatku od towarow i uslug.",
    margin,
    y,
    7,
    rgb(0.6, 0.6, 0.6),
  );

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Internal: fetch org name from Convex native DB (organizations stay in Convex)
// ---------------------------------------------------------------------------

export const _getOrgName = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    return (org as Record<string, unknown> | null)?.name as string | undefined;
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: store PDF in Convex file storage + insert receipt row
// ---------------------------------------------------------------------------

export const _storePdfAndCreateReceipt = internalMutation({
  args: {
    pdfData: v.bytes(),
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    appointmentId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    receiptNumber: v.string(),
    issuedAt: v.number(),
    organizationName: v.string(),
    organizationNip: v.optional(v.string()),
    organizationAddress: v.optional(v.string()),
    totalNet: v.number(),
    totalVat: v.number(),
    totalGross: v.number(),
    paymentMethod: v.string(),
    itemsJson: v.string(),
    fiscalReceiptId: v.optional(v.string()),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const blob = new Blob([args.pdfData], { type: "application/pdf" });
    const storageId = await ctx.storage.store(blob);
    const pdfUrl = await ctx.storage.getUrl(storageId);

    const db = createSupabaseDb();
    const now = Date.now();
    const receiptId = await db.insert("gabinetReceipts", {
      organizationId: args.organizationId as string,
      paymentId: args.paymentId,
      appointmentId: args.appointmentId ?? null,
      patientId: args.patientId ?? null,
      receiptNumber: args.receiptNumber,
      issuedAt: args.issuedAt,
      organizationName: args.organizationName,
      organizationNip: args.organizationNip ?? null,
      organizationAddress: args.organizationAddress ?? null,
      totalNet: args.totalNet,
      totalVat: args.totalVat,
      totalGross: args.totalGross,
      paymentMethod: args.paymentMethod,
      itemsJson: args.itemsJson,
      fiscalReceiptId: args.fiscalReceiptId ?? null,
      pdfStorageId: storageId,
      pdfUrl: pdfUrl ?? null,
      createdBy: args.createdBy as string,
      createdAt: now,
      updatedAt: now,
    });

    return { receiptId, pdfUrl: pdfUrl ?? "" };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: write audit log entry
// ---------------------------------------------------------------------------

export const _auditReceiptGenerated = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    receiptId: v.string(),
    paymentId: v.string(),
    receiptNumber: v.string(),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "receipt_pdf_generated",
      entityType: "payment",
      entityId: args.paymentId,
      details: JSON.stringify({
        receiptId: args.receiptId,
        receiptNumber: args.receiptNumber,
      }),
    });
  },
});

// ---------------------------------------------------------------------------
// Public action: generate (or retrieve) PDF receipt for a payment
// ---------------------------------------------------------------------------

/**
 * Generates a PDF receipt for a completed gabinet payment and stores it in
 * Convex file storage. Creates a `gabinet_receipts` row with all data required
 * by Polish fiscal law so the document can be verified or re-downloaded later.
 *
 * Idempotent: if a receipt already exists for `paymentId` the existing record
 * is returned without re-generating the PDF.
 *
 * Requires gabinet_receipts.create permission.
 */
export const generatePdfReceipt = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    /** NIP (tax ID) of the issuing organisation. Printed on the PDF. */
    organizationNip: v.optional(v.string()),
    /** Single-line address of the issuing organisation. */
    organizationAddress: v.optional(v.string()),
    /**
     * Line items with VAT breakdown. If omitted a single "Usługa medyczna"
     * line is generated for the full payment amount at rate D (ZW exempt).
     */
    items: v.optional(
      v.array(
        v.object({
          name: v.string(),
          pkwiu: v.optional(v.string()),
          quantity: v.number(),
          unitPriceGross: v.number(),
          vatRate: v.union(
            v.literal("A"),
            v.literal("B"),
            v.literal("C"),
            v.literal("D"),
          ),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    // --- Auth + permission ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_receipts",
        action: "create",
      },
    );
    if (!perm.allowed) {
      throw new Error("Not authorised to generate PDF receipts");
    }

    // --- Load payment ---
    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (
      !payment ||
      String(payment.organizationId) !== String(args.organizationId)
    ) {
      throw new Error("Payment not found");
    }
    if (payment.status !== "completed") {
      throw new Error(
        "PDF receipt can only be generated for a completed payment",
      );
    }

    // --- Idempotency: return existing receipt without regenerating ---
    const client = db.raw();
    const { data: existing } = await client
      .from("gabinet_receipts")
      .select("id, pdf_url, receipt_number")
      .eq("payment_id", args.paymentId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return {
        receiptId: existing.id as string,
        pdfUrl: (existing.pdf_url as string | null) ?? "",
        receiptNumber: existing.receipt_number as string,
      };
    }

    // --- Org name from Convex native DB ---
    const orgName =
      (await ctx.runQuery(internal.gabinet.receipts._getOrgName, {
        organizationId: args.organizationId,
      })) ?? "Placówka medyczna";

    // --- Build line items ---
    const now = Date.now();
    const year = new Date(now).getFullYear();

    const lineItems: ReceiptLineItem[] = args.items
      ? args.items.map((it) =>
          computeLineItem(
            it.name,
            it.quantity,
            it.unitPriceGross,
            it.vatRate,
            it.pkwiu,
          ),
        )
      : [
          computeLineItem(
            "Usluga medyczna",
            1,
            payment.amount as number,
            "D",
            DEFAULT_PKWIU,
          ),
        ];

    const totalGross =
      Math.round(lineItems.reduce((s, i) => s + i.grossAmount, 0) * 100) / 100;
    const totalNet =
      Math.round(lineItems.reduce((s, i) => s + i.netAmount, 0) * 100) / 100;
    const totalVat =
      Math.round(lineItems.reduce((s, i) => s + i.vatAmount, 0) * 100) / 100;

    // --- Sequential receipt number ---
    const receiptNumber = await nextReceiptNumber(
      String(args.organizationId),
      year,
    );

    // --- Generate PDF bytes ---
    const pdfBytes = await buildReceiptPdf({
      receiptNumber,
      issuedAt: now,
      organizationName: orgName,
      organizationNip: args.organizationNip,
      organizationAddress: args.organizationAddress,
      items: lineItems,
      totalNet,
      totalVat,
      totalGross,
      paymentMethod: payment.paymentMethod as string,
      fiscalReceiptId:
        (payment.fiscalReceiptId as string | null | undefined) ?? undefined,
    });

    // --- Store PDF + persist receipt record ---
    const { receiptId, pdfUrl } = await ctx.runMutation(
      internal.gabinet.receipts._storePdfAndCreateReceipt,
      {
        pdfData: pdfBytes.buffer as ArrayBuffer,
        organizationId: args.organizationId,
        paymentId: args.paymentId,
        appointmentId:
          (payment.appointmentId as string | null | undefined) ?? undefined,
        patientId:
          (payment.patientId as string | null | undefined) ?? undefined,
        receiptNumber,
        issuedAt: now,
        organizationName: orgName,
        organizationNip: args.organizationNip,
        organizationAddress: args.organizationAddress,
        totalNet,
        totalVat,
        totalGross,
        paymentMethod: payment.paymentMethod as string,
        itemsJson: JSON.stringify(lineItems),
        fiscalReceiptId:
          (payment.fiscalReceiptId as string | null | undefined) ?? undefined,
        createdBy: authResult.userId,
      },
    );

    // --- Audit log (best-effort) ---
    try {
      await ctx.runMutation(internal.gabinet.receipts._auditReceiptGenerated, {
        organizationId: args.organizationId,
        userId: authResult.userId,
        receiptId,
        paymentId: args.paymentId,
        receiptNumber,
      });
    } catch {
      // non-critical
    }

    return { receiptId, pdfUrl, receiptNumber };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: auto-create a gabinet_receipts row for a payment.
// Scheduled via ctx.scheduler from convex/payments.ts after each completed
// payment so that every payment path produces a receipt record.
// ---------------------------------------------------------------------------

export const _createReceiptRowForPayment = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    // When true: void the existing issued receipt and create a KOR correction.
    isRefund: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const client = db.raw();

    // Skip if a receipt already exists for this payment (normal path).
    const { data: existing } = await client
      .from("gabinet_receipts")
      .select("id, status")
      .eq("payment_id", args.paymentId)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && !args.isRefund) return;

    const payment = await db.get("payments", args.paymentId);
    if (!payment) return;

    // Skip zero-amount payments (fully credit-covered visits; no money changed hands).
    const amount = payment.amount as number;
    if (!args.isRefund && amount <= 0) return;

    const orgDoc = await ctx.db.get(args.organizationId);
    const orgName =
      (orgDoc as Record<string, unknown> | null)?.name as string ??
      "Placówka medyczna";

    const now = Date.now();
    const year = new Date(now).getFullYear();

    if (args.isRefund) {
      // Void the most recent issued receipt for this payment.
      if (existing && (existing as Record<string, unknown>).status === "issued") {
        await client
          .from("gabinet_receipts")
          .update({ status: "void", updated_at: now })
          .eq("id", (existing as Record<string, unknown>).id as string);
      }

      // Correction receipt with negative amounts (KOR/ prefix).
      const lineItem = computeLineItem(
        "Korekta: Usluga medyczna",
        1,
        -Math.abs(amount),
        "D",
        DEFAULT_PKWIU,
      );
      const receiptNumber = await nextReceiptNumber(
        String(args.organizationId),
        year,
        "KOR",
      );
      await db.insert("gabinetReceipts", {
        organizationId: String(args.organizationId),
        paymentId: args.paymentId,
        appointmentId: (payment.appointmentId as string | null) ?? null,
        patientId: (payment.patientId as string | null) ?? null,
        receiptNumber,
        issuedAt: now,
        organizationName: orgName,
        totalNet: lineItem.netAmount,
        totalVat: lineItem.vatAmount,
        totalGross: lineItem.grossAmount,
        paymentMethod: payment.paymentMethod as string,
        itemsJson: JSON.stringify([lineItem]),
        fiscalReceiptId: null,
        createdBy: String(args.createdBy),
        createdAt: now,
        updatedAt: now,
      });
      return;
    }

    // Normal receipt for a completed payment.
    const lineItem = computeLineItem(
      "Usluga medyczna",
      1,
      amount,
      "D",
      DEFAULT_PKWIU,
    );
    const receiptNumber = await nextReceiptNumber(
      String(args.organizationId),
      year,
    );
    await db.insert("gabinetReceipts", {
      organizationId: String(args.organizationId),
      paymentId: args.paymentId,
      appointmentId: (payment.appointmentId as string | null) ?? null,
      patientId: (payment.patientId as string | null) ?? null,
      receiptNumber,
      issuedAt: now,
      organizationName: orgName,
      totalNet: lineItem.netAmount,
      totalVat: lineItem.vatAmount,
      totalGross: lineItem.grossAmount,
      paymentMethod: payment.paymentMethod as string,
      itemsJson: JSON.stringify([lineItem]),
      fiscalReceiptId: (payment.fiscalReceiptId as string | null) ?? null,
      createdBy: String(args.createdBy),
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// Internal mutation: create ONE consolidated receipt for a split payment.
//
// Polish fiscal law requires a single receipt per transaction, regardless of
// how many payment methods are used. `splitMarkPaid` creates two payment rows
// (one per method) but must produce only one receipt document (issue #3768).
//
// The receipt is linked to the primary (original) payment row and records the
// combined payment method as "firstMethod+secondMethod" (e.g. "cash+card").
// The secondary payment row never gets its own receipt row.
// ---------------------------------------------------------------------------

export const _createSplitReceiptRow = internalMutation({
  args: {
    primaryPaymentId: v.string(),
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    firstMethod: v.string(),
    firstAmount: v.number(),
    secondMethod: v.string(),
    secondAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const client = db.raw();

    // Idempotency: skip if a receipt already exists for the primary payment.
    const { data: existing } = await client
      .from("gabinet_receipts")
      .select("id")
      .eq("payment_id", args.primaryPaymentId)
      .limit(1)
      .maybeSingle();

    if (existing) return;

    const primaryPayment = await db.get("payments", args.primaryPaymentId);
    if (!primaryPayment) return;

    const orgDoc = await ctx.db.get(args.organizationId);
    const orgName =
      (orgDoc as Record<string, unknown> | null)?.name as string ??
      "Placówka medyczna";

    const now = Date.now();
    const year = new Date(now).getFullYear();

    // Full transaction amount is the sum of both legs.
    const totalAmount =
      Math.round((args.firstAmount + args.secondAmount) * 100) / 100;
    const lineItem = computeLineItem(
      "Usluga medyczna",
      1,
      totalAmount,
      "D",
      DEFAULT_PKWIU,
    );
    const receiptNumber = await nextReceiptNumber(
      String(args.organizationId),
      year,
    );

    // Combined method string (e.g. "cash+card") signals a split transaction.
    // paymentMethodPL() in the PDF builder handles the "+" separator.
    const paymentMethod = `${args.firstMethod}+${args.secondMethod}`;

    await db.insert("gabinetReceipts", {
      organizationId: String(args.organizationId),
      paymentId: args.primaryPaymentId,
      appointmentId: (primaryPayment.appointmentId as string | null) ?? null,
      patientId: (primaryPayment.patientId as string | null) ?? null,
      receiptNumber,
      issuedAt: now,
      organizationName: orgName,
      totalNet: lineItem.netAmount,
      totalVat: lineItem.vatAmount,
      totalGross: lineItem.grossAmount,
      paymentMethod,
      itemsJson: JSON.stringify([lineItem]),
      fiscalReceiptId: null,
      createdBy: String(args.createdBy),
      createdAt: now,
      updatedAt: now,
    });
  },
});
