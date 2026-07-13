// Invoice item → product matching engine (#3050).
//
// Pure functions: no I/O, no side-effects. The calling action is responsible
// for loading products and persisting the result.
//
// Matching priority (per issue #3050 spec):
//   1. Saved name mappings       — reserved for a future phase (not yet stored)
//   2. Exact name match          → status "matched"
//   3. Similar name (Jaccard ≥ 0.5) → status "suggestions"
//   4. Non-inventory keyword     → status "non_inventory_candidate"
//   5. No match                  → status "unmatched"
//
// Normalization is intentionally conservative: only whitespace collapsing,
// lowercasing, and simple punctuation removal. Capacity, size, and variant
// tokens ("XL", "1 ml", "2 ml") are preserved so "Stylage XL" does NOT
// auto-match "Stylage M".

import type { ParsedInvoiceItem } from "./documentAnalyzer";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProductCandidate {
  productId: string;
  productName: string;
  matchReason: "exact_name" | "similar_name";
}

export type ItemMatchStatus =
  | "matched"
  | "suggestions"
  | "unmatched"
  | "non_inventory_candidate";

export interface ItemMatchResult {
  invoiceName: string;
  status: ItemMatchStatus;
  matched?: ProductCandidate;
  suggestions?: ProductCandidate[];
  handlingHint?: string;
}

export interface MatchingProposals {
  matchedAt: number;
  items: ItemMatchResult[];
}

export interface ProductForMatching {
  productId: string;
  productName: string;
}

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

// Safe normalization — whitespace and simple punctuation only.
// Does NOT strip units, sizes, or variant identifiers.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,;:!?'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalized: string): string[] {
  return normalized.split(" ").filter(Boolean);
}

// Jaccard similarity on token sets.
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Non-inventory detection
// ---------------------------------------------------------------------------

// Items whose names start with these keywords are likely service / logistics
// line items rather than stockable products. The caller still surfaces them
// to the user; the flag is advisory only.
const NON_INVENTORY_PREFIXES = [
  "transport",
  "dostawa",
  "przesyłka",
  "przesylka",
  "kurier",
  "shipping",
  "delivery",
  "rabat",
  "discount",
  "upust",
  "bonifikata",
  "usługa",
  "usluga",
  "serwis",
  "obsługa",
  "obsluga",
  "service",
  "opłata",
  "oplata",
  "prowizja",
  "fee",
  "charge",
];

export function isNonInventoryCandidate(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return NON_INVENTORY_PREFIXES.some(
    (kw) =>
      lower === kw ||
      lower.startsWith(kw + " ") ||
      lower.startsWith(kw + "-"),
  );
}

// ---------------------------------------------------------------------------
// Core matching
// ---------------------------------------------------------------------------

const SUGGESTION_THRESHOLD = 0.5;

export function matchInvoiceItems(
  items: ParsedInvoiceItem[],
  products: ProductForMatching[],
): MatchingProposals {
  // Pre-compute normalized names once — avoids repeated work per item.
  const indexed = products.map((p) => {
    const normalized = normalizeName(p.productName);
    return { ...p, normalized, tokens: tokenize(normalized) };
  });

  const results: ItemMatchResult[] = items.map((item) => {
    const normalizedInvoice = normalizeName(item.productName);
    const invoiceTokens = tokenize(normalizedInvoice);

    // Step 1 — exact match after normalization
    const exactMatches = indexed.filter(
      (p) => p.normalized === normalizedInvoice,
    );

    if (exactMatches.length === 1) {
      return {
        invoiceName: item.productName,
        status: "matched" as const,
        matched: {
          productId: exactMatches[0].productId,
          productName: exactMatches[0].productName,
          matchReason: "exact_name" as const,
        },
      };
    }

    if (exactMatches.length > 1) {
      // Ambiguous — surface all exact matches as suggestions
      return {
        invoiceName: item.productName,
        status: "suggestions" as const,
        suggestions: exactMatches.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          matchReason: "exact_name" as const,
        })),
      };
    }

    // Step 2 — similar name (Jaccard ≥ SUGGESTION_THRESHOLD)
    const similar = indexed
      .map((p) => ({
        ...p,
        score: jaccardSimilarity(invoiceTokens, p.tokens),
      }))
      .filter((p) => p.score >= SUGGESTION_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    if (similar.length > 0) {
      return {
        invoiceName: item.productName,
        status: "suggestions" as const,
        suggestions: similar.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          matchReason: "similar_name" as const,
        })),
      };
    }

    // Step 3 — non-inventory candidate (no product match found)
    if (isNonInventoryCandidate(item.productName)) {
      return {
        invoiceName: item.productName,
        status: "non_inventory_candidate" as const,
        handlingHint: "pozycja niemagazynowa",
      };
    }

    // Step 4 — no match
    return {
      invoiceName: item.productName,
      status: "unmatched" as const,
    };
  });

  return { matchedAt: Date.now(), items: results };
}
