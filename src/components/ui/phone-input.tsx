import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Country = {
  code: string;
  iso: string;
  flag: string;
  name: string;
};

const COUNTRIES: Country[] = [
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

const DEFAULT_DIAL_CODE = "+48";

const SORTED_CODES = [...COUNTRIES].sort(
  (a, b) => b.code.length - a.code.length,
);

function detectDialCode(
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

function parseInitialValue(value: string): { dialCode: string; number: string } {
  if (!value) return { dialCode: DEFAULT_DIAL_CODE, number: "" };
  const detected = detectDialCode(value);
  if (detected) return { dialCode: detected.dialCode, number: detected.rest };
  return { dialCode: DEFAULT_DIAL_CODE, number: value };
}

function combine(dialCode: string, number: string): string {
  const trimmed = number.trim();
  return trimmed ? `${dialCode} ${trimmed}` : "";
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
}

export function PhoneInput({
  value,
  onChange,
  required,
  id,
  placeholder,
  className,
}: PhoneInputProps) {
  const [{ dialCode, number }, setState] = useState(() =>
    parseInitialValue(value),
  );

  const isKnown = useMemo(
    () => COUNTRIES.some((c) => c.code === dialCode),
    [dialCode],
  );

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const detected = detectDialCode(v);
    if (detected) {
      setState({ dialCode: detected.dialCode, number: detected.rest });
      onChange(combine(detected.dialCode, detected.rest));
    } else {
      setState({ dialCode, number: v });
      onChange(combine(dialCode, v));
    }
  };

  const handleDialChange = (newDial: string) => {
    setState({ dialCode: newDial, number });
    onChange(combine(newDial, number));
  };

  return (
    <div className={`flex gap-2 ${className ?? ""}`}>
      <Select value={isKnown ? dialCode : DEFAULT_DIAL_CODE} onValueChange={handleDialChange}>
        <SelectTrigger className="w-[110px] shrink-0" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.iso} value={c.code}>
                <span className="mr-1">{c.flag}</span>
                {c.code}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Input
        type="tel"
        id={id}
        value={number}
        onChange={handleNumberChange}
        required={required}
        placeholder={placeholder}
        className="flex-1"
      />
    </div>
  );
}
