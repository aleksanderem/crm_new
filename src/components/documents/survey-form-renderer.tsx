import { useMemo } from "react";
import { Survey } from "survey-react-ui";
import { createSurveyModel } from "@/lib/surveyjs";
import { useTranslation } from "react-i18next";
import "survey-core/survey-core.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SurveyFormRendererProps {
  formJson: string;
  prefilledData?: Record<string, unknown>;
  readOnly?: boolean;
  onComplete?: (data: Record<string, unknown>) => void;
  onChange?: (data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurveyFormRenderer({
  formJson,
  prefilledData,
  readOnly,
  onComplete,
  onChange,
}: SurveyFormRendererProps) {
  const { i18n } = useTranslation();

  const model = useMemo(() => {
    const m = createSurveyModel(formJson);

    if (prefilledData) {
      m.data = prefilledData;
    }
    if (readOnly) {
      m.mode = "display";
    }

    // Sync locale with app language
    m.locale = i18n.language === "en" ? "en" : "pl";

    return m;
  }, [formJson, prefilledData, readOnly, i18n.language]);

  // Wire up callbacks — separate useMemo to avoid recreating model when
  // only callback references change.
  useMemo(() => {
    model.onComplete.clear();
    model.onValueChanged.clear();

    if (onComplete) {
      model.onComplete.add((sender) => {
        onComplete(sender.data);
      });
    }
    if (onChange) {
      model.onValueChanged.add((sender) => {
        onChange(sender.data);
      });
    }
  }, [model, onComplete, onChange]);

  return <Survey model={model} />;
}

export type { SurveyFormRendererProps };
