/**
 * Parse a birth-date string into ISO `YYYY-MM-DD` form. Accepts the canonical
 * ISO format plus common Polish entries: `DD.MM.YYYY`, `DD/MM/YYYY`,
 * `DD-MM-YYYY`, and the separator-less `DDMMYYYY` (e.g. "12072006") that
 * leaked into legacy rows. Returns "" when the value can't be confidently
 * parsed so the caller can decide how to fall back.
 */
export function parseBirthDateToIso(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return trimmed;
  const sep = /^(\d{2})[./-](\d{2})[./-](\d{4})$/.exec(trimmed);
  if (sep) {
    const [, d, m, y] = sep;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }
  const ddmmyyyy = /^(\d{2})(\d{2})(\d{4})$/.exec(trimmed);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) {
      return `${y}-${m}-${d}`;
    }
  }
  return "";
}

/**
 * Format a birth date string as DD.MM.YYYY for Polish display. Accepts ISO
 * `YYYY-MM-DD` as well as the legacy formats handled by
 * `parseBirthDateToIso`. Falls back to the raw value if it can't be parsed.
 */
export function formatBirthDate(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  const iso = parseBirthDateToIso(trimmed);
  if (iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }
  return trimmed;
}
