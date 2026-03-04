# Gabinet Module — Runtime Screenshots (Round 2)

Captured: 2026-03-04
User: amiesak@gmail.com (alexem)
Viewport: 1440x900, headless Chromium via Playwright
Module: Gabinet (Klinika i pacjenci)

## Screenshots

| File | Route | What is visible |
|------|-------|-----------------|
| `screenshots/gabinet-calendar.png` | `/dashboard/gabinet/calendar` | Weekly calendar view (2–8 Mar 2026) with appointment blocks for multiple patients (Maria Wiśni…, Anna Kowals…, Jan Nowak, Piotr Zieliński, Katarzyna W…, Tomasz Kam…, Agnieszka L…, Zofia Mazur, Krzysztof Kr…, Michał Szym…, Ewa Dąbrow…, Robert Jank…). Treatment types visible (Masaż leczni…, Mezoterapia, Rehabilitacja…, Peeling che…). Time slots 07:00–17:00. Red current-time indicator on Wednesday. Right sidebar shows selected day detail. Quick actions: "Umów wizytę", "Dodaj pacjenta". |
| `screenshots/gabinet-patients.png` | `/dashboard/gabinet/patients` | Patients list page with header "Pacjenci — Zarządzaj pacjentami kliniki". Stats cards: "Pacjenci wg dnia" (12, last 30 days) and "Pacjenci wg źródła" (12, all time) with bar charts. Tabs: Wszyscy pacjenci / Aktywni / Nieaktywni / + Dodaj widok (0/5). Data table with columns: Pacjent, E-mail, Telefon, Źródło skierowania, Utworzono. Two rows visible: Krzysztof Krawczyk and Zofia Mazur with contact details. Quick actions: Dodaj pacjenta, Umów wizytę, Importuj CSV, Eksportuj CSV. Search bar and column filter. |
| `screenshots/gabinet-documents.png` | `/dashboard/gabinet/documents` | Medical documents page "Dokumenty medyczne — Zarządzaj dokumentami pacjentów, zgodami i kartotekami". Filter dropdowns: Typ (Wszystkie), Status (Wszystkie). Table with columns: Tytuł, Typ, Status, Data, Akcje. Five documents listed: "E2E Archive Test" (Karta medyczna, Zarchiwizowany), "E2E Consent Form" (Zgoda, Podpisany), "Zgoda na zabieg — Piotr Zieliński" (Zgoda, Oczekuje na podpis), "Karta wizyty — Jan Nowak" (Karta medyczna, Szkic), "Zgoda na zabieg — Anna Kowalska" (Zgoda, Podpisany). Action icons for view, edit, sign. |
| `screenshots/gabinet-packages.png` | `/dashboard/gabinet/packages` | Treatment packages page "Pakiety zabiegów — Zarządzaj pakietami i zestawami zabiegów". Three package cards: "Pakiet diagnostyczny" (Konsultacja + USG + EKG + morfologia, 500 PLN, 4 zabiegi, 30 dni, 17% rabat, Aktywny), "Pakiet anti-aging" (Mezoterapia + Botox + peeling chemiczny, 3200 PLN, 3 zabiegi, 180 dni, 15% rabat, 1 aktywnych użyć, Aktywny), "Pakiet rehabilitacyjny (10 sesji)" (10 sesji masażu leczniczego lub rehabilitacji kręgosłupa ze zniżką 20%, 1520 PLN, 2 zabiegi, 90 dni, 20% rabat, 1 aktywnych użyć, Aktywny). Each card has Edytuj and Usuń buttons. |
| `screenshots/gabinet-appointments.png` | `/dashboard/gabinet` | Gabinet main dashboard "Panel Gabinetu — Przegląd operacji kliniki". Four KPI cards: Dzisiejsze wizyty (0), Pacjenci (12), Zabiegi (12), Oczekujące urlopy (0). Two summary sections: "Dzisiejszy harmonogram" (Brak zaplanowanych wizyt na dziś) and "Oczekujące wnioski urlopowe" (Brak oczekujących wniosków). Four quick-nav buttons: Otwórz kalendarz, Pacjenci, Pakiety, Dokumenty. |

S2_DONE
