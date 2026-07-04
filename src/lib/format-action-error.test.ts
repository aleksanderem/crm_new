import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
  extractFieldValidationDetail,
  extractTreatmentFieldError,
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

  it("extracts column name from FK constraint with standard Postgres naming (issue #2673)", () => {
    const detail = extractFieldValidationDetail(
      'insert or update on table "category_definitions" violates foreign key constraint "category_definitions_organization_id_fkey"',
    );
    expect(detail).toEqual({
      rawField: "organization_id",
      fieldLabel: "Organizacja",
      reason: "powiązany rekord nie istnieje",
    });
  });

  it("extracts column name from FK constraint for gabinet tables (issue #2673)", () => {
    for (const constraint of [
      "products_organization_id_fkey",
      "gabinet_locations_organization_id_fkey",
      "gabinet_equipment_organization_id_fkey",
      "gabinet_treatments_organization_id_fkey",
    ]) {
      const detail = extractFieldValidationDetail(
        `violates foreign key constraint "${constraint}"`,
      );
      expect(detail?.rawField).toBe("organization_id");
      expect(detail?.fieldLabel).toBe("Organizacja");
    }
  });

  it("returns null for FK constraint whose column cannot be parsed (issue #2673)", () => {
    const detail = extractFieldValidationDetail(
      'violates foreign key constraint "some_unknown_table_unknown_col_fkey"',
    );
    expect(detail).toBeNull();
  });

  it("extracts field from Convex 'Validator error: Missing required field' (issue #1941)", () => {
    const detail = extractFieldValidationDetail(
      "Validator error: Missing required field `name` in object",
    );
    expect(detail?.rawField).toBe("name");
    expect(detail?.fieldLabel).toBe("Nazwa");
    expect(detail?.reason).toBe("to pole jest wymagane");
  });

  it("extracts field from Convex 'Validator error: Unexpected field'", () => {
    const detail = extractFieldValidationDetail(
      "Validator error: Unexpected field `categoryId` in object",
    );
    expect(detail?.rawField).toBe("categoryId");
    expect(detail?.fieldLabel).toBe("Kategoria");
    expect(detail?.reason).toBe("nieoczekiwane pole");
  });

  it("extracts field from Convex 'Validator error: ... at path X.Y'", () => {
    const detail = extractFieldValidationDetail(
      "Validator error: Expected `string`, got `null` at path 'price'",
    );
    expect(detail?.rawField).toBe("price");
    expect(detail?.fieldLabel).toBe("Cena");
  });

  it("reports type-mismatch when no field name is present in Validator error", () => {
    const detail = extractFieldValidationDetail(
      "Validator error: Expected `string`, got `null`",
    );
    expect(detail?.fieldLabel).toContain("string");
    expect(detail?.reason).toContain("null");
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

  it("surfaces field when Convex throws 'Validator error: Missing required field' (issue #1941)", () => {
    const err = new Error(
      "[CONVEX A(gabinet/treatments:create)] [Request ID: xx] Server Error\n" +
        "Uncaught ArgumentValidationError: Validator error: Missing required field `duration` in object\n" +
        "    at validateValidator\n" +
        "  Called by client",
    );
    const msg = formatTreatmentError(err, t, {
      key: "gabinet.treatments.errors.createFailed",
      defaultValue: "Nie udało się utworzyć zabiegu.",
    });
    expect(msg).toContain("Czas trwania");
    expect(msg).toContain("to pole jest wymagane");
  });

  it("maps snake_case Postgres column to camelCase form field (issue #1972)", () => {
    const err = new Error(
      'supabaseDb.insert(gabinetTreatments): null value in column "tax_rate" of relation "gabinet_treatments" violates not-null constraint',
    );
    expect(extractTreatmentFieldError(err)).toEqual({
      field: "taxRate",
      reason: "to pole jest wymagane",
    });
  });

  it("maps Convex camelCase argument to form field (issue #1972)", () => {
    const err = new Error(
      "[CONVEX A(gabinet/treatments:create)] [Request ID: xx] Server Error\n" +
        "Uncaught ArgumentValidationError: Validator error: Expected `string`, got `null`\n" +
        "    at path 'price'\n" +
        "  Called by client",
    );
    expect(extractTreatmentFieldError(err)).toEqual({
      field: "price",
      reason: "nieprawidłowa wartość",
    });
  });

  it("returns null for non-field errors so route falls back to toast only (issue #1972)", () => {
    expect(extractTreatmentFieldError(new Error("Permission denied"))).toBeNull();
  });

  it("surfaces field when Convex emits 'at path' on a follow-up line (issue #1966)", () => {
    // Real Convex server-side validator errors put the `at path '...'` detail
    // on a *separate* line from the headline. The pre-fix cleanConvexMessage
    // dropped everything after the first line, so extractFieldValidationDetail
    // could never see the path and the user got the generic fallback.
    const err = new Error(
      "[CONVEX A(gabinet/treatments:create)] [Request ID: xx] Server Error\n" +
        "Uncaught ArgumentValidationError: Validator error: Expected `string`, got `null`\n" +
        "    at path 'price'\n" +
        "    at handler (../convex/gabinet/treatments.ts:42:13)\n" +
        "  Called by client",
    );
    const msg = formatTreatmentError(err, t, {
      key: "gabinet.treatments.errors.createFailed",
      defaultValue: "Nie udało się utworzyć zabiegu.",
    });
    expect(msg).toContain("Cena");
  });
});
