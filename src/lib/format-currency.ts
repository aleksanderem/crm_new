/**
 * Format a monetary amount for display using Polish locale (non-breaking space
 * as thousands separator, comma as decimal separator), followed by the currency
 * code. Example: 10000 → "10 000,00 PLN".
 *
 * Pass `fractionDigits: 0` for rounded displays (dashboard KPIs, reports):
 * 10000 → "10 000 PLN".
 *
 * Issue #1139 — amounts must be readable with thousand separators.
 */
export function formatCurrencyPLN(
  amount: number,
  currency = "PLN",
  options: { fractionDigits?: number } = {}
): string {
  const { fractionDigits = 2 } = options;
  const formatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
  return `${formatted} ${currency}`;
}
