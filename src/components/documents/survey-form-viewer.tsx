import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Template } from "@pdfme/common";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfmeFormViewerProps {
  templateJson: string;
  responseData: Record<string, string>;
  signatureData?: string;
  signedAt?: number;
}

// Keep old prop interface name for backward-compat
interface SurveyFormViewerProps {
  formJson: string;
  responseData: Record<string, unknown>;
  signatureData?: string;
  signedAt?: number;
}

// ---------------------------------------------------------------------------
// Component — wraps PDFme Viewer (vanilla JS) in a React ref container
// ---------------------------------------------------------------------------

export function PdfmeFormViewer({
  templateJson,
  responseData,
  signatureData,
  signedAt,
}: PdfmeFormViewerProps) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const initViewer = async () => {
      const { Viewer } = await import("@pdfme/ui");
      const { text, image, barcodes } = await import("@pdfme/schemas");

      if (destroyed || !containerRef.current) return;

      // Wait for container to have a real width (e.g., after Sheet animation)
      const el = containerRef.current;
      const waitForWidth = () =>
        new Promise<void>((resolve) => {
          if (el.offsetWidth > 200) {
            resolve();
            return;
          }
          const obs = new ResizeObserver((entries) => {
            if (entries[0]?.contentRect.width > 200) {
              obs.disconnect();
              resolve();
            }
          });
          obs.observe(el);
          // Fallback timeout
          setTimeout(() => {
            obs.disconnect();
            resolve();
          }, 2000);
        });

      await waitForWidth();
      if (destroyed || !containerRef.current) return;

      const template: Template = JSON.parse(templateJson);
      const inputs = [responseData];
      const plugins = {
        Text: text,
        Image: image,
        QRCode: barcodes.qrcode,
      };

      const viewer = new Viewer({
        domContainer: containerRef.current!,
        template,
        inputs,
        plugins,
      });

      viewerRef.current = viewer;
    };

    initViewer();

    return () => {
      destroyed = true;
      viewerRef.current?.destroy();
    };
  }, [templateJson, responseData]);

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="h-[600px] w-full" />
      {signatureData && (
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-2">
            {t("documents.signature", "Podpis")}
          </p>
          <img
            src={signatureData}
            alt={t("documents.signature", "Podpis")}
            className="h-20 object-contain"
          />
          {signedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("documents.signedAt", "Podpisano")}:{" "}
              {new Date(signedAt).toLocaleString(
                i18n.language === "en" ? "en-US" : "pl-PL",
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible wrapper that maps old SurveyJS prop names to PDFme
// ---------------------------------------------------------------------------

export function SurveyFormViewer({
  formJson,
  responseData,
  signatureData,
  signedAt,
}: SurveyFormViewerProps) {
  // Convert Record<string, unknown> to Record<string, string>
  const stringData = Object.fromEntries(
    Object.entries(responseData).map(([k, v]) => [k, String(v ?? "")]),
  );

  return (
    <PdfmeFormViewer
      templateJson={formJson}
      responseData={stringData}
      signatureData={signatureData}
      signedAt={signedAt}
    />
  );
}

export type { PdfmeFormViewerProps, SurveyFormViewerProps };
