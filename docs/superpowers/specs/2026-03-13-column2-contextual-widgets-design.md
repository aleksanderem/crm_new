# Column 2 Contextual Widgets — Design Spec

Date: 2026-03-13
Status: Draft
Module: Platform (affects CRM + Gabinet sidebar)

## Overview

Rozszerzenie drugiego panelu bocznego (Column 2, 260px) o kontekstowe widgety unikalne per zakladka. Obecnie panel zawiera Workspace Switcher, tytul strony, siatke quick actions i opcjonalnie mini calendar. Nowy design dodaje live metryki, wizualizacje danych, proaktywne nudges, sekcje "moje ostatnie" i smart agendę zastepujaca mini calendar.

## Decyzje projektowe

1. Layout A: metryki na gorze, dane widoczne od razu, akcje i recent ponizej
2. Recent items: personalizowane per user (moje ostatnio edytowane/ogladane rekordy)
3. Nudges: wmieszone w flow widgetow (nie osobna sekcja), kolorowe: czerwony=urgentny, zolty=ostrzezenie, zielony=pozytywny insight
4. Mini calendar zastapiony smart agenda (lista 2-3 najblizszych wydarzen z godzinami)
5. Unikalne widgety per zakladka (pelny scope — 19 zakladek z widgetami + Settings bez zmian)
6. Gabinet Calendar: klik w dzien w kalendarzu zastepuje widgety pelna agenda dnia (wariant A — full takeover z X do zamkniecia)
7. Loyalty nie ma osobnej zakladki — wyswietlany jako widget pod Patients
8. Rozszerzamy `PageContext` o pole `widgets` (nie osobny obiekt `pageWidgets`)

## Architektura Column 2 — uniwersalny stack per zakladka

```
┌─────────────────────────┐
│ Workspace Switcher      │  ← bez zmian
│ (CRM / Gabinet)         │
├─────────────────────────┤
│ Page Title              │
├─────────────────────────┤
│ KPI Row                 │  ← 2-3 kompaktowe metryki
│ (kontekstowe per tab)   │
├─────────────────────────┤
│ Unique Widget           │  ← wizualizacja specyficzna
│ (funnel/chart/timeline) │     per zakladke
├─────────────────────────┤
│ Nudge(s)                │  ← 1-2 proaktywne podpowiedzi
├─────────────────────────┤
│ Quick Actions           │  ← siatka 2-kolumnowa (zachowana)
├─────────────────────────┤
│ Moje Ostatnie           │  ← 3 rekordy per user
├─────────────────────────┤
│ Smart Agenda            │  ← 2-3 najblizsze eventy
└─────────────────────────┘
```

Nie kazda zakladka musi miec wszystkie sekcje. Jesli danych brak (np. brak nadchodzacych eventow), sekcja sie nie renderuje.

## CRM — widgety per zakladka

### 1. Insights (Dashboard)

KPI Row:
- Revenue PLN (hero, duzy) z trendem % vs ub. miesiac
- Pipeline PLN z liczba otwartych dealow

KPI Row 2 (mniejszy):
- Kontakty (total)
- Firmy (total)
- Win rate %

Nudges:
- (czerwony) "X deali do zamkniecia w tym tygodniu"
- (zolty) "X zaleglych aktywnosci"

Quick Actions: Pipeline, + Deal

Smart Agenda: najblizsze aktywnosci z ikonami typow (telefon/spotkanie/mail)

### 2. Deals

KPI Row:
- Otwarte (count)
- Pipeline PLN (total value)
- Win rate %

Unique Widget: Mini funnel — poziome paski per etap pipeline (Lead → Kwalifikacja → Oferta → Wygrana) z liczbami

Nudge: (zolty) "X dealow bez aktywnosci >7 dni"

Quick Actions: + Nowy deal, Kanban, Import CSV, Eksport

Moje Ostatnie: 3 ostatnie deale z wartoscia PLN

Smart Agenda: najblizsze follow-upy/spotkania powiazane z dealami

### 3. Activities

KPI Row:
- Zalegle (overdue count)
- Dzis (today count)
- Completion rate %

Unique Widget: tagi typow aktywnosci z liczbami (Telefon X, Email Y, Spotkanie Z) — kolorowe pilulki

Nudge: (czerwony) "X aktywnosci po terminie — najstarsza Y dni temu"

Quick Actions: + Aktywnosc, Kalendarz

Smart Agenda: nastepne aktywnosci z ikonami typow

### 4. Calendar

KPI Row:
- Dzis (events today)
- Zalegle (overdue)
- Ten tydzien (week total)

Unique Widget: timeline dzisiejszego dnia — pionowa os czasu z progress dots:
- zielony filled = done
- niebieski filled = current/in progress
- szary = upcoming

Nudge: (zolty) "X zaleglych aktywnosci z wczoraj"

Quick Actions: + Aktywnosc, Dzis

### 5. Contacts

KPI Row:
- Kontakty (total)
- Nowe ten tydzien (+N)
- Bez firmy (unlinked count)

Unique Widget: mini pasek zrodel kontaktow (ten miesiac) — stacked bar z legenda (Formularz, Polecenie, Telefon, Import)

Nudge: (zolty) "X kontaktow bez przypisanej firmy"

Quick Actions: + Kontakt, Import CSV

Moje Ostatnie: 3 kontakty z nazwa firmy

### 6. Companies

KPI Row:
- Firmy (total)
- Nowe ten miesiac (+N)
- Revenue PLN (total from deals)

Unique Widget: mini pasek branz — stacked bar z legenda (IT, Handel, Uslugi, Inne)

Nudge: (zolty) "X firm z dealami ale bez aktywnosci >14 dni"

Quick Actions: + Firma, Import CSV

Moje Ostatnie: 3 firmy z liczba dealow

### 7. Inbox

KPI Row:
- Nieprzeczytane (count, czerwone jesli >5)
- Dzis (received today)
- Odp. <24h (response rate %)

Unique Widget: "Czekaja najdluzej" — 3 maile bez odpowiedzi z countdown (3 dni, 2 dni, 1 dzien) kolorowanym od czerwonego do zoltego

Nudge: (czerwony) "X maili bez odpowiedzi >48h"

Quick Actions: Nowy mail, Sync Gmail

Smart Agenda: follow-upy zaplanowane na dzis

### 8. Email Templates

KPI Row:
- Szablony (total count)
- Uzycia miesiecznie (derived: COUNT emails WHERE templateId != null AND createdAt this month)
- Najczesciej uzywany (top template name)

Unique Widget: bestsellery — top 3 szablony z horizontal bar chart (usage count derived from emails table)

Nudge: (zielony) "Szablon X — uzywany Y razy w tym miesiacu"

Quick Actions: + Szablon, Uzyj teraz

Note: Open rate % odlozony na przyszlosc — wymaga integracji tracking pixel w email sending (brak wsparcia w obecnym schema). Uzycia szablonow derivowane z tabeli `emails` po polu `templateId`.

### 9. Products

KPI Row:
- Produkty (total)
- W dealach (used in active deals)
- Top seller (count)

Unique Widget: bestsellery — top 3 produkty z horizontal bar chart (usage in deals)

Nudge: (zolty) "Produkt X — Y dealow w tym tygodniu, rozwaz podniesienie ceny?"

Quick Actions: + Produkt, Import CSV

### 10. Documents

KPI Row:
- Dokumenty (total)
- Nowe ten miesiac (+N)
- Do podpisu (pending signature count)

Unique Widget: tagi typow dokumentow z liczbami (Oferty, Umowy, Inne) — kolorowe pilulki

Nudge: (zolty) "X dokumentow oczekuje na podpis klienta"

Quick Actions: + Upload, Z szablonu

Moje Ostatnie: 3 dokumenty z statusem (Wyslana/Draft/Podpisana)

### 11. Calls

KPI Row:
- Dzis (calls today)
- Odebrane % (answer rate)
- Sr. czas (avg duration mm:ss)

Unique Widget: pasek wynikow rozmow (ten tydzien) — stacked bar z legenda (Sukces, Callback, Brak odpowiedzi)

Nudge: (zolty) "X zaplanowanych callbacks na dzis (godziny)"

Quick Actions: + Log call, + Kontakt

Smart Agenda: callbacks — zaplanowane zwrotki z godzina i kontekstem

### 12. Settings

Bez zmian — pozostaje lista sub-nawigacji settings.

## Gabinet — widgety per zakladka

### 1. Dashboard (NOWE — dotad brak pageContext)

KPI Row hero:
- Wizyty dzis (z liczba potwierdzonych)
- Przychod PLN (z trendem % vs ub. tydzien)

KPI Row 2:
- Pacjenci (total)
- Pracownicy (active count)
- Oblozenosc dzis %

Nudges:
- (zolty) "X wizyt bez potwierdzenia SMS"
- (czerwony) "X wnioskow urlopowych do akceptacji"

Quick Actions: + Wizyta, Kalendarz

Smart Agenda: najblizsze wizyty z imieniem pacjenta, zabiegiem i statusem potwierdzenia (checkmark/question mark)

### 2. Calendar

KPI Row:
- Dzis (appointments today)
- Potwierdzone (confirmed count)
- Wolne sloty (available slots)

Unique Widget: paski obciazenia per pracownik — horizontal bars kolorowane od zielonego (<60%) przez zolty (60-85%) do czerwonego (>85%) z procentem

Nudge: (zolty) "X wizyt bez potwierdzenia SMS — wyslac?"

Quick Actions: + Wizyta, Dzis

Smart Agenda: nastepne wizyty z pacjentem, zabiegiem i pracownikiem

#### Day Agenda Takeover

Po kliknieciu w dzien w kalendarzu (glowny content area), Column 2 przelacza sie z widgetow na pelna agende wybranego dnia:

Header: "[dzien tygodnia], [data]" + "X wizyt · Y wolne sloty" + przycisk X do zamkniecia

Timeline: pionowa os czasu z godzinami, kazda pozycja zawiera:
- Dot statusu: zielony filled = completed, niebieski filled + wieksza kropka = current, szary = upcoming, przerywany teal = wolny slot
- Godzina + imie pacjenta
- Zabieg + czas trwania
- Pracownik + status potwierdzenia (niepotwierdzona = zolty)
- Wolne sloty widoczne jako przerywane wpisy "[HH:MM]–[HH:MM] wolny slot"

Akcja na dole: "Umow wizyte na [data]" — otwiera quick create appointment z pre-filled data

Zamkniecie: klik X przywraca standardowe widgety. Klik w inny dzien przelacza agende.

Mechanizm: rozszerzyc `SidebarSlotContext` o nowy stan `dayAgendaDate`. Gdy ustawiony, Column 2 renderuje agenda zamiast standardowych widgetow. Calendar page ustawia ten stan przez `setDayAgendaDate()`.

Priorytet renderowania Column 2 (od najwyzszego):
1. `sidebarSlotContent` (child page custom content) — jesli ustawiony, renderuje custom content, ignoruje dayAgendaDate i widgety
2. `dayAgendaDate` (day agenda takeover) — jesli ustawiony i brak sidebarSlotContent, renderuje DayTimeline
3. Standardowe widgety z pageContext — domyslny fallback

Wzajemne wykluczenie: `setDayAgendaDate()` NIE czyści `sidebarSlotContent` (i vice versa). Priorytet jest statyczny — sidebarSlotContent zawsze wygrywa. W praktyce nie powinno dojsc do konfliktu bo dayAgendaDate jest ustawiane tylko z Gabinet Calendar, ktory nie uzywa sidebarSlotContent.

Czyszczenie na nawigacji: `dayAgendaDate` jest czyszczone automatycznie przy zmianie route (useEffect w SidebarSlotProvider z dependency na pathname). Dzieki temu przejscie z Calendar na np. Patients resetuje agende. `sidebarSlotContent` jest juz czyszczone w ten sposob w obecnej implementacji.

### 3. Patients

KPI Row:
- Pacjenci (total)
- Nowi ten miesiac (+N)
- Aktywni ten tydzien (unique patients with appointments)

Unique Widget: tagi programu lojalnosciowego z liczbami — Gold, Silver, Bronze (kolorowe pilulki)

Nudge: (teal/pozytywny) "X pacjentow ma urodziny w tym tygodniu"

Quick Actions: + Pacjent, Import CSV

Moje Ostatnie: 3 pacjentow z data ostatniej wizyty

### 4. Treatments

KPI Row:
- Zabiegi (total count in catalog)
- Wykonane miesiecznie (completed this month)
- Sr. cena PLN (average price)

Unique Widget: najpopularniejsze zabiegi — top 3 z horizontal bar chart (execution count this month)

Nudge: (zielony) "Zabieg X +Y% rezerwacji vs ub. miesiac — hit sezonu"

Quick Actions: + Zabieg, Kategorie

### 5. Packages

KPI Row:
- Pakiety (total in catalog)
- Aktywne (currently active patient packages)
- Przychod PLN (from package sales)

Unique Widget: wykorzystanie pakietow — top 3 pakiety z horizontal bar chart (active count)

Nudge: (zolty) "X pakietow blisko wyczerpania (>80% zuzycia)"

Quick Actions: + Pakiet, Zuzycie

### 6. Employees

KPI Row:
- Aktywni (working today/total)
- Na urlopie (on leave count)
- Wnioski urlopowe (pending leave requests)

Unique Widget: "Dzis pracuja" — lista pracownikow z godzinami pracy (badge kolorowy) i statusem:
- Zielony badge: godziny normalne
- Niebieski badge: godziny popoldniowe
- Czerwony badge + przekreslone imie: urlop

Nudge: (pomaranczowy) "X wnioskow urlopowych oczekuje na akceptacje"

Quick Actions: + Pracownik, Grafiki

### 7. Documents

KPI Row:
- Szablony (template count)
- Wygenerowane miesiecznie (generated this month)
- Do podpisu (pending patient signature)

Unique Widget: tagi typow szablonow z liczbami (Zgoda, Recepta, Skierowanie, Zaswiadczenie) — kolorowe pilulki

Nudge: (zolty) "X dokumentow oczekuje na podpis pacjenta"

Quick Actions: + Dokument, Szablony

### 8. Reports (NOWE — dotad brak pageContext)

KPI Row hero:
- Przychod PLN (z trendem % vs ub. miesiac)
- Wizyty (z trendem %)

KPI Row 2:
- Frekwencja % (attendance rate)
- Sr. cena PLN (avg appointment value)
- Wizyty/pacjenta (avg visits per patient)

Unique Widget: top pracownik — karta z avatar/trophy, imie, wizyty count, przychod, frekwencja %

Nudge: (zielony) "Frekwencja X% — najlepsza od Y miesiecy!"

Quick Actions: Pelen raport, Eksport PDF

## Implementacja techniczna

### Nowe backend queries (Convex)

Wiele danych jest juz dostepnych przez istniejace queries w `convex/dashboard.ts`. Potrzebne nowe:

1. `dashboard.getRecentItems(organizationId, userId, entityType, limit)` — ostatnio edytowane/ogladane rekordy per user. Wymaga nowej tabeli `recentlyViewed` lub trackowania w `auditLog`.

2. Per-tab nudge queries (NIE monolityczny `getNudges`):
   - `nudges.getDealsNudges(orgId)` — deals bez aktywnosci >7 dni, deals do zamkniecia w tym tygodniu
   - `nudges.getInboxNudges(orgId, userId)` — maile bez odpowiedzi >48h
   - `nudges.getActivitiesNudges(orgId, userId)` — zalegle aktywnosci (overdue)
   - `nudges.getContactsNudges(orgId)` — kontakty bez firmy
   - `nudges.getDocumentsNudges(orgId)` — dokumenty do podpisu (CRM)
   - `gabinet/nudges.getAppointmentNudges(orgId)` — wizyty bez potwierdzenia SMS
   - `gabinet/nudges.getLeaveNudges(orgId)` — wnioski urlopowe pending
   - `gabinet/nudges.getPackageNudges(orgId)` — pakiety blisko wyczerpania (>80%)

   Kazda zakladka wywoluje tylko swoje 1-2 nudge queries. Dzieki temu zmiana w tabeli `emails` nie powoduje re-renderowania nudges na zakladce Deals. Max 2 nudges renderowane per zakladka, priorytet: czerwony > zolty > zielony.

3. `dashboard.getEntityStats(organizationId, entityType)` — per-entity KPIs (counts, trends, breakdowns). Czesciowo pokryte przez istniejace queries (patrz Appendix A).

4. `gabinet/appointments.getDayAgenda(organizationId, date)` — pelna agenda dnia z pacjentami, zabiegami, pracownikami i statusami. Czesciowo pokryte przez `listByDate`.

5. `gabinet/employees.getTodaySchedule(organizationId)` — kto dzis pracuje z godzinami.

### Frontend components

Nowe komponenty w `src/components/sidebar-widgets/`:

```
sidebar-widgets/
  kpi-row.tsx           — reusable KPI card row (2-3 metryki)
  nudge-card.tsx        — kolorowy alert (red/yellow/green variants)
  recent-items.tsx      — "Moje ostatnie" lista
  smart-agenda.tsx      — lista nadchodzacych eventow
  mini-funnel.tsx       — horizontal bar funnel (Deals)
  bar-ranking.tsx       — horizontal bar chart top-3 (Products, Templates, Treatments)
  source-bar.tsx        — stacked bar z legenda (Contacts sources, Industries, Call outcomes)
  type-tags.tsx         — kolorowe pilulki z liczbami (Activity types, Document types, Loyalty tiers)
  staff-load.tsx        — paski obciazenia pracownikow (Gabinet Calendar)
  staff-schedule.tsx    — lista pracownikow z godzinami (Gabinet Employees)
  day-timeline.tsx      — pelna agenda dnia z timeline (Gabinet Calendar day takeover)
  waiting-list.tsx      — "Czekaja najdluzej" lista (Inbox)
```

Kazdy komponent przyjmuje dane przez props (queries wywolane wyzej w composing component).

### Composing per-tab widgets

W `app-sidebar.tsx`, rozszerzyc `pageContexts` i `gabinetPageContexts` o nowe pole `widgets`:

```typescript
interface PageContext {
  titleKey: string;
  actions: ContextAction[];
  widgets?: SidebarWidgetConfig[];  // NEW
}
```

Alternatywnie, wydzielic osobny obiekt `pageWidgets` mapujacy route key do komponentu widgetow, renderowany w Column 2 miedzy tytulem a actions.

### SidebarSlotContext rozszerzenie

Dla day agenda takeover, rozszerzyc context o:
```typescript
interface SidebarSlotContextValue {
  content: ReactNode | null;
  setContent: (node: ReactNode | null) => void;
  wideContent: boolean;
  setWideContent: (wide: boolean) => void;
  dayAgendaDate: string | null;        // NEW — ISO date string
  setDayAgendaDate: (d: string | null) => void;  // NEW
}
```

Calendar page ustawia `setDayAgendaDate()` na klik w dzien. Column 2 sprawdza `dayAgendaDate` — jesli set, renderuje `DayTimeline` zamiast standardowych widgetow.

### Tracking "moje ostatnie"

Dedykowana tabela `recentlyViewed` (nie audit log — prostsze, szybsze, nie zasmiecamy audit loga).

```typescript
// convex/schema.ts
recentlyViewed: defineTable({
  organizationId: v.id("organizations"),
  userId: v.id("users"),
  entityType: v.string(),   // "contacts" | "companies" | "leads" | "products" | "documents" | "gabinetPatients"
  entityId: v.string(),     // ID rekordu (string bo moze byc z roznych tabel)
  entityLabel: v.string(),  // cached display name for fast rendering
  viewedAt: v.number(),     // Date.now() timestamp
})
  .index("by_user_type", ["organizationId", "userId", "entityType", "viewedAt"])
  .index("by_entity", ["entityId"])
```

Eviction: synchroniczna w upsert mutation. Przy kazdym upsert sprawdzamy count per (userId, entityType) — jesli >= 50, usuwamy najstarsze wpisy ponad limit w tej samej mutacji. Brak scheduled job.

Upsert trigger: mutacja `recentlyViewed.track(organizationId, userId, entityType, entityId, entityLabel)` wywolywana z frontendu przy otwarciu detail view (np. kontakt, firma, pacjent). Jesli wpis juz istnieje (ten sam entityId), aktualizujemy `viewedAt`.

Zakladki z "Moje Ostatnie":
| Zakladka | entityType | Kryterium wlaczenia |
|---|---|---|
| CRM Deals | `leads` | list→detail navigation |
| CRM Contacts | `contacts` | list→detail navigation |
| CRM Companies | `companies` | list→detail navigation |
| CRM Documents | `documents` | list→detail navigation |
| Gabinet Patients | `gabinetPatients` | list→detail navigation |

Kryterium: "Moje Ostatnie" pojawia sie tylko na zakladkach z wzorcem list→detail (tabela z klikalnymi wierszami otwierajacymi strone detalu). Zakladki bez tego wzorca (Calendar, Inbox, Settings, Reports, Dashboard) nie maja tej sekcji.

### Obliczanie nudges

Nudges sa obliczane server-side jako dedykowane queries, nie client-side. Kazdy nudge to osobny query z prostym threshold check. Frontend laczy wyniki i renderuje max 2 nudges per zakladka (priorytet: czerwony > zolty > zielony).

## Scope i priorytety

Faza 1 (MVP): KPI Row + Nudges + Quick Actions (zachowane) dla wszystkich 19 zakladek z widgetami (Settings bez zmian). To daje natychmiastowa wartosc bez duzej infrastruktury.

Faza 2: Unique Widgets (funnele, bar charts, timelines, tagi typow) + Smart Agenda

Faza 3: Moje Ostatnie (wymaga nowej tabeli `recentlyViewed`) + Day Agenda Takeover

## Zakladki bez wczesniejszego pageContext (nowe)

Cztery zakladki nie mialy dotad zadnych widgetow/akcji w Column 2:
1. CRM Email Templates — dodajemy KPI + bestsellery + nudge
2. Gabinet Dashboard — dodajemy hero KPIs + nudges + agenda wizyt
3. Gabinet Reports — dodajemy hero KPIs + top performer + nudge
4. (CRM Email Templates tez nie mialy `entityRouteKeys` entry — trzeba dodac)

Wymaga dodania wpisow do `pageContexts`/`gabinetPageContexts` oraz do `entityRouteKeys`/`gabinetRouteKeys` w `app-sidebar.tsx`.

## Appendix A: KPI → Query Mapping

Mapowanie kazdego KPI do zrodla danych. "EXISTING" = istniejacy query w `convex/dashboard.ts` lub innym module. "NEW" = nowy query do napisania. "DERIVED" = obliczany z istniejacych danych po stronie frontendu lub przez prosty count query.

### CRM

| Zakladka | KPI | Zrodlo |
|---|---|---|
| Insights | Revenue PLN + trend | EXISTING: `dashboard.getStats` (partial) + NEW: `dashboard.getRevenueTrend` |
| Insights | Pipeline PLN | EXISTING: `dashboard.getStats` → totalPipelineValue |
| Insights | Kontakty/Firmy/Win rate | EXISTING: `dashboard.getStats` |
| Deals | Otwarte count | EXISTING: `dashboard.getStats` → openDeals |
| Deals | Pipeline PLN | EXISTING: `dashboard.getStats` → totalPipelineValue |
| Deals | Win rate % | EXISTING: `dashboard.getStats` → winRate |
| Deals | Mini funnel | EXISTING: `dashboard.getLeadsByStage` |
| Activities | Zalegle/Dzis/Completion | NEW: `dashboard.getActivityStats(orgId, userId)` |
| Calendar | Dzis/Zalegle/Tydzien | DERIVED: from `scheduledActivities` count queries |
| Calendar | Timeline dnia | NEW: `dashboard.getDayTimeline(orgId, date)` |
| Contacts | Total/Nowe/Bez firmy | EXISTING: `dashboard.getStats` (partial) + NEW: count unlinked |
| Contacts | Zrodla | EXISTING: `dashboard.getContactsBySource` |
| Companies | Total/Nowe/Revenue | EXISTING: `dashboard.getStats` (partial) + `dashboard.getCompaniesByIndustry` |
| Companies | Branze | EXISTING: `dashboard.getCompaniesByIndustry` |
| Inbox | Nieprzeczytane/Dzis/Odp rate | NEW: `dashboard.getInboxStats(orgId, userId)` |
| Inbox | Czekaja najdluzej | NEW: `dashboard.getOldestUnanswered(orgId, userId, limit)` |
| Email Templates | Szablony/Uzycia/Top | DERIVED: count `emailTemplates` + count `emails` by templateId |
| Products | Total/W dealach/Top | NEW: `dashboard.getProductStats(orgId)` |
| Products | Bestsellery | NEW: `dashboard.getTopProducts(orgId, limit)` |
| Documents | Total/Nowe/Do podpisu | NEW: `dashboard.getDocumentStats(orgId)` |
| Calls | Dzis/Odebrane/Sr czas | EXISTING: `dashboard.getCallOutcomeOverview` (partial) + NEW: `dashboard.getCallStats(orgId)` |
| Calls | Wyniki rozmow | EXISTING: `dashboard.getCallOutcomeOverview` |

### Gabinet

| Zakladka | KPI | Zrodlo |
|---|---|---|
| Dashboard | Wizyty dzis/Przychod | NEW: `gabinet/dashboard.getStats(orgId)` |
| Dashboard | Pacjenci/Pracownicy/Oblozenosc | NEW: `gabinet/dashboard.getStats(orgId)` |
| Calendar | Dzis/Potwierdzone/Wolne | EXISTING: `gabinet/appointments.listByDate` (count) + `getAvailableSlots` |
| Calendar | Obciazenie pracownikow | NEW: `gabinet/dashboard.getStaffLoad(orgId, date)` |
| Calendar | Day Agenda | EXISTING: `gabinet/appointments.listByDate` (rozszerzony o patient+treatment join) |
| Patients | Total/Nowi/Aktywni | NEW: `gabinet/dashboard.getPatientStats(orgId)` |
| Patients | Loyalty tiers | NEW: `gabinet/loyalty.getTierBreakdown(orgId)` |
| Treatments | Total/Wykonane/Sr cena | NEW: `gabinet/dashboard.getTreatmentStats(orgId)` |
| Treatments | Najpopularniejsze | NEW: `gabinet/dashboard.getTopTreatments(orgId, limit)` |
| Packages | Total/Aktywne/Przychod | NEW: `gabinet/dashboard.getPackageStats(orgId)` |
| Packages | Wykorzystanie | NEW: `gabinet/dashboard.getTopPackages(orgId, limit)` |
| Employees | Aktywni/Urlop/Wnioski | EXISTING: `gabinet/employees.list` + `gabinet/scheduling.listLeaves` |
| Employees | Dzis pracuja | NEW: `gabinet/employees.getTodaySchedule(orgId)` |
| Documents | Szablony/Wygenerowane/Podpis | NEW: `gabinet/dashboard.getDocumentStats(orgId)` |
| Reports | Przychod/Wizyty + trendy | NEW: `gabinet/dashboard.getReportStats(orgId)` |
| Reports | Frekwencja/Sr cena/Wiz per pacj | NEW: `gabinet/dashboard.getReportStats(orgId)` |
| Reports | Top pracownik | NEW: `gabinet/dashboard.getTopPerformer(orgId)` |
