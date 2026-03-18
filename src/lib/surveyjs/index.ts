import { Model, surveyLocalization } from "survey-core";
import "survey-core/i18n/polish";
import { SurveyPDF } from "survey-pdf";

import { createAppTheme } from "./theme";

// Set Polish as the default locale for all new models.
surveyLocalization.defaultLocale = "pl";

/**
 * Creates a SurveyJS Model from a JSON schema string.
 * The model is pre-configured with Polish locale, a top progress bar,
 * and our app theme mapped to CSS variables.
 */
export function createSurveyModel(jsonSchema: string): Model {
  const schema = JSON.parse(jsonSchema) as Record<string, unknown>;
  const model = new Model(schema);

  model.locale = "pl";
  model.showProgressBar = "top";
  model.widthMode = "static";
  model.width = "100%";

  model.applyTheme(createAppTheme());

  return model;
}

/**
 * Creates a SurveyPDF model for generating PDF documents
 * from the same JSON schema used for interactive forms.
 */
export function createSurveyPdfModel(
  jsonSchema: string,
  data?: Record<string, unknown>,
): SurveyPDF {
  const schema = JSON.parse(jsonSchema) as Record<string, unknown>;
  const pdf = new SurveyPDF(schema, {
    fontSize: 12,
    format: "a4",
    margins: { top: 18, bot: 18, left: 18, right: 18 },
  });

  pdf.locale = "pl";

  if (data) {
    pdf.data = data;
  }

  return pdf;
}

export { createAppTheme } from "./theme";
export type {
  FormTemplateConfig,
  GenerateDocumentParams,
  ScopeData,
} from "./types";
