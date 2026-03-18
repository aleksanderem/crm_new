import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfExportButtonProps {
  templateJson: string;
  responseData: Record<string, string>;
  title: string;
  className?: string;
  onExport?: () => void;
}

// Keep old prop interface name for backward-compat
interface SurveyPdfExportButtonProps {
  formJson: string;
  responseData: Record<string, unknown>;
  title: string;
  className?: string;
  onExport?: () => void;
}

// ---------------------------------------------------------------------------
// Component — generates PDF via @pdfme/generator
// ---------------------------------------------------------------------------

export function PdfExportButton({
  templateJson,
  responseData,
  title,
  className,
  onExport,
}: PdfExportButtonProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const { generate } = await import("@pdfme/generator");
      const { text, image, barcodes } = await import("@pdfme/schemas");

      const template = JSON.parse(templateJson);
      const plugins = {
        Text: text,
        Image: image,
        QRCode: barcodes.qrcode,
      };

      const pdf = await generate({
        template,
        inputs: [responseData],
        plugins,
      });

      const blob = new Blob([pdf.buffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      onExport?.();
    } catch {
      toast.error(
        t("documents.pdfExportError", "Nie udalo sie wygenerowac PDF"),
      );
    } finally {
      setIsExporting(false);
    }
  }, [templateJson, responseData, title, onExport, t]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      className={cn(className)}
    >
      {isExporting ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-1 h-4 w-4" />
      )}
      {isExporting
        ? t("documents.pdfExporting", "Generowanie...")
        : t("documents.pdfExport", "Eksportuj PDF")}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible wrapper that maps old SurveyJS prop names to PDFme
// ---------------------------------------------------------------------------

export function SurveyPdfExportButton({
  formJson,
  responseData,
  title,
  className,
  onExport,
}: SurveyPdfExportButtonProps) {
  // Convert Record<string, unknown> to Record<string, string>
  const stringData = Object.fromEntries(
    Object.entries(responseData).map(([k, v]) => [k, String(v ?? "")]),
  );

  return (
    <PdfExportButton
      templateJson={formJson}
      responseData={stringData}
      title={title}
      className={className}
      onExport={onExport}
    />
  );
}

export type { PdfExportButtonProps, SurveyPdfExportButtonProps };
