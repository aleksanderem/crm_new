import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    returnNull: false;
    returnObjects: false;
    resources: { translation: Record<string, unknown> };
  }
}
