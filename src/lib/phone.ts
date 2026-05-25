export type Country = {
  code: string;
  iso: string;
  flag: string;
  name: string;
};

export const COUNTRIES: Country[] = [
  { code: "+48", iso: "PL", flag: "🇵🇱", name: "Polska" },
  { code: "+49", iso: "DE", flag: "🇩🇪", name: "Niemcy" },
  { code: "+44", iso: "GB", flag: "🇬🇧", name: "Wielka Brytania" },
  { code: "+1", iso: "US", flag: "🇺🇸", name: "USA / Kanada" },
  { code: "+33", iso: "FR", flag: "🇫🇷", name: "Francja" },
  { code: "+39", iso: "IT", flag: "🇮🇹", name: "Włochy" },
  { code: "+34", iso: "ES", flag: "🇪🇸", name: "Hiszpania" },
  { code: "+31", iso: "NL", flag: "🇳🇱", name: "Holandia" },
  { code: "+32", iso: "BE", flag: "🇧🇪", name: "Belgia" },
  { code: "+43", iso: "AT", flag: "🇦🇹", name: "Austria" },
  { code: "+41", iso: "CH", flag: "🇨🇭", name: "Szwajcaria" },
  { code: "+420", iso: "CZ", flag: "🇨🇿", name: "Czechy" },
  { code: "+421", iso: "SK", flag: "🇸🇰", name: "Słowacja" },
  { code: "+380", iso: "UA", flag: "🇺🇦", name: "Ukraina" },
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
  { code: "+7", iso: "RU", flag: "🇷🇺", name: "Rosja / Kazachstan" },
  { code: "+90", iso: "TR", flag: "🇹🇷", name: "Turcja" },
];

export const DEFAULT_DIAL_CODE = "+48";

export const SORTED_CODES = [...COUNTRIES].sort(
  (a, b) => b.code.length - a.code.length,
);

export function detectDialCode(
  raw: string,
): { dialCode: string; rest: string } | null {
  let v = raw.trim();
  if (v.startsWith("00")) v = "+" + v.slice(2);
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

// Formats a phone number for display: inserts a space every 3 digits after
// the international dial code, e.g. "+48793904950" → "+48 793 904 950".
// Falls back to the original input when no dial code is detected and no
// digits are present.
export function formatPhoneNumber(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const detected = detectDialCode(trimmed);
  if (detected) {
    const digits = detected.rest.replace(/\D/g, "");
    const grouped = groupDigitsByThree(digits);
    return grouped ? `${detected.dialCode} ${grouped}` : detected.dialCode;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;
  return groupDigitsByThree(digits);
}
