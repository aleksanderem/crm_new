# CRM — Pozostałe prace

Stan na: 2026-02-11

---

## Co jest GOTOWE

- Schema + backend Convex (wszystkie tabele i API: products, calls, scheduledActivities, notes, savedViews, lostReasons, sources, activityTypes, customFields, orgSettings)
- Shared UI: Enhanced DataTable, filtering, saved views tabs, mini charts, bulk actions, side panel, relationship field
- Wszystkie strony entity index: contacts, companies, leads, activities, calls, products, documents, pipelines
- Wszystkie strony entity detail: leads (redesign sidebar+tabs), contacts, companies
- Custom field hooks (`useCustomFieldColumns`, `useCustomFieldForm`) — podpięte do WSZYSTKICH 5 entity pages
- Activity Types settings page — CRUD działa, icon picker, custom fields per activity type
- Sidebar navigation + i18n
- Kanban board, pipeline chart
- [DONE] Faza A — i18n kompletne: wszystkie detail pages, dashboard, activity-form, activity-detail-drawer, mini-charts, activity-type-form, activity-types settings — 676 kluczy w pl/en translation.json
- [DONE] Faza B — Lost Reasons settings page (260 lines), Sources settings page (224 lines), settings nav updated with both links
- [DONE] Faza C — Dashboard rozbudowa: 10 nowych backend queries (convex/dashboard.ts, 429 lines), KPI cards i18n + PLN, pipeline chart i18n, 8 chart widgets (MiniChartCard z time range), upcoming-activities widget, top-performers widget, grid layout dashboard page (269 lines)
- [DONE] Faza D — Polish & UX: D.1 dark/light mode (already functional), D.2 Global Search with convex/search.ts backend + Ctrl+K command palette wired to 5 entity search indexes + i18n, D.3 Quick Create "+" button opening SidePanel forms for Contact/Company/Deal + navigation for Activity/Call/Document + i18n, layout header fully i18n'd (Search/Settings/Log Out)

---

## Wszystkie fazy ukonczone.
