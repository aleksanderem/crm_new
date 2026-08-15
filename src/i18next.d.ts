import "i18next";
import type translation from "../public/locales/en/translation.json";

declare module "i18next" {
  interface CustomTypeOptions {
    returnNull: false;
    returnObjects: false;
    resources: { translation: typeof translation };
  }
}
