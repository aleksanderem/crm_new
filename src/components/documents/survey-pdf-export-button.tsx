import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "@/lib/ez-icons";
import { createSurveyPdfModel } from "@/lib/surveyjs";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SurveyPdfExportButtonProps {
  formJson: string;
  responseData: Record<string, unknown>;
  title: string;
  className?: string;
  onExport?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyPdfExportButton({
  formJson,
  responseData,
  title,
  className,
  onExport,
}: SurveyPdfExportButtonProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const pdf = createSurveyPdfModel(formJson, responseData);

      const fileName = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      await pdf.save(fileName);

      onExport?.();
    } catch {
      toast.error(
        t("documents.pdfExportError", "Nie udalo sie wygenerowac PDF"),
      );
    } finally {
      setIsExporting(false);
    }
  }, [formJson, responseData, title, onExport, t]);

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

export type { SurveyPdfExportButtonProps };
