# Accessibility Audit

## Target Level: WCAG 2.1 AA

The platform targets **WCAG 2.1 Level AA** conformance. This is the level mandated by the EU Web Accessibility Directive (2016/2102/EU) and the Polish implementation act (Ustawa z dnia 4 kwietnia 2019 r. o dostępności cyfrowej stron internetowych i aplikacji mobilnych podmiotów publicznych). Any sale or deployment to a Polish public-sector entity triggers this requirement as a formal contract obligation.

WCAG 2.1 AA covers all Level A and Level AA success criteria from WCAG 2.0 plus the additional 2.1 criteria for mobile and cognitive use. Level AAA is out of scope for this product.

## Scope

All authenticated dashboard screens are in scope. The patient portal (`/patient/*`) is also in scope because it serves end users who may rely on assistive technology. The Convex/Supabase admin tools and CI tooling are out of scope.

## Automated Testing

Automated accessibility scanning is integrated into the end-to-end test suite via `@axe-core/playwright`. The spec is at `e2e/accessibility.spec.ts` and runs as part of `npm run test:e2e`.

The scanner targets the following axe rule tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.

Severity policy:

- **Critical / Serious** violations are hard test failures that block merge.
- **Moderate / Minor** violations are logged to the console and tolerated during the initial remediation phase. They must be tracked and resolved before any public-sector tender submission.

Recharts SVG wrappers are excluded from axe scans because chart data is presented as decorative graphics with accompanying text-based data tables — this is acceptable under WCAG 2.1 1.1.1 (Non-text Content).

The test suite covers the following pages:

- `/dashboard` — main CRM dashboard
- `/dashboard/contacts` — contacts list
- `/dashboard/leads` — leads / deals pipeline
- `/dashboard/companies` — company list
- `/dashboard/gabinet/calendar` — Gabinet appointment calendar
- `/dashboard/settings/team` — team management settings
- Contact create dialog (modal state)
- `/patient/login` — patient portal OTP login (invalid-link state and email-step loading state)

## Keyboard Navigation Coverage

The spec verifies:

- Tab key cycles focus through interactive elements on the contacts page.
- Enter key submits or attempts submission of the contact create form.
- Escape key closes dialogs (contacts, appointments) and dropdown menus.
- Focus trap: focus moves into a dialog when it opens.

These tests cover WCAG 2.1 SC 2.1.1 (Keyboard), 2.1.2 (No Keyboard Trap), and 3.2.2 (On Input).

For the patient portal login page the spec additionally verifies: Tab moves focus from the email input to the send button; Enter on the email field triggers the send-OTP action; the OTP input strips non-digit characters; and the verify button remains disabled until exactly six digits are entered.

## Screen Reader Attributes Coverage

The spec verifies:

- Every `<input>` inside a dialog has at least one accessible identifier: a linked `<label>`, `aria-label`, `aria-labelledby`, `placeholder`, or `name`. This covers WCAG 1.3.1 (Info and Relationships) and 4.1.2 (Name, Role, Value).
- Every dialog has `role="dialog"` and at least one of `aria-label`, `aria-labelledby`, or `aria-describedby`. This covers WCAG 4.1.2.

## Running the Audit

```bash
# Full e2e suite (requires a running app):
npm run test:e2e -- --grep "Accessibility"

# View the HTML report after the run:
npx playwright show-report
```

The Playwright HTML report includes a pass/fail summary per page and lists any axe violations with node selectors and remediation guidance.

## Known Gaps (Remediation Backlog)

The following areas are not yet covered by automated tests and require manual review or additional specs before a formal public-sector accessibility declaration:

- Color contrast in dark mode (Tailwind CSS v4 CSS variable theming — verify contrast ratios for `--color-fg-*` on `--color-bg-*` in dark mode).
- Recharts data tables: verify each chart has a text-based alternative (table or `aria-describedby` summary).
- Patient portal appointment view — axe-core and keyboard tests require a valid portal session; currently only the login page (unauthenticated state) is covered by automated scans.
- PDF document viewer (`src/components/gabinet/document-viewer.tsx`) — PDFs require a tagged-PDF or accessible fallback.
- Mobile / zoom: verify no content is lost at 320 px viewport width (WCAG 1.4.10 Reflow).

## Formal Declaration Timeline

A formal WCAG 2.1 AA conformance statement (Deklaracja dostępności) is required before first public-sector deployment. The statement must be published on the product website and reference the audit date, scope, and any known non-conformances with a remediation timeline. See the EU model declaration template at https://www.gov.pl/web/dostepnosc-cyfrowa for the required Polish-language format.
