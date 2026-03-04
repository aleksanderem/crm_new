# CRM_NEW — roadmap domknięcia projektu

## Sprint 0 — Stabilizacja bazowa (must-have)

1. Ustawić działające środowisko Convex dla repo (deployment dev).
2. Wygenerować API types (`npx convex codegen`) i naprawić typecheck.
3. Naprawić bieżące TS errors w UI.
4. Zielone: `typecheck`, `lint`, `build`.

## Sprint 1 — Horizontal contracts

1. Spisać i wdrożyć `ModuleContract` (registry schema + runtime validation).
2. Capability keys per horizontal feature.
3. Capability matrix dla planów/subskrypcji.

## Sprint 2 — Cross-module consistency

1. Ujednolicenie list/detail UX pomiędzy CRM i Gabinet.
2. Standaryzacja side-panel flows (create/edit/quick actions).
3. Spójny eventing do activity timeline.

## Sprint 3 — Reliability & Operations

1. Smoke E2E (CRM + Gabinet krytyczne flowy).
2. Error budgets + observability (audit + alerting).
3. Release checklist + definition of done per module.

## Aktualne blokery

- Brak skonfigurowanego `CONVEX_DEPLOYMENT` uniemożliwia `convex codegen`.
- Bez tego część typów API jest niezsynchronizowana.

## Szybkie wygrane (po odblokowaniu Convex)

- Fix `gabinet/patientAuth` typing w route pacjenta.
- Fix `fill` prop mismatch w `src/routes/index.tsx`.
- Wpiąć to do CI gate.
