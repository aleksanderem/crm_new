# S3 Screenshot Manifest — Patient / Auth / Runtime Audit

Captured: 2026-03-04
Worker: S3 (screens-patient-audit)
Tool: Playwright (headless Chromium, 1440x900 viewport, 2x DPR)
Server: localhost:5173 (Vite dev server)

## Captured Screenshots

| File | Status | Description |
|------|--------|-------------|
| `screenshots/auth-login-form.png` | OK | Main auth login form at `/login`. Shows Kolabo branding, "Witaj!" header, email+password and OTP code tabs, GitHub OAuth button, Polish locale active. Split layout with marketing copy on right panel. |
| `screenshots/auth-logged-in-dashboard.png` | PARTIAL | Navigated to `/dashboard` — auth guard redirected to `/login`. Page rendered blank (only TanStack Router devtools badge visible). The SPA redirect completed but the login form did not render in the capture window. No authenticated session was available to capture the actual dashboard. |
| `screenshots/patient-portal-login.png` | OK | Patient portal login at `/patient/login`. Shows "Portal Pacjenta" heading, email input with `twoj@email.pl` placeholder, "Wyslij kod" (Send OTP) button. Clean centered card layout. |
| `screenshots/patient-portal-view.png` | REDIRECT | Navigated to `/patient` — redirected to `/patient/login` (no patient session). Content identical to patient-portal-login.png since auth guard redirects unauthenticated patients to login. |
| `screenshots/home-landing.png` | OK | Landing page at `/`. Shows "Production Ready SaaS Stack for Convex" hero, tech stack logos (Convex, TanStack, Stripe, Tailwind, Resend, shadcn/ui), Get Started + Explore Documentation CTAs. |

## Missing / Not Captured

| Expected File | Reason |
|---------------|--------|
| `runtime-error-console.png` | NOT NEEDED — zero console errors detected across all 5 page navigations (home, login, dashboard, patient login, patient portal). No `pageerror` events fired. |
| Authenticated dashboard view | No test credentials or session tokens available. The auth guard correctly prevents unauthenticated access by redirecting to `/login`. |
| Patient portal authenticated view | No patient portal session available (requires OTP flow with valid email + organizationId in localStorage). Auth guard correctly redirects to `/patient/login`. |

## Runtime Observations

Console errors: 0 across all navigated pages.
Page errors (uncaught exceptions): 0.
All auth guards functioning correctly — unauthenticated requests to protected routes redirect to the appropriate login page.
The patient portal login uses a separate OTP-based auth flow (not the main Convex auth), requiring an `organizationId` stored in localStorage.
The main login form offers three auth methods: email+password, one-time code, and GitHub OAuth.

## File Inventory

```
docs/runtime-e2e/screenshots/
  auth-login-form.png          (189 KB) — main auth login
  auth-logged-in-dashboard.png  (27 KB) — blank redirect (no auth session)
  home-landing.png             (718 KB) — landing page
  patient-portal-login.png      (64 KB) — patient OTP login
  patient-portal-view.png       (64 KB) — redirected to patient login
```

S3_DONE
