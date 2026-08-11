import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

export const NO_LOCATION = "__none__";

export const VAT_OPTIONS = [
  { code: "23", label: "23%", rate: 23 },
  { code: "8",  label: "8%",  rate: 8 },
  { code: "5",  label: "5%",  rate: 5 },
  { code: "0",  label: "0%",  rate: 0 },
  { code: "zw", label: "zw.", rate: 0 },
  { code: "np", label: "np.", rate: 0 },
] as const;

export type VatCode = typeof VAT_OPTIONS[number]["code"];

export function vatRate(code: string): number | undefined {
  return VAT_OPTIONS.find((o) => o.code === code)?.rate;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function grossFromNet(net: number, code: string): string {
  const rate = vatRate(code);
  if (rate === undefined) return "";
  return String(round2(net * (1 + rate / 100)));
}

export function netFromGross(gross: number, code: string): string {
  const rate = vatRate(code);
  if (rate === undefined) return "";
  if (rate === 0) return String(gross);
  return String(round2(gross / (1 + rate / 100)));
}

export interface LineItem {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;       // net
  vatCode: string;
  unitPriceGross: string;  // gross
  lastEdited: "net" | "gross" | null;
  lotNumber: string;
  expiryDate: string;
}

export function newLine(): LineItem {
  return {
    id: crypto.randomUUID(),
    productId: "",
    quantity: "",
    unitPrice: "",
    vatCode: "",
    unitPriceGross: "",
    lastEdited: null,
    lotNumber: "",
    expiryDate: "",
  };
}

export function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : null;
}

// ---------------------------------------------------------------------------
// Local types mirroring backend invoiceMatching.ts (no cross-boundary import)
// ---------------------------------------------------------------------------

export interface ProductCandidate {
  productId: string;
  productName: string;
  matchReason: string;
}

export interface ItemMatchResult {
  invoiceName: string;
  status: "matched" | "suggestions" | "unmatched" | "non_inventory_candidate";
  matched?: ProductCandidate;
  suggestions?: ProductCandidate[];
  handlingHint?: string;
}

export interface MatchingProposalsFE {
  matchedAt: number;
  items: ItemMatchResult[];
}

export interface ParsedInvoiceItemFE {
  productName: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  vatCode: string | null;
  unitPriceGross: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
}

// ---------------------------------------------------------------------------
// Types for item decisions (#3055)
// ---------------------------------------------------------------------------

export type DecisionType = "accepted" | "choose_product" | "create_later" | "non_inventory";
export type CreateLaterType = "treatment_product" | "disposable" | "sale_product" | "consumable";

export interface ItemDecision {
  type: DecisionType;
  productId?: string;
  createLaterType?: CreateLaterType;
}

export interface ItemDecisions {
  decidedAt: number;
  items: (ItemDecision | null)[];
}

export interface PostDeliveryResult {
  movementsCreated: number;
  nonInventorySkipped: number;
  autoMatchedCount: number;
  newMappingsLearned: number;
}

export function isDecisionComplete(d: ItemDecision | null): boolean {
  if (!d) return false;
  if (d.type === "non_inventory") return true;
  if (d.type === "create_later") return !!d.createLaterType;
  return !!d.productId;
}

export function statusBadge(status: string, t: ReturnType<typeof useTranslation>["t"]) {
  if (status === "posted") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
        {t("gabinet.deliveries.status.posted", "Zaksięgowana")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
      {t("gabinet.deliveries.status.draft", "Robocza")}
    </Badge>
  );
}

export function formatDate(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("pl-PL");
}

export function fmtMoney(n: number) {
  return n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
