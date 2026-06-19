import { Loader2 } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import { renderDocument } from "@/components/documents/document-renderer";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { useResolvedContentJson } from "@/hooks/use-resolved-content-json";

interface TemplateFallbackViewerProps {
  title: string;
  contentJson: string;
  scopeData: Record<string, string>;
  signatureData?: string;
  signedByName?: string;
  signedAt?: number;
}

/**
 * Fallback document viewer that re-renders from a template's contentJson when
 * the formDocument has no pre-rendered HTML in responseData. Resolves
 * componentBlock nodes via the server before calling renderDocument so the
 * literal "[Komponent: <id>]" placeholder is not emitted (#1915).
 */
export function TemplateFallbackViewer({
  title,
  contentJson,
  scopeData,
  signatureData,
  signedByName,
  signedAt,
}: TemplateFallbackViewerProps) {
  const { t } = useTranslation();
  const { resolvedContentJson, isLoading } = useResolvedContentJson(contentJson);

  if (isLoading || !resolvedContentJson) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading", "Ladowanie...")}
      </div>
    );
  }

  let html: string;
  try {
    html = renderDocument(resolvedContentJson, scopeData);
  } catch {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {t("documents.noContentAvailable", "Brak tresci dokumentu do wyswietlenia.")}
      </div>
    );
  }

  return (
    <DocumentViewer
      title={title}
      html={html}
      signatureData={signatureData}
      signedByName={signedByName}
      signedAt={signedAt}
    />
  );
}
