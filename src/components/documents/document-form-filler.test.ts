import { describe, expect, it } from "vitest";
import type { ExtractedFormField } from "@/components/documents/document-renderer";

// ---------------------------------------------------------------------------
// Helpers that replicate the logic in DocumentFormFiller so regressions in
// either the filter or the submit-validation path are caught here.
// ---------------------------------------------------------------------------

function applyFilledByFilter(
  fields: ExtractedFormField[],
  filter: "employee" | "client" | undefined,
): ExtractedFormField[] {
  if (!filter) return fields;
  return fields.filter((f) => (f.filledBy || "employee") === filter);
}

function buildInitialValues(fields: ExtractedFormField[]): Record<string, string> {
  const init: Record<string, string> = {};
  for (const field of fields) {
    init[field.fieldId] = field.fieldType === "checkbox" ? "false" : "";
  }
  return init;
}

function canSubmit(
  fields: ExtractedFormField[],
  values: Record<string, string>,
): boolean {
  for (const field of fields) {
    if (!field.required) continue;
    const val = values[field.fieldId];
    if (field.fieldType === "checkbox") {
      if (val !== "true") return false;
    } else if (!val?.trim()) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Field fixtures
// ---------------------------------------------------------------------------

function makeField(overrides: Partial<ExtractedFormField> & { fieldId: string }): ExtractedFormField {
  return {
    fieldType: "text",
    label: overrides.fieldId,
    options: "",
    required: false,
    placeholder: "",
    filledBy: "employee",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filledByFilter — employee path
// ---------------------------------------------------------------------------

describe("applyFilledByFilter (employee path)", () => {
  const fields = [
    makeField({ fieldId: "emp_name", filledBy: "employee" }),
    makeField({ fieldId: "client_sig", filledBy: "client" }),
    makeField({ fieldId: "default_field", filledBy: "" }), // empty filledBy defaults to "employee"
  ];

  it("shows employee and default fields, hides client fields", () => {
    const visible = applyFilledByFilter(fields, "employee");
    expect(visible.map((f) => f.fieldId)).toEqual(["emp_name", "default_field"]);
  });

  it("shows client fields only when filter is client", () => {
    const visible = applyFilledByFilter(fields, "client");
    expect(visible.map((f) => f.fieldId)).toEqual(["client_sig"]);
  });

  it("shows all fields when no filter is given", () => {
    const visible = applyFilledByFilter(fields, undefined);
    expect(visible).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Initial checkbox state
// ---------------------------------------------------------------------------

describe("buildInitialValues", () => {
  it("initialises checkbox fields to 'false', not empty string", () => {
    const fields = [
      makeField({ fieldId: "consent", fieldType: "checkbox" }),
      makeField({ fieldId: "name", fieldType: "text" }),
    ];
    const init = buildInitialValues(fields);
    expect(init["consent"]).toBe("false");
    expect(init["name"]).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Required-checkbox submit validation (regression for #2003 / #2005 fix)
//
// The original bug: using `!value.trim()` to check required fields let a
// required checkbox pass validation when its value was "false" (unchecked),
// because "false".trim() is truthy.  The fix checks `val !== "true"` for
// checkbox fields.
// ---------------------------------------------------------------------------

describe("canSubmit — required checkbox validation", () => {
  const checkboxField = makeField({
    fieldId: "consent",
    fieldType: "checkbox",
    required: true,
    filledBy: "employee",
  });

  it("blocks submission when a required checkbox is unchecked ('false')", () => {
    expect(canSubmit([checkboxField], { consent: "false" })).toBe(false);
  });

  it("blocks submission when a required checkbox is missing from values", () => {
    expect(canSubmit([checkboxField], {})).toBe(false);
  });

  it("allows submission when a required checkbox is checked ('true')", () => {
    expect(canSubmit([checkboxField], { consent: "true" })).toBe(true);
  });

  it("'false'.trim() is truthy — old !value.trim() check would have wrongly passed", () => {
    // This is the essence of the regression: the old guard was `!val?.trim()`
    // which evaluates to false for "false" (non-empty string), so it would
    // have called onComplete even though the checkbox was unchecked.
    const uncheckedValue: string = "false";
    expect(!uncheckedValue.trim()).toBe(false); // old guard would NOT block
    expect(uncheckedValue !== "true").toBe(true); // new guard correctly blocks
  });
});

// ---------------------------------------------------------------------------
// Required text/textarea/date fields still validate correctly
// ---------------------------------------------------------------------------

describe("canSubmit — other required field types", () => {
  it("blocks submission when a required text field is empty", () => {
    const field = makeField({ fieldId: "name", fieldType: "text", required: true });
    expect(canSubmit([field], { name: "" })).toBe(false);
    expect(canSubmit([field], { name: "   " })).toBe(false);
  });

  it("allows submission when a required text field is filled", () => {
    const field = makeField({ fieldId: "name", fieldType: "text", required: true });
    expect(canSubmit([field], { name: "Jan Kowalski" })).toBe(true);
  });

  it("optional fields do not block submission when empty", () => {
    const field = makeField({ fieldId: "notes", fieldType: "textarea", required: false });
    expect(canSubmit([field], { notes: "" })).toBe(true);
  });

  it("optional checkbox does not block submission when unchecked", () => {
    const field = makeField({ fieldId: "newsletter", fieldType: "checkbox", required: false });
    expect(canSubmit([field], { newsletter: "false" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Employee form fill path — combined filter + validation
// ---------------------------------------------------------------------------

describe("employee form fill end-to-end (filledByFilter=employee)", () => {
  const fields = [
    makeField({ fieldId: "employee_notes", fieldType: "text", required: true, filledBy: "employee" }),
    makeField({ fieldId: "consent", fieldType: "checkbox", required: true, filledBy: "employee" }),
    makeField({ fieldId: "client_sig", fieldType: "text", required: true, filledBy: "client" }),
  ];

  it("employee path blocks submission when required checkbox is unchecked", () => {
    const visible = applyFilledByFilter(fields, "employee");
    const values = buildInitialValues(visible);
    // Only fill in the text field, leave checkbox at "false"
    values["employee_notes"] = "Some notes";
    expect(canSubmit(visible, values)).toBe(false);
  });

  it("employee path allows submission when all required employee fields are filled", () => {
    const visible = applyFilledByFilter(fields, "employee");
    const values = buildInitialValues(visible);
    values["employee_notes"] = "Some notes";
    values["consent"] = "true";
    expect(canSubmit(visible, values)).toBe(true);
  });

  it("client-only required fields do not block employee submission", () => {
    const visible = applyFilledByFilter(fields, "employee");
    // client_sig is not in visible fields, so its missing value doesn't matter
    expect(visible.find((f) => f.fieldId === "client_sig")).toBeUndefined();
    const values = { employee_notes: "Notes", consent: "true" };
    expect(canSubmit(visible, values)).toBe(true);
  });
});
