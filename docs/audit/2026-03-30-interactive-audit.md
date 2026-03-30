# UI Interactive Audit Report

**Date:** 2026-03-30  
**App URL:** http://localhost:5173  
**User:** amiesak@gmail.com (Aleksander Miesak)  
**Auditor:** Automated deep UI audit

---

## Summary

- **Total pages audited:** 30+
- **Total interactive elements tested:** 100+
- **P0 (Crash):** 2
- **P1 (Broken feature):** 12
- **P2 (UX issue):** 8
- **P3 (Cosmetic):** 5

---

## Detailed Findings Table

### 🔴 P0 — Crashes

| Page | Element | Action | Result | Severity |
|------|---------|--------|--------|----------|
| /dashboard/settings/billing | Page load | Navigate | ❌ CRASH — "Something went wrong: Plan not found at handler (../convex/app.ts:175:13)". Error boundary shows; sidebar/nav lost. | P0 |
| /dashboard/gabinet/treatments → "Zarządzaj kategoriami" | Sidebar button | Click | ❌ Navigates to /dashboard/gabinet/settings which is a 404 ("Not Found - TanStack Router"). Full app chrome lost. | P0 |

### 🔴 P1 — Broken Features

| Page | Element | Action | Result | Severity |
|------|---------|--------|--------|----------|
| /dashboard/gabinet/treatments | "Filtr kategorii" sidebar button | Click | 🔇 No reaction — button receives focus but does nothing. No dropdown, no filter panel, no navigation. | P1 |
| /dashboard/gabinet/treatments | "Sortuj wg ceny" sidebar button | Click | 🔇 No reaction — button receives focus but does nothing. No sort applied. | P1 |
| /dashboard/products | "Filtr kategorii" sidebar button | Click | 🔇 No reaction — same issue as treatments page. Button does nothing. | P1 |
| /dashboard/gabinet/treatments | "Aktywny" column cells | Visual inspection | ❌ Shows static green dot (`<span class="bg-green-500">`) instead of clickable toggle/switch. Cannot toggle treatment active state from list. | P1 |
| /dashboard/gabinet/treatments | Kategoria column cells | Click cell | ❌ Clicking Kategoria cell selects the row instead of opening a category selector/picker. | P1 |
| /dashboard/gabinet/treatments (edit form) | Kategoria field | Open edit form | ❌ "Kategoria" is a plain text input, not a category picker component. User must type category name manually. | P1 |
| /dashboard/gabinet/treatments (edit form) | Tag picker | Open edit form | ❌ No tag picker visible in the edit form. Cannot assign tags to treatments from the edit dialog. | P1 |
| /dashboard/contacts | "Eksportuj CSV" sidebar button | Click | 🔇 No reaction — button receives focus but nothing happens. No file download, no dialog. | P1 |
| /dashboard | "Eksportuj raport" sidebar button | Click | 🔇 No reaction — button receives focus but nothing happens. | P1 |
| /dashboard/contacts (detail) | "Akcje" dropdown | Click | ❌ Dropdown does not open. Instead, footer language switcher appears (English/Spanish). The Akcje button's `onClick` seems to trigger the wrong component. | P1 |
| /dashboard/gabinet/patients (detail) | "undefined" text | Visual | ❌ Patient detail page shows "undefined" text next to patient name where lastName should appear. | P1 |
| /dashboard/gabinet/treatments | Smart Agenda widget | Present on page | ⚠️ Smart Agenda widget appears on treatments page (a catalog management page). It's irrelevant here — belongs only on dashboard/calendar pages. | P1 |

### 🟡 P2 — UX Issues

| Page | Element | Action | Result | Severity |
|------|---------|--------|--------|----------|
| /dashboard/contacts | Table row click | Click row body (not checkbox) | ⚠️ Clicking a row selects it ("1 zaznaczony element") instead of navigating to detail. Users expect row click = navigate to detail, checkbox = select. | P2 |
| /dashboard/gabinet/treatments | Table row click | Click row body | ⚠️ Same issue — row click selects instead of navigating to treatment detail. | P2 |
| /dashboard/gabinet/patients | Table row click / name link click | Click patient name link | ⚠️ Even clicking the patient NAME LINK selects the row instead of navigating. The link has an `href` but click doesn't navigate. | P2 |
| /dashboard/companies | Table row click | Click row body | ⚠️ Same row selection behavior across all table pages. | P2 |
| /dashboard/leads | Table row click | Click row body | ⚠️ Same row selection behavior. | P2 |
| /dashboard/gabinet | Sidebar label | Visual | ⚠️ Shows raw i18n key "nav.gabinet.dashboard" instead of translated "Panel Gabinetu". | P2 |
| /dashboard/gabinet/calendar | Sidebar label | Visual | ⚠️ Shows raw i18n key "nav.gabinet.calendar". | P2 |
| /dashboard/gabinet/patients | Sidebar label | Visual | ⚠️ Shows raw i18n key "nav.gabinet.patients". | P2 |

### 🟢 P3 — Cosmetic / Minor

| Page | Element | Action | Result | Severity |
|------|---------|--------|--------|----------|
| /dashboard/gabinet/treatments | Sidebar label | Visual | ⚠️ Shows raw i18n key "nav.gabinet.treatments" | P3 |
| /dashboard/gabinet/packages | Sidebar label | Visual | ⚠️ Shows raw i18n key "nav.gabinet.packages" | P3 |
| /dashboard/gabinet/employees | Sidebar label | Visual | ⚠️ Shows raw i18n key "nav.gabinet.employees" | P3 |
| /dashboard/gabinet/documents | Sidebar label | Visual | ⚠️ Shows raw i18n key "nav.gabinet.documents" | P3 |
| All pages | React warnings | Console | ⚠️ Repeated "Function components cannot be given refs" warnings when opening forms/dialogs. Not user-facing but indicates ref forwarding issues. | P3 |

---

## ✅ Working Elements

| Page | Element | Action | Result |
|------|---------|--------|--------|
| /dashboard | "Widok lejka" button | Click | ✅ Navigates to /dashboard/leads |
| /dashboard | "Dodaj transakcję" button | Click | ✅ Opens "Nowa transakcja" dialog with form |
| /dashboard | "Dzisiejsze aktywności" button | Click | ✅ Navigates to /dashboard/activities |
| /dashboard | Dashboard widgets | Render | ✅ All stat cards render (Kontakty, Pipeline, Win Rate, etc.) |
| /dashboard | SMART AGENDA widget | Render | ✅ Shows upcoming activities, tab switch works |
| /dashboard/contacts | Page load | Navigate | ✅ Renders with stats, table, sidebar |
| /dashboard/contacts | Search | Type "Test" | ✅ Filters contacts in real-time |
| /dashboard/contacts | Column sort (Kontakt) | Click header | ✅ Sorts ascending/descending with live feedback |
| /dashboard/contacts | "Importuj CSV" button | Click | ✅ Opens import dialog with file input |
| /dashboard/contacts | "Zapisane widoki" button | Click | ✅ Opens create view dialog |
| /dashboard/contacts | "Dodaj kontakt" sidebar button | Click | ✅ Opens new contact form |
| /dashboard/contacts | "Filters" button | Click | ✅ Opens filter panel with Add Filter, Tags, Kategorie |
| /dashboard/contacts | Add filter | Click "Add filter" | ✅ Adds filter row with field/condition/value selectors |
| /dashboard/contacts | Row ⋮ menu | Click | ✅ Opens dropdown with Edytuj/Usuń options |
| /dashboard/contacts (detail) | Page render | Navigate | ✅ Shows contact details, tabs, activity timeline |
| /dashboard/contacts (detail) | Edit button | Click | ✅ Opens edit form with fields populated |
| /dashboard/contacts (detail) | Tabs | Click each | ✅ Wszystkie, Aktywności, Wiadomości e-mail, Dokumenty tabs switch |
| /dashboard/companies | Page load | Navigate | ✅ Renders with stats, table, sidebar |
| /dashboard/companies | "Dodaj firmę" button | Click | ✅ Opens new company form dialog |
| /dashboard/leads | Page load | Navigate | ✅ Renders with pipeline stats, table |
| /dashboard/leads | "Widok Kanban" button | Click | ✅ Navigates to kanban pipeline view |
| /dashboard/pipelines | Kanban view | Render | ✅ Shows columns (New, Qualified, Proposal) with cards |
| /dashboard/activities | Page load | Navigate | ✅ Renders with activities table |
| /dashboard/activities | "Filtruj wg typu" sidebar button | Click | ✅ Opens filter dropdown (Call, Meeting, Email, Task, Wizyta) |
| /dashboard/activities | "Pokaż ukończone" toggle | Click | ✅ Toggles between show/hide completed activities |
| /dashboard/calls | Page load | Navigate | ✅ Renders with calls table and pagination |
| /dashboard/products | Page load | Navigate | ✅ Renders with products table |
| /dashboard/documents | Page load | Navigate | ✅ Renders with documents table, status badges, category labels |
| /dashboard/calendar | Page load | Navigate | ✅ Calendar renders with events |
| /dashboard/calendar | Day/Week/Month toggle | Click | ✅ Switches between views |
| /dashboard/calendar | Navigation arrows | Click | ✅ Navigates between weeks |
| /dashboard/inbox | Page load | Navigate | ✅ Shows email list with tabs (Nieprzeczytane, Wysłane, Oznaczone) |
| /dashboard/inbox | Email click | Click message | ✅ Opens email with reply button |
| /dashboard/email-templates | Page load | Navigate | ✅ Template list with toggles, tabs (Szablony, Gotowe szablony, Układ, etc.) |
| /dashboard/email-templates | Toggle switches | Present | ✅ All switches are functional role="switch" elements |
| /dashboard/gabinet | Dashboard | Navigate | ✅ Renders widgets (Dzisiejsze wizyty, Klienci, Wykonane zabiegi, Oczekujące urlopy) |
| /dashboard/gabinet/calendar | Calendar | Navigate | ✅ Renders appointments with day/week/month switching |
| /dashboard/gabinet/patients | Page load | Navigate | ✅ Renders patients table with stats |
| /dashboard/gabinet/patients (detail) | Page render | Navigate | ✅ Shows patient details, tabs (Przegląd, Wizyty, Dokumenty, Lojalność, Aktywność) |
| /dashboard/gabinet/treatments | Page load | Navigate | ✅ Renders treatments table |
| /dashboard/gabinet/treatments (detail) | Page render | Navigate | ✅ Shows treatment details, stats, tabs |
| /dashboard/gabinet/treatments (detail) | Edit button | Click | ✅ Opens edit form with fields |
| /dashboard/gabinet/employees | Page load | Navigate | ✅ Renders employees table with stats |
| /dashboard/gabinet/packages | Page load | Navigate | ✅ Renders package cards with stats |
| /dashboard/gabinet/documents | Page load | Navigate | ✅ Renders document list with filters |
| /dashboard/settings/profile | Profile page | Navigate | ✅ Avatar, Display Name, Email, Language, Theme sections |
| /dashboard/settings/organization | Org settings | Navigate | ✅ Form with name, website, currency, timezone + Save button |
| /dashboard/settings/team | Team page | Navigate | ✅ Shows members, invite button, usage progress bar |
| /dashboard/settings/mail | Mail settings | Navigate | ✅ Shows providers list with status badges |
| /dashboard/settings/sources | Sources | Navigate | ✅ Toggle switches for each source work |
| /dashboard/settings/lost-reasons | Lost reasons | Navigate | ✅ Toggle switches and settings work |
| /dashboard/settings/pipelines | Pipeline settings | Navigate | ✅ Stage editor with drag handles, create pipeline form |
| /dashboard/settings/automations | Automations | Navigate | ✅ Rules list with toggles, edit buttons, execution log |
| /dashboard/settings (general) | Username + Delete account | Navigate | ✅ Form renders with save/delete buttons |

---

## Priority Bug Summary

### Must Fix (P0)
1. **Billing page crash** — `/dashboard/settings/billing` throws unrecoverable "Plan not found" error
2. **Zarządzaj kategoriami → 404** — Button navigates to non-existent `/dashboard/gabinet/settings` route

### Should Fix (P1)
3. **"Filtr kategorii" button does nothing** — On treatments AND products pages
4. **"Sortuj wg ceny" button does nothing** — On treatments page
5. **Aktywny column is static dot, not toggle** — On treatments page
6. **Category field is plain text input, not picker** — In treatment edit form
7. **No tag picker in treatment edit form**
8. **Kategoria/Tag column click selects row, not opens selector** — On treatments page
9. **"Eksportuj CSV" button does nothing** — On contacts page
10. **"Eksportuj raport" button does nothing** — On dashboard
11. **"Akcje" dropdown doesn't open** — On contact detail page
12. **Patient name shows "undefined"** — On patient detail page
13. **Smart Agenda on treatments page** — Irrelevant widget on catalog management page

### Should Improve (P2)
14. **Row click = select instead of navigate** — App-wide issue across ALL data tables (contacts, companies, leads, treatments, patients, activities)
15. **Missing i18n translations** — Gabinet sidebar shows raw translation keys (nav.gabinet.*)

---

## Recommendations

1. **Immediate:** Fix billing crash (P0) and 404 route (P0)
2. **High priority:** Implement "Filtr kategorii" and "Sortuj wg ceny" functionality
3. **High priority:** Replace static Aktywny dot with Switch component
4. **High priority:** Add CategoryPicker and TagPicker to treatment edit form
5. **Medium:** Fix row click behavior — only checkbox should trigger selection; row click should navigate to detail
6. **Medium:** Add i18n translations for gabinet sidebar labels
7. **Medium:** Implement "Eksportuj CSV" and "Eksportuj raport" or remove the buttons
8. **Low:** Fix React ref forwarding warnings
