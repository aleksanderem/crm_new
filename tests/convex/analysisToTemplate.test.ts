import { describe, expect, test } from "vitest";
import { parsedTemplateToTipTap } from "../../src/lib/documents/analysis-to-template";

const PARSED = {
  title: "Zgoda",
  confidence: 0.9,
  blocks: [
    { type: "heading" as const, level: 1 as const, text: "Zgoda na zabieg" },
    { type: "paragraph" as const, segments: [
      { type: "text" as const, text: "PESEL: " },
      { type: "field" as const, label: "PESEL", fieldType: "text" as const, required: true, patientFieldHint: "builtin:pesel" },
      { type: "field" as const, label: "PESEL", fieldType: "text" as const }, // duplikat labela → inny fieldId
    ]},
    { type: "bulletList" as const, items: [
      [{ type: "text" as const, text: "Punkt pierwszy" }],
    ]},
    { type: "paragraph" as const, segments: [
      { type: "field" as const, label: "Zgody marketingowe", fieldType: "select" as const, options: ["Tak", "Nie"] },
    ]},
  ],
};

describe("parsedTemplateToTipTap", () => {
  const doc = JSON.parse(parsedTemplateToTipTap(PARSED));

  test("builds a TipTap doc with heading, paragraphs and list", () => {
    expect(doc.type).toBe("doc");
    expect(doc.content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(doc.content[0].content[0].text).toBe("Zgoda na zabieg");
    expect(doc.content[2].type).toBe("bulletList");
    expect(doc.content[2].content[0].type).toBe("listItem");
  });

  test("field segments become formField nodes with client filledBy and mapping", () => {
    const para = doc.content[1];
    const fields = para.content.filter((n: { type: string }) => n.type === "formField");
    expect(fields).toHaveLength(2);
    expect(fields[0].attrs).toMatchObject({
      label: "PESEL", fieldType: "text", required: true,
      filledBy: "client", patientField: "builtin:pesel",
    });
    expect(fields[0].attrs.fieldId).toBeTruthy();
    expect(fields[1].attrs.fieldId).not.toBe(fields[0].attrs.fieldId); // kolizja labela rozwiązana
    expect(fields[1].attrs.patientField).toBe("");
  });

  test("select options serialize comma-separated (editor convention)", () => {
    const sel = doc.content[3].content.find((n: { type: string }) => n.type === "formField");
    expect(sel.attrs.options).toBe("Tak, Nie");
    expect(sel.attrs.fieldType).toBe("select");
  });

  test("empty blocks produce an empty doc, not a crash", () => {
    const empty = JSON.parse(parsedTemplateToTipTap({ title: null, confidence: null, blocks: [] }));
    expect(empty).toEqual({ type: "doc", content: [] });
  });
});
