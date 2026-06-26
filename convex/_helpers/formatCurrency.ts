/**
 * Backend equivalent of src/lib/format-currency.ts for use in Convex
 * mutations/actions where notification and email strings are built.
 * Keeps currency display consistent between server-generated strings and UI.
 */
export function formatCurrencyPLN(
  amount: number,
  currency = "PLN",
): string {
  const formatted = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${formatted} ${currency}`;
}
