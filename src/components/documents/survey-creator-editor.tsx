import { useCallback, useMemo } from "react";
import { SurveyCreatorComponent, SurveyCreator } from "survey-creator-react";
import "survey-core/survey-core.css";
import "survey-creator-core/survey-creator-core.css";
// Polish locale for both core and creator
import "survey-core/i18n/polish";
import "survey-creator-core/i18n/polish";

interface SurveyCreatorEditorProps {
  initialJson?: string; // existing form JSON to load
  onChange?: (json: string) => void; // called when form definition changes
}

export function SurveyCreatorEditor({
  initialJson,
  onChange,
}: SurveyCreatorEditorProps) {
  const creator = useMemo(() => {
    const c = new SurveyCreator({
      showLogicTab: true,
      showTranslationTab: false,
      showThemeTab: false,
      isAutoSave: true,
      showJSONEditorTab: true, // allow switching to JSON for power users
    });

    // Set Polish locale
    c.locale = "pl";

    // Load initial JSON if provided
    if (initialJson) {
      try {
        c.JSON = JSON.parse(initialJson);
      } catch {
        // Invalid JSON, start fresh
      }
    }

    // Wire up auto-save
    c.saveSurveyFunc = (saveNo: number, callback: (no: number, success: boolean) => void) => {
      if (onChange) {
        onChange(JSON.stringify(c.JSON));
      }
      callback(saveNo, true);
    };

    return c;
  }, []); // intentionally empty deps — creator should be created once

  return (
    <div className="h-[calc(100vh-200px)] w-full">
      <SurveyCreatorComponent creator={creator} />
    </div>
  );
}
