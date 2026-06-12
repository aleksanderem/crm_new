import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
  extractFieldValidationDetail,
  formatTreatmentError,
} from "./format-action-error";

// Minimal i18next-like translator that interpolates `{{param}}` placeholders
// in `defaultValue`. Cast to TFunction so the call sites don't fight
// i18next's branded generic signature in unit tests.
const t = ((
  key: string,
  arg?: { defaultValue?: string; [k: string]: unknown },
): string => {
  const tpl = (arg?.defaultValue as string) ?? key;
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, name) => String(arg?.[name] ?? ""));
}) as unknown as TFunction;

describe("extractFieldValidationDetail", () => {
  it("extracts column name from Postgres null-violation", () => {
    const detail = extractFieldValidationDetail(
      'null value in column "duration" of relation "gabinet_treatments" violates not-null constraint',
    );
    expect(detail).toEqual({
      rawField: "duration",
      fieldLabel: "Czas trwania",
      reason: "to pole jest wymagane",
    });
  });

  it("extracts column name from missing-column error", () => {
    const detail = extractFieldValidationDetail(
      'column "package_id" of relation "gabinet_treatments" does not exist',
    );
    expect(detail?.fieldLabel).toBe("Powiązany pakiet");
    expect(detail?.reason).toBe("kolumna nie istnieje w bazie");
  });

  it("extracts type from invalid input syntax", () => {
    const detail = extractFieldValidationDetail(
      'invalid input syntax for type integer: "abc"',
    );
    expect(detail?.rawField).toBe("integer");
    expect(detail?.fieldLabel).toBe('wartość "abc"');
    expect(detail?.reason).toContain("integer");
  });

  it("extracts argument name from Convex validator error", () => {
    const detail = extractFieldValidationDetail(
      "ArgumentValidationError: Value 'foo' for argument 'price' is not a valid value",
    );
    expect(detail?.rawField).toBe("price");
    expect(detail?.fieldLabel).toBe("Cena");
  });

  it("returns null for unrelated messages", () => {
    expect(extractFieldValidationDetail("Some other error")).toBeNull();
  });
});

describe("formatTreatmentError", () => {
  it("surfaces field name when Postgres reports a NOT NULL violation", () => {
    const err = new Error(
      'supabaseDb.patch(gabinetTreatments, abc): null value in column "name" of relation "gabinet_treatments" violates not-null constraint',
    );
    const msg = formatTreatmentError(err, t, {
      key: "gabinet.treatments.errors.createFailed",
      defaultValue: "Nie udało się utworzyć zabiegu.",
    });
    expect(msg).toContain("Nazwa");
    expect(msg).toContain("to pole jest wymagane");
  });

  it("falls back to generic message when error has no extractable field", () => {
    const err = new Error("Permission denied");
    const msg = formatTreatmentError(err, t, {
      key: "gabinet.treatments.errors.createFailed",
      defaultValue: "Nie udało się utworzyć zabiegu.",
    });
    expect(msg).toBe("Brak uprawnień do tej operacji na zabiegu.");
  });

  it("falls back to caller's default when nothing matches", () => {
    const err = new Error("Something totally unexpected");
    const msg = formatTreatmentError(err, t, {
      key: "gabinet.treatments.errors.createFailed",
      defaultValue: "Nie udało się utworzyć zabiegu.",
    });
    expect(msg).toBe("Nie udało się utworzyć zabiegu.");
  });
});
