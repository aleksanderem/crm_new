import { useRef, useEffect, useCallback } from "react";
import type { Template } from "@pdfme/common";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfmeDesignerProps {
  initialTemplate?: string; // JSON string of Template
  onChange?: (templateJson: string) => void;
}

// ---------------------------------------------------------------------------
// Blank template helper
// ---------------------------------------------------------------------------

function getBlankTemplate(): Template {
  return {
    basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
    schemas: [
      [
        {
          name: "title",
          type: "text",
          position: { x: 10, y: 10 },
          width: 190,
          height: 12,
        },
        {
          name: "body",
          type: "text",
          position: { x: 10, y: 30 },
          width: 190,
          height: 200,
        },
      ],
    ],
  };
}

// ---------------------------------------------------------------------------
// Component — wraps PDFme Designer (vanilla JS) in a React ref container
// ---------------------------------------------------------------------------

export function PdfmeDesigner({
  initialTemplate,
  onChange,
}: PdfmeDesignerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const initDesigner = async () => {
      const { Designer } = await import("@pdfme/ui");
      const { text, image, barcodes } = await import("@pdfme/schemas");

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
      });

      designer.onChangeTemplate(() => {
        if (onChangeRef.current) {
          onChangeRef.current(JSON.stringify(designer.getTemplate()));
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

  return <div ref={containerRef} className="h-[calc(100vh-200px)] w-full" />;
}

// Re-export under old name for lazy() compatibility in consumer routes
export { PdfmeDesigner as SurveyCreatorEditor };
