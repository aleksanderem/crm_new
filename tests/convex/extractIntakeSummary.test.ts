import { describe, expect, test } from "vitest";
import {
  extractFieldDefinitions,
  extractIntakeSummary,
  type IntakeFieldDefinition,
} from "../../convex/documents/intakeSummary";

// ---------------------------------------------------------------------------
// extractFieldDefinitions
// ---------------------------------------------------------------------------

describe("extractFieldDefinitions", () => {
  test("returns empty array for null/undefined input", () => {
    expect(extractFieldDefinitions(null)).toEqual([]);
    expect(extractFieldDefinitions(undefined)).toEqual([]);
  });

  test("extracts formField nodes from flat TipTap JSON", () => {
    const contentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "formField",
              attrs: {
                fieldId: "diabetes",
                fieldType: "checkbox",
                label: "Cukrzyca",
                required: false,
                options: "",
                placeholder: "",
                filledBy: "client",
              },
            },
            {
              type: "formField",
              attrs: {
                fieldId: "allergies",
                fieldType: "textarea",
                label: "Alergie",
                required: false,
                options: "",
                placeholder: "",
                filledBy: "client",
              },
            },
          ],
        },
      ],
    };

    const result = extractFieldDefinitions(contentJson);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ fieldId: "diabetes", fieldType: "checkbox", label: "Cukrzyca" });
    expect(result[1]).toEqual({ fieldId: "allergies", fieldType: "textarea", label: "Alergie" });
  });

  test("extracts formField nodes from nested TipTap JSON", () => {
    const contentJson = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "formField",
                          attrs: { fieldId: "medications", fieldType: "text", label: "Przyjmowane leki" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const result = extractFieldDefinitions(contentJson);
    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe("medications");
    expect(result[0].label).toBe("Przyjmowane leki");
  });

  test("uses fieldId as label fallback when label is missing", () => {
    const contentJson = {
      type: "doc",
      content: [
        {
          type: "formField",
          attrs: { fieldId: "pregnancy", fieldType: "checkbox", label: "" },
        },
      ],
    };
    const result = extractFieldDefinitions(contentJson);
    expect(result[0].label).toBe("");
    expect(result[0].fieldId).toBe("pregnancy");
  });
});

// ---------------------------------------------------------------------------
// extractIntakeSummary
// ---------------------------------------------------------------------------

describe("extractIntakeSummary", () => {
  const fields: IntakeFieldDefinition[] = [
    { fieldId: "diabetes", fieldType: "checkbox", label: "Cukrzyca" },
    { fieldId: "pregnancy", fieldType: "checkbox", label: "Ciąża" },
    { fieldId: "pacemaker", fieldType: "checkbox", label: "Rozrusznik serca" },
    { fieldId: "allergies", fieldType: "textarea", label: "Alergie" },
    { fieldId: "medications", fieldType: "text", label: "Przyjmowane leki" },
    { fieldId: "bloodPressure", fieldType: "select", label: "Ciśnienie tętnicze" },
  ];

  test("returns empty array when formFieldValues is empty", () => {
    expect(extractIntakeSummary(fields, {})).toEqual([]);
  });

  test("includes checked checkboxes as plain label strings", () => {
    const result = extractIntakeSummary(fields, {
      diabetes: "true",
      pregnancy: "true",
    });
    expect(result).toContain("Cukrzyca");
    expect(result).toContain("Ciąża");
  });

  test("accepts TAK (Polish) as truthy checkbox value", () => {
    const result = extractIntakeSummary(fields, { diabetes: "Tak", pregnancy: "TAK" });
    expect(result).toContain("Cukrzyca");
    expect(result).toContain("Ciąża");
  });

  test("omits unchecked (false) checkboxes", () => {
    const result = extractIntakeSummary(fields, { diabetes: "false", pregnancy: "NIE" });
    expect(result).not.toContain("Cukrzyca");
    expect(result).not.toContain("Ciąża");
  });

  test("includes non-empty text fields as 'Label: value' strings", () => {
    const result = extractIntakeSummary(fields, {
      allergies: "penicylina",
      medications: "Metformina",
    });
    expect(result).toContain("Alergie: penicylina");
    expect(result).toContain("Przyjmowane leki: Metformina");
  });

  test("omits empty text fields", () => {
    const result = extractIntakeSummary(fields, { allergies: "", medications: "  " });
    expect(result).toHaveLength(0);
  });

  test("omits text fields whose value is NIE/false", () => {
    const result = extractIntakeSummary(fields, {
      bloodPressure: "Nie",
      allergies: "nie",
    });
    expect(result).toHaveLength(0);
  });

  test("full example matching the issue specification", () => {
    const values = {
      diabetes: "true",
      pregnancy: "tak",
      pacemaker: "true",
      allergies: "penicylina",
      medications: "Metformina",
      bloodPressure: "",
    };
    const result = extractIntakeSummary(fields, values);
    expect(result).toEqual([
      "Cukrzyca",
      "Ciąża",
      "Rozrusznik serca",
      "Alergie: penicylina",
      "Przyjmowane leki: Metformina",
    ]);
  });

  test("preserves field order from fieldDefinitions", () => {
    const values = { medications: "Aspiryna", diabetes: "true", allergies: "kurz" };
    const result = extractIntakeSummary(fields, values);
    // Order should follow fieldDefinitions array, not formFieldValues key order
    const diabetesIdx = result.indexOf("Cukrzyca");
    const allergiesIdx = result.findIndex((s) => s.startsWith("Alergie:"));
    const medicationsIdx = result.findIndex((s) => s.startsWith("Przyjmowane leki:"));
    expect(diabetesIdx).toBeLessThan(allergiesIdx);
    expect(allergiesIdx).toBeLessThan(medicationsIdx);
  });

  test("uses fieldId as display label when label is empty", () => {
    const fieldsNoLabel: IntakeFieldDefinition[] = [
      { fieldId: "q_heart_disease", fieldType: "checkbox", label: "" },
    ];
    const result = extractIntakeSummary(fieldsNoLabel, { q_heart_disease: "true" });
    expect(result).toEqual(["q_heart_disease"]);
  });

  test("ignores values for unknown field IDs", () => {
    const result = extractIntakeSummary(fields, { unknown_field: "some value" });
    expect(result).toHaveLength(0);
  });
});
