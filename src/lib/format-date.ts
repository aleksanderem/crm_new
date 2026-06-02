/**
 * Format a YYYY-MM-DD birth date string as DD.MM.YYYY for Polish display.
 * Falls back to the raw value if it can't be parsed (e.g., legacy free-text
 * entries that were typed without separators).
 */
export function formatBirthDate(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!isoMatch) return trimmed;
  const [, y, m, d] = isoMatch;
  return `${d}.${m}.${y}`;
}
