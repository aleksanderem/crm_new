import type { Template } from "@pdfme/common";
import { BLANK_A4_PDF } from "@pdfme/common";

// Re-export for convenience
export type { Template };
export { BLANK_A4_PDF };

/**
 * Get PDFme plugins for Designer/Form/Viewer/Generator.
 * Lazy-loaded to avoid pulling everything into initial bundle.
 */
export async function getPdfmePlugins() {
  const {
    text,
    image,
    barcodes,
    line,
    rectangle,
    ellipse,
    table,
    checkbox,
    svg,
    dateTime,
    date,
    time,
    select,
    radioGroup,
    multiVariableText,
  } = await import("@pdfme/schemas");
  return {
    Text: text,
    MultiVariableText: multiVariableText,
    Image: image,
    SVG: svg,
    QRCode: barcodes.qrcode,
    Line: line,
    Rectangle: rectangle,
    Ellipse: ellipse,
    Table: table,
    Checkbox: checkbox,
    DateTime: dateTime,
    Date: date,
    Time: time,
    Select: select,
    RadioGroup: radioGroup,
  };
}

/**
 * Generate PDF from template + inputs.
 */
export async function generatePdf(
  template: Template,
  inputs: Record<string, string>[],
): Promise<Uint8Array> {
  const { generate } = await import("@pdfme/generator");
  const plugins = await getPdfmePlugins();
  return generate({ template, inputs, plugins });
}

/**
 * Parse template JSON string into Template object.
 */
export function parseTemplate(json: string): Template {
  return JSON.parse(json) as Template;
}

/**
 * Serialize Template to JSON string for storage.
 */
export function serializeTemplate(template: Template): string {
  return JSON.stringify(template);
}

/**
 * Create a minimal starter template with common medical document fields.
 * Uses the built-in blank A4 base PDF from @pdfme/common.
 */
export function createStarterTemplate(): Template {
  return {
    basePdf: BLANK_A4_PDF,
    schemas: [
      [
        {
          name: "title",
          type: "text",
          position: { x: 10, y: 10 },
          width: 190,
          height: 12,
          fontSize: 18,
          alignment: "center",
        },
        {
          name: "body",
          type: "text",
          position: { x: 10, y: 30 },
          width: 190,
          height: 200,
          fontSize: 11,
        },
        {
          name: "signature",
          type: "image",
          position: { x: 10, y: 250 },
          width: 60,
          height: 25,
        },
        {
          name: "date",
          type: "text",
          position: { x: 140, y: 260 },
          width: 60,
          height: 10,
          fontSize: 10,
        },
      ],
    ],
  };
}
