export type Country = {
  code: string;
  iso: string;
  flag: string;
  name: string;
  // Optional digit-grouping pattern applied to the national part (digits after
  // the dial code) when formatting for display. Each entry is the size of one
  // group; the last group absorbs any remaining digits. When omitted, the
  // default 3-3-3-... grouping is used.
  grouping?: number[];
};

export const COUNTRIES: Country[] = [
  { code: "+48", iso: "PL", flag: "🇵🇱", name: "Polska" },
  { code: "+49", iso: "DE", flag: "🇩🇪", name: "Niemcy" },
  { code: "+44", iso: "GB", flag: "🇬🇧", name: "Wielka Brytania", grouping: [4, 3, 3] },
  { code: "+1", iso: "US", flag: "🇺🇸", name: "USA / Kanada", grouping: [3, 3, 4] },
  { code: "+33", iso: "FR", flag: "🇫🇷", name: "Francja", grouping: [1, 2, 2, 2, 2] },
  { code: "+39", iso: "IT", flag: "🇮🇹", name: "Włochy", grouping: [3, 3, 4] },
  { code: "+34", iso: "ES", flag: "🇪🇸", name: "Hiszpania" },
  { code: "+31", iso: "NL", flag: "🇳🇱", name: "Holandia", grouping: [2, 4, 4] },
  { code: "+32", iso: "BE", flag: "🇧🇪", name: "Belgia", grouping: [3, 2, 2, 2] },
  { code: "+43", iso: "AT", flag: "🇦🇹", name: "Austria" },
  { code: "+41", iso: "CH", flag: "🇨🇭", name: "Szwajcaria", grouping: [2, 3, 2, 2] },
  { code: "+420", iso: "CZ", flag: "🇨🇿", name: "Czechy" },
  { code: "+421", iso: "SK", flag: "🇸🇰", name: "Słowacja" },
  { code: "+380", iso: "UA", flag: "🇺🇦", name: "Ukraina", grouping: [2, 3, 2, 2] },
  { code: "+375", iso: "BY", flag: "🇧🇾", name: "Białoruś" },
  { code: "+370", iso: "LT", flag: "🇱🇹", name: "Litwa" },
  { code: "+371", iso: "LV", flag: "🇱🇻", name: "Łotwa" },
  { code: "+372", iso: "EE", flag: "🇪🇪", name: "Estonia" },
  { code: "+353", iso: "IE", flag: "🇮🇪", name: "Irlandia" },
  { code: "+46", iso: "SE", flag: "🇸🇪", name: "Szwecja" },
  { code: "+47", iso: "NO", flag: "🇳🇴", name: "Norwegia" },
  { code: "+45", iso: "DK", flag: "🇩🇰", name: "Dania" },
  { code: "+358", iso: "FI", flag: "🇫🇮", name: "Finlandia" },
  { code: "+351", iso: "PT", flag: "🇵🇹", name: "Portugalia" },
  { code: "+30", iso: "GR", flag: "🇬🇷", name: "Grecja" },
  { code: "+40", iso: "RO", flag: "🇷🇴", name: "Rumunia" },
  { code: "+36", iso: "HU", flag: "🇭🇺", name: "Węgry" },
  { code: "+359", iso: "BG", flag: "🇧🇬", name: "Bułgaria" },
  { code: "+385", iso: "HR", flag: "🇭🇷", name: "Chorwacja" },
  { code: "+386", iso: "SI", flag: "🇸🇮", name: "Słowenia" },
  { code: "+7", iso: "RU", flag: "🇷🇺", name: "Rosja / Kazachstan", grouping: [3, 3, 2, 2] },
  { code: "+90", iso: "TR", flag: "🇹🇷", name: "Turcja", grouping: [3, 3, 4] },
];

export const DEFAULT_DIAL_CODE = "+48";

// Minimum number of digits required after the dial code for a phone number
// to be considered well-formed. Matches the Polish 9-digit national format
// and is sufficient as a baseline for the other supported countries.
export const MIN_PHONE_NATIONAL_DIGITS = 9;

export const SORTED_CODES = [...COUNTRIES].sort(
  (a, b) => b.code.length - a.code.length,
);

export function detectDialCode(
  raw: string,
): { dialCode: string; rest: string } | null {
  let v = raw.trim();
  if (v.startsWith("00")) v = "+" + v.slice(2).trimStart();
  if (!v.startsWith("+")) return null;
  for (const c of SORTED_CODES) {
    if (v.startsWith(c.code)) {
      return { dialCode: c.code, rest: v.slice(c.code.length).trimStart() };
    }
  }
  return null;
}

function groupDigitsByThree(digits: string): string {
  if (!digits) return "";
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    parts.push(digits.slice(i, i + 3));
  }
  return parts.join(" ");
}

// Applies a country-specific grouping pattern. Each pattern entry is a group
// size; the final group absorbs any remaining digits. If the digit count is
// far off the expected total (more than one digit short of the first group
// or wildly longer than the pattern sum), we fall back to default 3-3-3
// grouping so malformed numbers are not split into misleading chunks.
function applyGrouping(digits: string, pattern: number[]): string {
  if (!digits || pattern.length === 0) return groupDigitsByThree(digits);
  const expected = pattern.reduce((a, b) => a + b, 0);
  // Only honor the pattern when the digit count is plausible for it.
  // Allow up to one trailing digit of slack so partial inputs still group nicely.
  if (digits.length < pattern[0] || digits.length > expected + 1) {
    return groupDigitsByThree(digits);
  }
  const parts: string[] = [];
  let i = 0;
  for (let p = 0; p < pattern.length - 1; p++) {
    if (i >= digits.length) break;
    const size = pattern[p];
    parts.push(digits.slice(i, i + size));
    i += size;
  }
  if (i < digits.length) parts.push(digits.slice(i));
  return parts.join(" ");
}

// Formats a phone number for display. By default, digits after the
// international dial code are grouped in chunks of 3 (e.g. "+48793904950" →
// "+48 793 904 950"). When the detected country defines a `grouping` pattern
// in COUNTRIES, that pattern is used instead — e.g. "+15551234567" →
// "+1 555 123 4567" for the US convention.
// Falls back to the original input when no dial code is detected and no
// digits are present.
// Counts digits in the national part of a phone number (i.e. after the
// dial code, if one is recognised). Returns 0 for empty/blank input.
export function countPhoneNationalDigits(
  value: string | null | undefined,
): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const detected = detectDialCode(trimmed);
  const rest = detected ? detected.rest : trimmed;
  return rest.replace(/\D/g, "").length;
}

// Returns true when the phone number is acceptable for submission.
// An empty value is acceptable iff the field is not required.
// A non-empty value must contain at least MIN_PHONE_NATIONAL_DIGITS digits
// in the national part.
export function isPhoneNumberValid(
  value: string | null | undefined,
  options: { required?: boolean } = {},
): boolean {
  const digits = countPhoneNationalDigits(value);
  if (digits === 0) return !options.required;
  return digits >= MIN_PHONE_NATIONAL_DIGITS;
}

export function formatPhoneNumber(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const detected = detectDialCode(trimmed);
  if (detected) {
    const digits = detected.rest.replace(/\D/g, "");
    const country = COUNTRIES.find((c) => c.code === detected.dialCode);
    const grouped = country?.grouping
      ? applyGrouping(digits, country.grouping)
      : groupDigitsByThree(digits);
    return grouped ? `${detected.dialCode} ${grouped}` : detected.dialCode;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return groupDigitsByThree(digits);
}
