// i18next type augmentation.
//
// NOTE: we deliberately do NOT type `resources` here. Typing it with the full
// public/locales/en/translation.json (~208KB, ~4371 keys) makes i18next's
// TFunction overload union so large that the TypeScript checker crashes with
// "Debug Failure. No error for last overload signature" during whole-program
// overload resolution (crashes tsc -p tsconfig.app.json / `npm run build` /
// the Typecheck CI). Translation-key existence is instead guarded at CI by
// scripts/check-i18n-coverage.mjs (i18n-coverage.yml). See the debugging notes
// in the SP2/tsc-fix work.
import "i18next";

declare module "i18next" {
  interface CustomTypeOptions {
    returnNull: false;
    returnObjects: false;
  }
}
