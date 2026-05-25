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
import { COUNTRIES, DEFAULT_DIAL_CODE, detectDialCode } from "@/lib/phone";

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
        <SelectTrigger className="w-[90px] shrink-0" size="sm">
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
