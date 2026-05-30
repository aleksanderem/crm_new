/**
 * Format a monetary amount for display using Polish locale (non-breaking space
 * as thousands separator, comma as decimal separator), followed by the currency
 * code. Example: 10000 → "10 000,00 PLN".
 *
 * Issue #1139 — amounts must be readable with thousand separators.
 */
export function formatCurrencyPLN(amount: number, currency = "PLN"): string {
  const formatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency}`;
}
