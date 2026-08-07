import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PdfExportButton } from "@/components/documents/pdf-export";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentViewerProps {
  /** Title of the document */
  title: string;
  /** Resolved HTML with all variables and form fields filled */
  html: string;
  /** Signature data if document was signed */
  signatureData?: string;
  signedByName?: string;
  signedAt?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentViewer({
  title,
  html,
  signatureData,
  signedByName,
  signedAt,
  className,
}: DocumentViewerProps) {
  const { t } = useTranslation();

  const signatures = signatureData
    ? [
        {
          slotLabel: t("documents.signature", "Podpis"),
          signedByName,
          signedAt,
          signatureData,
        },
      ]
    : undefined;

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* Header with PDF export */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <PdfExportButton
          title={title}
          content={html}
          signatures={signatures}
        />
      </div>

      {/* Document content */}
      <div
        role="region"
        aria-label={title}
        className={cn(
          "mx-auto w-full max-w-[210mm] rounded-lg border bg-white p-8 shadow-sm",
          "prose prose-sm max-w-none text-gray-900",
          "[&_*]:!text-gray-900 [&_a]:!text-blue-700",
          "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:p-2",
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* Signature block */}
      {signatureData && (
        <div className="mx-auto w-full max-w-[210mm] rounded-lg border p-6">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            {t("documents.signature", "Podpis")}
          </p>
          <img
            src={signatureData}
            alt={t("documents.signatureAlt", "Podpis")}
            className="max-h-20"
          />
          {(signedByName || signedAt) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {signedByName}
              {signedAt &&
                ` — ${new Date(signedAt).toLocaleString()}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
