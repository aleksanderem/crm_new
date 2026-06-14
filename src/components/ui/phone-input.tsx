import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COUNTRIES,
  DEFAULT_DIAL_CODE,
  MIN_PHONE_NATIONAL_DIGITS,
  detectDialCode,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

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
  const { t } = useTranslation();
  const [{ dialCode, number }, setState] = useState(() => {
    if (!value) return { dialCode: DEFAULT_DIAL_CODE, number: "" };
    const detected = detectDialCode(value);
    if (detected) return { dialCode: detected.dialCode, number: detected.rest };
    return { dialCode: DEFAULT_DIAL_CODE, number: value };
  });
  const [touched, setTouched] = useState(false);

  const isKnown = useMemo(
    () => COUNTRIES.some((c) => c.code === dialCode),
    [dialCode],
  );

  const digitCount = useMemo(() => number.replace(/\D/g, "").length, [number]);
  const isInvalid =
    digitCount === 0
      ? Boolean(required)
      : digitCount < MIN_PHONE_NATIONAL_DIGITS;
  const showError = touched && isInvalid && digitCount > 0;

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
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-2">
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
          onBlur={() => setTouched(true)}
          required={required}
          placeholder={placeholder}
          aria-invalid={showError || undefined}
          className={cn(
            "flex-1",
            showError && "border-destructive focus-visible:border-destructive",
          )}
        />
      </div>
      {showError && (
        <p className="text-xs text-destructive" role="alert">
          {t("common.phoneTooShort")}
        </p>
      )}
    </div>
  );
}
