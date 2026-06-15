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
  formatPhoneNational,
} from "@/lib/phone";
import { cn } from "@/lib/utils";

function combine(dialCode: string, digits: string): string {
  const trimmed = digits.trim();
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
    if (detected)
      return {
        dialCode: detected.dialCode,
        number: detected.rest.replace(/\D/g, ""),
      };
    return { dialCode: DEFAULT_DIAL_CODE, number: value.replace(/\D/g, "") };
  });
  const [touched, setTouched] = useState(false);

  const isKnown = useMemo(
    () => COUNTRIES.some((c) => c.code === dialCode),
    [dialCode],
  );

  const digitCount = number.length;
  const isInvalid =
    digitCount === 0
      ? Boolean(required)
      : digitCount < MIN_PHONE_NATIONAL_DIGITS;
  const showError = touched && isInvalid && digitCount > 0;

  const displayValue = useMemo(
    () => formatPhoneNational(number, dialCode),
    [number, dialCode],
  );

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    const detected = detectDialCode(v);
    if (detected) {
      const digits = detected.rest.replace(/\D/g, "");
      setState({ dialCode: detected.dialCode, number: digits });
      onChange(combine(detected.dialCode, digits));
    } else {
      const digits = v.replace(/\D/g, "");
      setState({ dialCode, number: digits });
      onChange(combine(dialCode, digits));
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
          value={displayValue}
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
