import { describe, expect, test } from "vitest";
import { formTemplateKind, type ParsedFormTemplate, type ParsedSegment } from "../../convex/_ai/kinds/formTemplate";
import { getAnalysisKind } from "../../convex/_ai/registry";

const CTX = { patientFields: [{ key: "pesel", label: "PESEL" }, { key: "phone", label: "Telefon" }] };

const VALID = {
  title: "Zgoda na zabieg",
  blocks: [
    { type: "heading", level: 1, text: "Zgoda na zabieg" },
    { type: "paragraph", segments: [
      { type: "text", text: "Ja, " },
      { type: "field", label: "Imię i nazwisko", fieldType: "text", required: true, patientFieldHint: null },
      { type: "text", text: ", PESEL: " },
      { type: "field", label: "PESEL", fieldType: "text", patientFieldHint: "builtin:pesel" },
    ]},
    { type: "bulletList", items: [
      [{ type: "text", text: "Zapoznałem się z przeciwwskazaniami" }],
    ]},
  ],
  confidence: 0.8,
};

describe("formTemplateKind", () => {
  test("registry resolves both kinds", () => {
    expect(getAnalysisKind("invoice")?.id).toBe("invoice");
    expect(getAnalysisKind("form_template")?.id).toBe("form_template");
    expect(getAnalysisKind("nope")).toBeNull();
  });

  test("prompt includes allowed patient targets from context", () => {
    const p = formTemplateKind.buildPrompt(CTX);
    expect(p).toContain("builtin:pesel");
    expect(p).toContain("PESEL");
    expect(formTemplateKind.maxTokens).toBe(8192);
  });

  test("validate: accepts valid, rejects malformed", () => {
    expect(formTemplateKind.validate(VALID)).toBe(true);
    expect(formTemplateKind.validate(null)).toBe(false);
    expect(formTemplateKind.validate({ blocks: "x" })).toBe(false);
    expect(formTemplateKind.validate({ blocks: [{ type: "widget" }] })).toBe(false);
    expect(formTemplateKind.validate({ blocks: [{ type: "paragraph", segments: [{ type: "field" }] }] })).toBe(false); // field bez label
  });

  test("map: keeps allowed hint, drops hint outside allowlist, coerces fieldType", () => {
    const messy = { ...VALID, blocks: [
      { type: "paragraph", segments: [
        { type: "field", label: "PESEL", fieldType: "text", patientFieldHint: "builtin:pesel" },
        { type: "field", label: "Hasło", fieldType: "text", patientFieldHint: "builtin:password" }, // spoza listy
        { type: "field", label: "Coś", fieldType: "fancy" }, // nieznany typ → "text"
      ]},
    ]};
    const out = formTemplateKind.map(messy, { rawJson: "{}", context: CTX }) as ParsedFormTemplate;
    const seg = out.blocks[0] as Extract<typeof out.blocks[0], { type: "paragraph" }>;
    const fields = seg.segments.filter((s) => s.type === "field") as Array<Extract<ParsedSegment, {type:"field"}>>;
    expect(fields[0].patientFieldHint).toBe("builtin:pesel");
    expect(fields[1].patientFieldHint).toBeNull();
    expect(fields[2].fieldType).toBe("text");
  });

  test("map without context drops all hints", () => {
    const out = formTemplateKind.map(VALID, { rawJson: "{}" }) as ParsedFormTemplate;
    const para = out.blocks[1] as Extract<typeof out.blocks[1], { type: "paragraph" }>;
    const pesel = para.segments.find((s) => s.type === "field" && s.label === "PESEL");
    expect((pesel as Extract<ParsedSegment, {type:"field"}>).patientFieldHint).toBeNull();
  });
});
