# Workboard — autonomiczne zadania

Każde zadanie jest samowystarczalne i może być realizowane w osobnym worktree przez niezależnego agenta. Zadania nie mają zależności między sobą (chyba że zaznaczono inaczej).

## WB-01: Gabinet — przypomnienia o wizytach (SMS/email)

Moduł: gabinet
Perspektywa: recepcjonistka chce ustawić automatyczne przypomnienie 24h przed wizytą

Schema ma już pola reminder (appointmentReminders). Brakuje:
- UI w appointment detail: toggle "wyślij przypomnienie" + config (kiedy, kanał)
- Backend: scheduled job (Convex cron lub scheduledFunction) wysyłający reminder
- Settings: konfiguracja domyślnego czasu przypomnienia per organizacja
- Integracja z notification system (createNotificationDirect)

Pliki do przeczytania: convex/gabinet/appointments.ts, convex/schema.ts (szukaj "reminder"), convex/notifications.ts
Kontekst: docs/modules/gabinet.md

## WB-02: Gabinet — samodzielne umawianie wizyt przez pacjenta

Moduł: gabinet (patient portal)
Perspektywa: pacjent chce umówić się na wizytę z telefonu, bez dzwonienia

Brakuje:
- Route w patient portal: /patient/book — lista dostępnych terminów
- Wybór leczenia -> wybór lekarza -> wybór daty/godziny z availableSlots
- Mutacja: bookFromPortal (tworzy appointment ze statusem "pending_confirmation")
- Nowy status "pending_confirmation" w workflow (staff zatwierdza)
- Powiadomienie dla recepcji o nowej rezerwacji

Pliki do przeczytania: src/routes/_app/patient/*, convex/gabinet/appointments.ts, convex/gabinet/patientAuth.ts
Kontekst: docs/modules/gabinet.md

## WB-03: CRM — szablony emaili i sekwencje outreach

Moduł: crm
Perspektywa: handlowiec chce wysłać spersonalizowany email do 20 leadów z jednego szablonu

Brakuje:
- Schema: emailTemplates table (title, subject, body with {{variables}}, category)
- Backend: CRUD + renderTemplate (zmienne z kontaktu/firmy/leada)
- UI: Settings > Email Templates — edytor szablonów (reuse TipTap z document system)
- UI: w compose dialog — "Use template" dropdown
- Bulk action na liście kontaktów/leadów: "Send email from template"

Pliki do przeczytania: convex/emails.ts, src/components/email/compose-dialog.tsx, src/components/documents/template-editor.tsx
Kontekst: docs/modules/crm.md

## WB-04: Platform — raporty i eksporty (cross-module)

Moduł: platform
Perspektywa: właściciel firmy chce widzieć miesięczny raport przychodu i aktywności

Brakuje:
- Route: /dashboard/reports z zakładkami per moduł
- CRM raporty: pipeline velocity, win rate trend, revenue by source, top performers over time
- Gabinet raporty: revenue by treatment, staff utilization, popular time slots, patient retention
- Eksport: CSV/PDF dowolnego raportu
- Filtr dat (zakres, porównanie z poprzednim okresem)

Pliki do przeczytania: src/routes/_app/_auth/dashboard/_layout.tsx (dashboard), convex/leads.ts (getStats), convex/gabinet/appointments.ts
Kontekst: docs/modules/platform-core.md

## WB-05: Platform — unifikacja UX list/detail między modułami

Moduł: platform (cross-cutting)
Perspektywa: użytkownik przełączający się między CRM a Gabinetem oczekuje tego samego UX

Konkretnie:
- Gabinet patient list powinien używać CrmDataTable (ten sam komponent co kontakty/firmy/leady)
- Gabinet treatment list — to samo
- Gabinet employee list — to samo
- Każda lista powinna mieć: saved views, faceted filters, bulk actions, CSV export
- Każdy detail powinien mieć: left sidebar z inline edit, tabbed main area, activity timeline

Pliki do przeczytania: src/components/crm/enhanced-data-table.tsx, src/components/crm/saved-views-tabs.tsx, aktualny gabinet patient list
Kontekst: docs/modules/platform-core.md, docs/modules/gabinet.md

## WB-06: Gabinet — eksport CSV pacjentów i harmonogramu

Moduł: gabinet
Perspektywa: recepcjonistka chce wydrukować harmonogram dnia / wyeksportować listę pacjentów

Brakuje:
- Przycisk "Eksportuj CSV" na patient list (wzoruj się na CRM contact export)
- Przycisk "Drukuj harmonogram" na calendar view -> otwiera print-friendly widok dnia/tygodnia
- Backend query: getDaySchedule(orgId, date) -> lista appointmentów z danymi pacjentów i leczenia

Pliki do przeczytania: src/components/csv/csv-export.tsx (CRM pattern), src/components/gabinet/week-view.tsx
Kontekst: docs/modules/gabinet.md

## WB-07: CRM — automatyczne zadania z przejść pipeline

Moduł: crm
Perspektywa: handlowiec przesuwa deal do etapu "Negocjacje" i system automatycznie tworzy task "Przygotuj ofertę"

Brakuje:
- Schema: pipelineStageActions table (stageId, actionType: "create_activity", config: { activityType, title, dueInDays })
- UI: w pipeline settings, per stage — "Auto-actions" section z listą akcji
- Backend: w updateStage mutation — trigger tworzenia aktywności
- Notifications: powiadomienie przypisanego o nowym zadaniu

Pliki do przeczytania: convex/pipelines.ts, convex/pipelineStages.ts, convex/activities.ts, convex/leads.ts (updateStage)
Kontekst: docs/modules/crm.md

## WB-08: Platform — migracja dokumentów Gabinet na nowy system

Moduł: platform + gabinet
Perspektywa: dane z gabinetDocuments muszą być dostępne w nowym systemie documentInstances

DT-16 stworzył skrypt migracyjny ale nie był uruchomiony. Trzeba:
- Przetestować migrację na danych dev
- Zaktualizować gabinet patient detail żeby używał documentInstances zamiast gabinetDocuments
- Zaktualizować gabinet appointment detail — to samo
- Usunąć stare importy gabinetDocuments z komponentów
- Zweryfikować że podpisy i statusy się zachowały

Pliki do przeczytania: convex/gabinet/migrateGabinetDocuments.ts, src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx
Kontekst: docs/modules/gabinet.md, docs/modules/platform-core.md

## Prioritety

Krytyczne (bezpośrednia wartość dla użytkownika):
- WB-02 (self-booking) — biggest user impact for gabinet
- WB-05 (UX unification) — consistency is platform's value prop
- WB-08 (migration) — technical debt blocking gabinet

Wysokie:
- WB-01 (reminders) — reduces no-shows
- WB-03 (email templates) — daily CRM workflow
- WB-06 (exports) — basic operational need

Średnie:
- WB-04 (reports) — valuable but complex
- WB-07 (pipeline automation) — nice to have
