import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logAudit } from "../auditLog";

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
 * Atomically increments the receipt sequence counter and inserts a new
 * gabinet_receipts row in a single Postgres transaction (migration 00088,
 * issue #3793).
 *
 * Previously the sequence was incremented before blob storage and the DB
 * insert, so a failure at either step consumed a counter value without
 * producing a receipt — a gap in the legally-required sequential numbering.
 * The new Postgres function runs both operations in one transaction: if the
 * INSERT fails, the counter UPDATE is rolled back automatically.
 */
async function insertReceiptWithAtomicNumber(params: {
  orgId: string;
  year: number;
  prefix: string;
  locationId?: string | null;
  paymentId: string;
  appointmentId?: string | null;
  patientId?: string | null;
  issuedAt: number;
  organizationName: string;
  organizationNip?: string | null;
  organizationAddress?: string | null;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  paymentMethod: string;
  itemsJson: string;
  fiscalReceiptId?: string | null;
  receiptType: string;
  pdfStorageId?: string | null;
  pdfUrl?: string | null;
  createdBy: string;
  now: number;
}): Promise<{ receiptId: string; receiptNumber: string }> {
  const db = createSupabaseDb();
  const client = db.raw();
  const { data, error } = await client.rpc(
    "insert_gabinet_receipt_with_number",
    {
      p_org_id:               params.orgId,
      p_year:                 params.year,
      p_prefix:               params.prefix,
      p_location_id:          params.locationId ?? null,
      p_payment_id:           params.paymentId,
      p_appointment_id:       params.appointmentId ?? null,
      p_patient_id:           params.patientId ?? null,
      p_issued_at:            params.issuedAt,
      p_organization_name:    params.organizationName,
      p_organization_nip:     params.organizationNip ?? null,
      p_organization_address: params.organizationAddress ?? null,
      p_total_net:            params.totalNet,
      p_total_vat:            params.totalVat,
      p_total_gross:          params.totalGross,
      p_payment_method:       params.paymentMethod,
      p_items_json:           params.itemsJson,
      p_fiscal_receipt_id:    params.fiscalReceiptId ?? null,
      p_receipt_type:         params.receiptType,
      p_pdf_storage_id:       params.pdfStorageId ?? null,
      p_pdf_url:              params.pdfUrl ?? null,
      p_created_by:           params.createdBy,
      p_now:                  params.now,
    },
  );
  if (error) throw new Error(`insertReceiptWithAtomicNumber: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as
    | { receipt_id: string; receipt_number: string }
    | null
    | undefined;
  if (!row) throw new Error("insertReceiptWithAtomicNumber: no row returned");
  return { receiptId: row.receipt_id, receiptNumber: row.receipt_number };
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
// Internal action: generate PDF receipt + store blob + insert receipt row
// Receipt number is incremented here (not in the caller) so the sequence
// counter is only consumed when all three steps succeed (#3790).
// ---------------------------------------------------------------------------

export const _storePdfAndCreateReceipt = internalAction({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    appointmentId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    // Sequence parameters — receipt number is generated atomically with the
    // DB insert via insert_gabinet_receipt_with_number (no gap on failure).
    prefix: v.optional(v.string()),
    locationId: v.optional(v.string()),
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
    // Idempotency guard: if a receipt already exists for this payment do not
    // consume another sequence number. This prevents gaps when
    // generatePdfReceipt retries after a partial _storePdfAndCreateReceipt
    // failure — the outer idempotency check would pass (no committed row) but
    // this inner check catches the same case right before the counter is
    // incremented (#3791).
    const dbCheck = createSupabaseDb();
    const clientCheck = dbCheck.raw();
    const { data: existingReceipt } = await clientCheck
      .from("gabinet_receipts")
      .select("id, pdf_url, receipt_number")
      .eq("payment_id", args.paymentId)
      .limit(1)
      .maybeSingle();
    if (existingReceipt) {
      return {
        receiptId: existingReceipt.id as string,
        pdfUrl: (existingReceipt.pdf_url as string | null) ?? "",
        receiptNumber: existingReceipt.receipt_number as string,
      };
    }

    // Atomically increment the sequence counter and insert the receipt row in
    // one Postgres transaction (#3793).  The counter is only consumed when the
    // row is successfully committed — if the INSERT fails, Postgres rolls back
    // the UPDATE to gabinet_receipt_sequences, leaving no gap.
    // PDF generation is deferred until after the row exists so the receipt
    // number printed on the PDF matches the committed DB row exactly.
    const year = new Date(args.issuedAt).getFullYear();
    const lineItems = JSON.parse(args.itemsJson) as ReceiptLineItem[];
    const now = Date.now();

    const { receiptId, receiptNumber } = await insertReceiptWithAtomicNumber({
      orgId:              String(args.organizationId),
      year,
      prefix:             args.prefix ?? "REC",
      locationId:         args.locationId,
      paymentId:          args.paymentId,
      appointmentId:      args.appointmentId,
      patientId:          args.patientId,
      issuedAt:           args.issuedAt,
      organizationName:   args.organizationName,
      organizationNip:    args.organizationNip,
      organizationAddress: args.organizationAddress,
      totalNet:           args.totalNet,
      totalVat:           args.totalVat,
      totalGross:         args.totalGross,
      paymentMethod:      args.paymentMethod,
      itemsJson:          args.itemsJson,
      fiscalReceiptId:    args.fiscalReceiptId,
      receiptType:        "original",
      pdfStorageId:       null,
      pdfUrl:             null,
      createdBy:          args.createdBy as string,
      now,
    });

    // Generate and store the PDF now that we have the committed receipt number.
    const pdfBytes = await buildReceiptPdf({
      receiptNumber,
      issuedAt: args.issuedAt,
      organizationName: args.organizationName,
      organizationNip: args.organizationNip,
      organizationAddress: args.organizationAddress,
      items: lineItems,
      totalNet: args.totalNet,
      totalVat: args.totalVat,
      totalGross: args.totalGross,
      paymentMethod: args.paymentMethod,
      fiscalReceiptId: args.fiscalReceiptId,
    });

    const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const storageId = await ctx.storage.store(blob);
    const pdfUrl = await ctx.storage.getUrl(storageId);

    // Back-fill pdf_storage_id and pdf_url on the receipt row. This is best-
    // effort: the receipt row and sequence number are already committed, so a
    // failure here only means the PDF link is missing (not a sequence gap).
    try {
      const dbPdf = createSupabaseDb();
      await dbPdf.raw()
        .from("gabinet_receipts")
        .update({ pdf_storage_id: storageId, pdf_url: pdfUrl, updated_at: now })
        .eq("id", receiptId);
    } catch {
      // Non-fatal: the receipt row exists, PDF can be regenerated on demand.
    }

    return { receiptId, pdfUrl: pdfUrl ?? "", receiptNumber };
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
  handler: async (ctx, args): Promise<{receiptId: string; pdfUrl: string; receiptNumber: string}> => {
    // --- Auth + permission ---
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    ) as {userId: Id<"users">};
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
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

    // --- Split payment detection ---
    // The primary leg of a split payment has "split:" in notes and holds only
    // firstMethod/firstAmount. Detect this and consolidate with the secondary
    // leg so the PDF shows the full amount and combined method — matching what
    // _createSplitReceiptRow would have stored in the normal flow.
    let resolvedAmount = payment.amount as number;
    let resolvedPaymentMethod = payment.paymentMethod as string;

    const isSplitLeg =
      typeof payment.notes === "string" &&
      (payment.notes as string).includes("split:");

    if (isSplitLeg) {
      let q = client
        .from("payments")
        .select("amount, payment_method")
        .eq("organization_id", String(args.organizationId))
        .eq("status", "completed")
        .eq("paid_at", payment.paidAt as number)
        .neq("id", args.paymentId)
        .like("notes", "%split:%");
      const apptId = payment.appointmentId as string | null | undefined;
      const pkgId = payment.packageUsageId as string | null | undefined;
      if (apptId) q = q.eq("appointment_id", apptId);
      else if (pkgId) q = q.eq("package_usage_id", pkgId);
      const { data: sibling } = await q.limit(1).maybeSingle();
      if (sibling) {
        const s = sibling as Record<string, unknown>;
        resolvedAmount =
          Math.round(
            ((payment.amount as number) + (s.amount as number)) * 100,
          ) / 100;
        resolvedPaymentMethod = `${payment.paymentMethod as string}+${s.payment_method as string}`;
      }
    }

    // --- Org name from Convex native DB ---
    const orgName: string =
      (await ctx.runQuery(internal.gabinet.receipts._getOrgName, {
        organizationId: args.organizationId,
      })) ?? "Placówka medyczna";

    // --- Build line items ---
    const now = Date.now();

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
            resolvedAmount,
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

    // --- Store PDF + persist receipt record ---
    // The sequence number is generated inside _storePdfAndCreateReceipt so it
    // is only incremented when the full write (PDF generation + blob storage +
    // DB insert) succeeds, preventing gaps on partial failures (#3790).
    const { receiptId, pdfUrl, receiptNumber } = await ctx.runAction(
      internal.gabinet.receipts._storePdfAndCreateReceipt,
      {
        organizationId: args.organizationId,
        paymentId: args.paymentId,
        appointmentId:
          (payment.appointmentId as string | null | undefined) ?? undefined,
        patientId:
          (payment.patientId as string | null | undefined) ?? undefined,
        issuedAt: now,
        organizationName: orgName,
        organizationNip: args.organizationNip,
        organizationAddress: args.organizationAddress,
        totalNet,
        totalVat,
        totalGross,
        paymentMethod: resolvedPaymentMethod,
        itemsJson: JSON.stringify(lineItems),
        fiscalReceiptId:
          (payment.fiscalReceiptId as string | null | undefined) ?? undefined,
        createdBy: authResult.userId,
      },
    ) as {receiptId: string; pdfUrl: string; receiptNumber: string};

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
// Internal action: back-fill pdf_storage_id / pdf_url on orphaned receipt rows.
//
// A receipt row can end up with pdf_url = NULL when blob storage fails after
// the atomic Postgres insert (issue #3797). This action finds up to 50 such
// rows and regenerates their PDFs from the data already committed to the DB —
// all fields required to reproduce the PDF are stored in each row at issuance
// time. Designed to be called from a cron job (crons.ts, hourly). Idempotent:
// rows that already have a pdf_url are skipped by the Postgres query filter.
// ---------------------------------------------------------------------------

export const _backfillOrphanedPdfReceipts = internalAction({
  args: {},
  handler: async (ctx) => {
    const db = createSupabaseDb();
    const client = db.raw();

    const { data: orphans } = await client
      .from("gabinet_receipts")
      .select(
        "id, receipt_number, issued_at, organization_name, organization_nip, organization_address, total_net, total_vat, total_gross, payment_method, items_json, fiscal_receipt_id",
      )
      .is("pdf_url", null)
      .is("pdf_storage_id", null)
      .eq("status", "issued")
      .limit(50);

    if (!orphans || orphans.length === 0) return { processed: 0 };

    let processed = 0;
    const now = Date.now();

    for (const row of orphans as Record<string, unknown>[]) {
      try {
        const lineItems = JSON.parse(row.items_json as string) as ReceiptLineItem[];
        const pdfBytes = await buildReceiptPdf({
          receiptNumber:     row.receipt_number as string,
          issuedAt:          Number(row.issued_at),
          organizationName:  row.organization_name as string,
          organizationNip:   (row.organization_nip as string | null) ?? undefined,
          organizationAddress: (row.organization_address as string | null) ?? undefined,
          items:             lineItems,
          totalNet:          Number(row.total_net),
          totalVat:          Number(row.total_vat),
          totalGross:        Number(row.total_gross),
          paymentMethod:     row.payment_method as string,
          fiscalReceiptId:   (row.fiscal_receipt_id as string | null) ?? undefined,
        });

        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        const storageId = await ctx.storage.store(blob);
        const pdfUrl = await ctx.storage.getUrl(storageId);

        await client
          .from("gabinet_receipts")
          .update({ pdf_storage_id: storageId, pdf_url: pdfUrl, updated_at: now })
          .eq("id", row.id as string);

        processed++;
      } catch {
        // Continue to the next orphan; transient failures are retried next run.
      }
    }

    return { processed };
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
      .select("id, status, payment_method, total_gross")
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
      const existingRec = existing as Record<string, unknown> | null;

      // A split consolidated receipt has payment_method "firstMethod+secondMethod"
      // and total_gross covering both legs. Detect it so we can (a) use the
      // correct full amount for the KOR document and (b) refund the secondary
      // payment leg that has no receipt of its own.
      const isSplitReceipt =
        typeof existingRec?.payment_method === "string" &&
        (existingRec.payment_method as string).includes("+");

      // Void the most recent issued receipt for this payment. Guard is
      // "not already void" so that rows without an explicit status (legacy
      // receipts created before the status column existed) are also voided.
      if (existingRec && existingRec.status !== "void") {
        await client
          .from("gabinet_receipts")
          .update({ status: "void", updated_at: now })
          .eq("id", existingRec.id as string);
      }

      // For a consolidated split receipt total_gross covers both legs, so the
      // KOR must reverse the full transaction amount, not just one leg's amount.
      const korAmount = existingRec
        ? Math.abs(Number(existingRec.total_gross))
        : Math.abs(amount);
      const korPaymentMethod = isSplitReceipt
        ? (existingRec!.payment_method as string)
        : (payment.paymentMethod as string);

      // Correction receipt with negative amounts (KOR/ prefix).
      const lineItem = computeLineItem(
        "Korekta: Usluga medyczna",
        1,
        -korAmount,
        "D",
        DEFAULT_PKWIU,
      );
      await insertReceiptWithAtomicNumber({
        orgId:           String(args.organizationId),
        year,
        prefix:          "KOR",
        locationId:      null,
        paymentId:       args.paymentId,
        appointmentId:   (payment.appointmentId as string | null) ?? null,
        patientId:       (payment.patientId as string | null) ?? null,
        issuedAt:        now,
        organizationName: orgName,
        totalNet:        lineItem.netAmount,
        totalVat:        lineItem.vatAmount,
        totalGross:      lineItem.grossAmount,
        paymentMethod:   korPaymentMethod,
        itemsJson:       JSON.stringify([lineItem]),
        receiptType:     "correction",
        createdBy:       String(args.createdBy),
        now,
      });

      // When voiding a consolidated split receipt, mark the secondary payment
      // leg as refunded so both rows share consistent status. The secondary
      // shares the same paidAt timestamp as the primary and always has
      // "split:" in its notes. Narrow further by appointmentId or
      // packageUsageId when available to guard against astronomically
      // unlikely same-millisecond collisions between separate transactions.
      if (isSplitReceipt) {
        let q = client
          .from("payments")
          .select("id")
          .eq("organization_id", String(args.organizationId))
          .eq("status", "completed")
          .eq("paid_at", payment.paidAt as number)
          .neq("id", args.paymentId)
          .like("notes", "%split:%");
        const apptId = payment.appointmentId as string | null;
        const pkgId = payment.packageUsageId as string | null;
        if (apptId) q = q.eq("appointment_id", apptId);
        else if (pkgId) q = q.eq("package_usage_id", pkgId);
        const { data: secondaryRows } = await q;
        for (const sp of secondaryRows ?? []) {
          await client
            .from("payments")
            .update({ status: "refunded", updated_at: now })
            .eq("id", (sp as Record<string, unknown>).id as string);
        }
      }

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
    await insertReceiptWithAtomicNumber({
      orgId:           String(args.organizationId),
      year,
      prefix:          "REC",
      locationId:      null,
      paymentId:       args.paymentId,
      appointmentId:   (payment.appointmentId as string | null) ?? null,
      patientId:       (payment.patientId as string | null) ?? null,
      issuedAt:        now,
      organizationName: orgName,
      totalNet:        lineItem.netAmount,
      totalVat:        lineItem.vatAmount,
      totalGross:      lineItem.grossAmount,
      paymentMethod:   payment.paymentMethod as string,
      itemsJson:       JSON.stringify([lineItem]),
      fiscalReceiptId: (payment.fiscalReceiptId as string | null) ?? null,
      receiptType:     "original",
      createdBy:       String(args.createdBy),
      now,
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
    // Combined method string (e.g. "cash+card") signals a split transaction.
    // paymentMethodPL() in the PDF builder handles the "+" separator.
    const paymentMethod = `${args.firstMethod}+${args.secondMethod}`;

    await insertReceiptWithAtomicNumber({
      orgId:           String(args.organizationId),
      year,
      prefix:          "REC",
      locationId:      null,
      paymentId:       args.primaryPaymentId,
      appointmentId:   (primaryPayment.appointmentId as string | null) ?? null,
      patientId:       (primaryPayment.patientId as string | null) ?? null,
      issuedAt:        now,
      organizationName: orgName,
      totalNet:        lineItem.netAmount,
      totalVat:        lineItem.vatAmount,
      totalGross:      lineItem.grossAmount,
      paymentMethod,
      itemsJson:       JSON.stringify([lineItem]),
      receiptType:     "original",
      createdBy:       String(args.createdBy),
      now,
    });
  },
});
