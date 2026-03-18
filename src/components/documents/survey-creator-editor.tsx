import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import type { Template, Font } from "@pdfme/common";
import { cn } from "@/lib/utils";
import type { VariableField } from "@/lib/pdfme/variables";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfmeDesignerProps {
  initialTemplate?: string; // JSON string of Template
  onChange?: (templateJson: string) => void;
  /** Optional className for the container */
  className?: string;
}

export interface PdfmeDesignerHandle {
  /** Add a variable field to the current page */
  addField: (variable: VariableField) => void;
  /** Get the current template JSON string */
  getTemplate: () => string | null;
  /** Get the set of field names currently used in the template */
  getUsedPaths: () => Set<string>;
  /** Replace the base PDF with an uploaded PDF (ArrayBuffer or base64 string) */
  updateBasePdf: (pdfData: string | ArrayBuffer) => void;
}

// ---------------------------------------------------------------------------
// Font loader — fetches extra fonts (Open Sans, Lato) for Polish diacritics.
// PDFme's built-in Roboto is used as the fallback.
// ---------------------------------------------------------------------------

let fontCache: Font | null = null;

async function loadFonts(): Promise<Font> {
  if (fontCache) return fontCache;

  const fontEntries: [string, string][] = [
    ["Open Sans", "/fonts/OpenSans-Regular.ttf"],
    ["Open Sans Bold", "/fonts/OpenSans-Bold.ttf"],
    ["Lato", "/fonts/Lato-Regular.ttf"],
    ["Lato Bold", "/fonts/Lato-Bold.ttf"],
  ];

  const font: Font = {};

  const results = await Promise.allSettled(
    fontEntries.map(async ([name, url]) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return [name, await res.arrayBuffer()] as const;
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const [name, data] = result.value;
      font[name] = { data };
    }
  }

  fontCache = font;
  return font;
}

// ---------------------------------------------------------------------------
// Blank template helper
// ---------------------------------------------------------------------------

function getBlankTemplate(): Template {
  return {
    basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
    schemas: [[]],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract field names from a PDFme template */
function extractFieldNames(template: Template): Set<string> {
  const paths = new Set<string>();
  for (const page of template.schemas) {
    for (const schema of page) {
      if (typeof schema === "object" && schema !== null && "name" in schema) {
        paths.add((schema as Record<string, unknown>).name as string);
      }
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Component — wraps PDFme Designer (vanilla JS) in a React ref container
// ---------------------------------------------------------------------------

export const PdfmeDesigner = forwardRef<PdfmeDesignerHandle, PdfmeDesignerProps>(
  function PdfmeDesigner({ initialTemplate, onChange, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const designerRef = useRef<any>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Track which variable paths are currently in the template
    const [usedPaths, setUsedPaths] = useState<Set<string>>(() => {
      if (!initialTemplate) return new Set();
      try {
        return extractFieldNames(JSON.parse(initialTemplate) as Template);
      } catch {
        return new Set();
      }
    });

    const updateUsedPaths = useCallback((template: Template) => {
      setUsedPaths(extractFieldNames(template));
    }, []);

    // Expose imperative API
    useImperativeHandle(
      ref,
      () => ({
        addField: (variable: VariableField) => {
          const designer = designerRef.current;
          if (!designer) return;

          const template = designer.getTemplate() as Template;
          const pageSchemas = [...(template.schemas[0] ?? [])];

          // Auto-position: find the lowest Y in existing schemas, place below
          let nextY = 10;
          for (const schema of pageSchemas) {
            const s = schema as Record<string, unknown>;
            const pos = s.position as { x: number; y: number } | undefined;
            const h = (s.height as number) ?? 10;
            if (pos) {
              const bottom = pos.y + h;
              if (bottom + 5 > nextY) {
                nextY = bottom + 5;
              }
            }
          }

          // Clamp to page bounds (A4 = 297mm height, with padding)
          if (nextY > 270) nextY = 10;

          const newSchema = {
            name: variable.path,
            type: "text" as const,
            content: `[${variable.label}]`,
            position: { x: 10, y: nextY },
            width: 80,
            height: 10,
            fontSize: 10,
          };

          pageSchemas.push(newSchema);

          const updatedTemplate: Template = {
            ...template,
            schemas: [pageSchemas, ...template.schemas.slice(1)],
          };

          designer.updateTemplate(updatedTemplate);
          updateUsedPaths(updatedTemplate);

          if (onChangeRef.current) {
            onChangeRef.current(JSON.stringify(updatedTemplate));
          }
        },
        getTemplate: () => {
          const designer = designerRef.current;
          if (!designer) return null;
          return JSON.stringify(designer.getTemplate());
        },
        getUsedPaths: () => usedPaths,
        updateBasePdf: (pdfData: string | ArrayBuffer) => {
          const designer = designerRef.current;
          if (!designer) return;
          const template = designer.getTemplate() as Template;
          const updatedTemplate: Template = {
            ...template,
            basePdf: pdfData,
          };
          designer.updateTemplate(updatedTemplate);
          if (onChangeRef.current) {
            onChangeRef.current(JSON.stringify(updatedTemplate));
          }
        },
      }),
      [usedPaths, updateUsedPaths],
    );

    useEffect(() => {
      if (!containerRef.current) return;

      let destroyed = false;

      const initDesigner = async () => {
        const [{ Designer }, { text, image, barcodes }, extraFonts] =
          await Promise.all([
            import("@pdfme/ui"),
            import("@pdfme/schemas"),
            loadFonts(),
          ]);

        if (destroyed) return;

        let template: Template;
        if (initialTemplate) {
          try {
            template = JSON.parse(initialTemplate);
          } catch {
            template = getBlankTemplate();
          }
        } else {
          template = getBlankTemplate();
        }

        const plugins = {
          Text: text,
          Image: image,
          QRCode: barcodes.qrcode,
        };

        const designer = new Designer({
          domContainer: containerRef.current!,
          template,
          plugins,
          options: {
            lang: "pl",
            font: extraFonts,
          },
        });

        designer.onChangeTemplate((tpl: Template) => {
          updateUsedPaths(tpl);
          if (onChangeRef.current) {
            onChangeRef.current(JSON.stringify(tpl));
          }
        });

        designerRef.current = designer;
      };

      initDesigner();

      return () => {
        destroyed = true;
        designerRef.current?.destroy();
      };
    }, []); // mount once

    return (
      <div
        ref={containerRef}
        className={cn("h-full w-full", className)}
      />
    );
  },
);

// Re-export under old name for lazy() compatibility in consumer routes
export { PdfmeDesigner as SurveyCreatorEditor };

// Re-export handle type
export type { PdfmeDesignerHandle as SurveyCreatorEditorHandle };
