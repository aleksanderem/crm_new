import { useMemo } from "react";
import { Survey } from "survey-react-ui";
import { createSurveyModel } from "@/lib/surveyjs";
import { useTranslation } from "react-i18next";
import "survey-core/survey-core.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SurveyFormViewerProps {
  formJson: string;
  responseData: Record<string, unknown>;
  signatureData?: string;
  signedAt?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyFormViewer({
  formJson,
  responseData,
  signatureData,
  signedAt,
}: SurveyFormViewerProps) {
  const { t, i18n } = useTranslation();

  const model = useMemo(() => {
    const m = createSurveyModel(formJson);
    m.data = responseData;
    m.mode = "display";
    m.showNavigationButtons = "none";
    m.locale = i18n.language === "en" ? "en" : "pl";
    return m;
  }, [formJson, responseData, i18n.language]);

  return (
    <div className="space-y-4">
      <Survey model={model} />

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

export type { SurveyFormViewerProps };
