import { useRef, useEffect, useCallback } from "react";
import type { Template } from "@pdfme/common";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfmeFormRendererProps {
  templateJson: string;
  prefilledData?: Record<string, string>;
  onComplete?: (data: Record<string, string>) => void;
}

// Keep old prop interface name for backward-compat re-export
interface SurveyFormRendererProps {
  formJson: string;
  prefilledData?: Record<string, unknown>;
  readOnly?: boolean;
  onComplete?: (data: Record<string, unknown>) => void;
  onChange?: (data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Component — wraps PDFme Form (vanilla JS) in a React ref container
// ---------------------------------------------------------------------------

export function PdfmeFormRenderer({
  templateJson,
  prefilledData,
  onComplete,
}: PdfmeFormRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const initForm = async () => {
      const { Form } = await import("@pdfme/ui");
      const { text, image, barcodes } = await import("@pdfme/schemas");

      if (destroyed) return;

      const template: Template = JSON.parse(templateJson);
      const inputs = [prefilledData ?? {}];
      const plugins = {
        Text: text,
        Image: image,
        QRCode: barcodes.qrcode,
      };

      const form = new Form({
        domContainer: containerRef.current!,
        template,
        inputs,
        plugins,
      });

      formRef.current = form;
    };

    initForm();

    return () => {
      destroyed = true;
      formRef.current?.destroy();
    };
  }, [templateJson, prefilledData]);

  const handleComplete = useCallback(() => {
    if (formRef.current && onComplete) {
      const inputs = formRef.current.getInputs();
      onComplete(inputs[0]);
    }
  }, [onComplete]);

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="min-h-[500px] w-full" />
      {onComplete && (
        <div className="flex justify-end">
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={handleComplete}
          >
            Zapisz dokument
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible wrapper that maps old SurveyJS prop names to PDFme
// ---------------------------------------------------------------------------

export function SurveyFormRenderer({
  formJson,
  prefilledData,
  readOnly: _readOnly,
  onComplete,
  onChange: _onChange,
}: SurveyFormRendererProps) {
  // Convert Record<string, unknown> prefilled data to Record<string, string>
  const stringPrefilled = prefilledData
    ? Object.fromEntries(
        Object.entries(prefilledData).map(([k, v]) => [k, String(v ?? "")]),
      )
    : undefined;

  const handleComplete = useCallback(
    (data: Record<string, string>) => {
      if (onComplete) {
        // Return as Record<string, unknown> to match old interface
        onComplete(data as Record<string, unknown>);
      }
    },
    [onComplete],
  );

  return (
    <PdfmeFormRenderer
      templateJson={formJson}
      prefilledData={stringPrefilled}
      onComplete={onComplete ? handleComplete : undefined}
    />
  );
}

export type { PdfmeFormRendererProps, SurveyFormRendererProps };
