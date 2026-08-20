# QUERA — Kontrolowany Scenariusz Przekrojowego E2E

**Issue:** #5645 / korekta pokrycia: #5649
**Data przygotowania:** 2026-08-20
**Korekta pokrycia (SYS1B):** 2026-08-20
**Status:** Gotowy do wykonania (browser E2E zablokowany środowiskowo)
**Przeznaczenie:** Wykonanie manualne lub Playwright po odblokowaniu środowiska

---

## CZĘŚĆ I — DANE WEJŚCIOWE (ENCJE KONTROLOWANE)

### 1.1 Organizacja

| Pole | Wartość |
|---|---|
| Nazwa | QUERA Klinika Sp. z o.o. |
| Plan | Pro (seat limit: 50) |

### 1.2 Lokalizacje

| ID | Nazwa | Adres | isActive |
|---|---|---|---|
| LOC1 | Centrum Medyczne Warszawa | ul. Piękna 10, 00-001 Warszawa | true |
| LOC2 | Filia Kraków | ul. Floriańska 5, 31-019 Kraków | true |

### 1.3 Pracownicy

| ID | Imię i nazwisko | Rola | Lokalizacja primary | Kwalifikacje |
|---|---|---|---|---|
| E1 | Dr. Anna Kowalska | doctor | LOC1 | T1, T2 |
| E2 | mgr Piotr Nowak | therapist | LOC2 | T1 |

### 1.4 Produkt (ze śledzeniem stanu)

| Pole | Wartość |
|---|---|
| ID | P1 |
| Nazwa | Kwas Hialuronowy 1ml |
| SKU | HA-001 |
| Cena zakupu | 50.00 PLN/szt |
| Cena sprzedaży (direct_sale) | 120.00 PLN |
| Stawka VAT (direct_sale) | 23% |
| track_stock | true |
| Jednostka | ml |
| Zużycie na zabieg T1 | 1 szt |

### 1.5 Dostawy (Warehouse Deliveries)

| ID | LOC | Dostawca | Faktura | Produkt | Qty | Cena jedn. | LOT | Data ważności | Wartość |
|---|---|---|---|---|---|---|---|---|---|
| D1 | LOC1 | Dermika Sp.z.o.o. | INV/2026/001 | P1 | 5 | 50.00 PLN | LOT-A | 2026-10-01 | 250.00 PLN |
| D2 | LOC1 | Dermika Sp.z.o.o. | INV/2026/002 | P1 | 3 | 50.00 PLN | LOT-B | 2027-02-01 | 150.00 PLN |
| D3 | LOC2 | Dermika Sp.z.o.o. | INV/2026/003 | P1 | 2 | 55.00 PLN | LOT-C | 2027-05-01 | 110.00 PLN |

**Stan po dostawach:**
- LOC1: LOT-A = 5 szt (exp 2026-10-01) + LOT-B = 3 szt (exp 2027-02-01) → **8 szt łącznie**
- LOC2: LOT-C = 2 szt (exp 2027-05-01) → **2 szt łącznie**
- **FEFO LOC1:** LOT-A wygasa pierwszy → zużycie pobiera z LOT-A dopóki > 0

### 1.6 Zabieg

| Pole | Wartość |
|---|---|
| ID | T1 |
| Nazwa | Mezoterapia twarzy |
| Czas trwania | 60 min |
| Cena gross | 400.00 PLN |
| Zużycie P1 | 1 szt/zabieg |
| Uprawnieni | E1, E2 |
| Dokument wymagany | DOC-CONSENT (isRequired: true, frequency: before_each_visit) |
| Dokument opcjonalny | DOC-INFO (isRequired: false, frequency: once) |

### 1.7 Szablony dokumentów

| ID | Nazwa | isRequired | frequency | requiresSignature | validityDays |
|---|---|---|---|---|---|
| DOC-CONSENT | Zgoda na zabieg mezoterapii | true | before_each_visit | true (click) | null (bezterminowy) |
| DOC-INFO | Informacja o zabiegu i efektach ubocznych | false | once | false | null |

### 1.8 Klient / Pacjent

| Pole | Wartość |
|---|---|
| Imię i nazwisko | Maria Wiśniewska |
| PESEL | 85031512345 |
| Data urodzenia | 1985-03-15 |
| Telefon | +48 600 123 456 |
| Email | maria.wisniewska@test.pl |
| Saldo kredytowe | 0.00 PLN (brak) |
| Historia pakietów | brak (nowy klient) |

### 1.9 Pakiet

| Pole | Wartość |
|---|---|
| ID | PKG1 |
| Nazwa | Pakiet 5x Mezoterapia twarzy |
| Zabiegi | 5x T1 |
| totalPrice | 1,800.00 PLN (vs 5×400 = 2,000; rabat 10%) |
| validityDays | 365 dni |
| loyaltyPointsAwarded | 180 pkt |

### 1.10 Wizyty (plan chronologiczny)

| ID | Data | Godzina | Pracownik | LOC | Zabieg | Pacjent | Płatność | Status flow |
|---|---|---|---|---|---|---|---|---|
| A1 | 2026-09-08 | 10:00–11:00 | E1 | LOC1 | T1 | Maria | PKG1 entry | scheduled→confirmed→in_progress→**completed** |
| A2 | 2026-09-15 | 10:00–11:00 | E1 | LOC1 | T1 | Maria | PKG1 entry | scheduled→**cancelled** |
| A3 | 2026-09-22 | 10:00–11:00 | E1 | LOC1 | T1 | Maria | PKG1 entry | scheduled→**no_show** |
| A4 | 2026-09-29 | 10:00–11:00 | E1 | LOC1 | T1 | Maria | cash 400 PLN | scheduled→confirmed→in_progress→completed→**revert**→completed |
| A5 | 2026-10-06 | 14:00–15:00 | E2 | LOC2 | T1 | Maria | card 400 PLN | scheduled→confirmed→in_progress→**completed** |

**Reguły biznesowe pakietu:**
- `completed` → wejście zużyte (usedCount++)
- `cancelled` → wejście NIE zużyte (przywrócone)
- `no_show` → wejście ZUŻYTE (pacjent odpowiada za obecność)

### 1.11 Direct Sale

| ID | Data | Produkt | Qty | Cena | Pracownik | LOC | Pacjent | PayMethod |
|---|---|---|---|---|---|---|---|---|
| DS1 | 2026-09-29 | P1 | 1 szt | 120.00 PLN | E1 | LOC1 | Maria (opcjonalny) | card |
| DSR1 | 2026-09-29 | DS1 zwrot | 1 szt | -120.00 PLN | E1 | LOC1 | — | card (refund) |

### 1.12 Płatności (kontrolowane kwoty)

| ID | Data | Opis | Kwota brutto | PayMethod | Refund | Kwota netto |
|---|---|---|---|---|---|---|
| PAY-PKG | 2026-09-01 | Sprzedaż PKG1 | 1,800.00 PLN | card | 0.00 | 1,800.00 PLN |
| PAY-A4 | 2026-09-29 | A4 – zabieg indywidualny | 400.00 PLN | cash | -100.00 (częściowy) | 300.00 PLN |
| PAY-A5 | 2026-10-06 | A5 – zabieg indywidualny | 400.00 PLN | card | 0.00 | 400.00 PLN |
| PAY-DS1 | 2026-09-29 | DS1 – sprzedaż produktu | 120.00 PLN | card | -120.00 (pełny) | 0.00 PLN |

### 1.13 Kasa i Sejf (LOC1, 2026-09-29)

| Pozycja | Kwota | Typ |
|---|---|---|
| Stan otwarcia (cashOpeningBalance) | 200.00 PLN | poprzedni cashNextOpening |
| Wpłata A4 (gotówka) | +400.00 PLN | płatność |
| Zwrot A4 częściowy (gotówka) | -100.00 PLN | refund |
| Ręczna wpłata do Kasy (deposit) | +300.00 PLN | nie jest sprzedażą |
| Wypłata z Kasy (withdrawal) | -50.00 PLN | nie jest kosztem |
| **cashExpected** | **750.00 PLN** | 200+400-100+300-50 |
| cashCounted (faktyczna inwentaryzacja) | 740.00 PLN | liczenie fizyczne |
| **discrepancy** | **-10.00 PLN** | 740-750 |
| cashNextOpening | 100.00 PLN | kwota na jutro |
| **cashToSafe** | **640.00 PLN** | 740-100 |

| Pozycja Sejfu | Kwota |
|---|---|
| Transfer Kasa→Sejf | +640.00 PLN |
| Wypłata z Sejfu (np. dostawca) | -200.00 PLN |
| **Saldo Sejfu** | **440.00 PLN** |

---

## CZĘŚĆ II — KROKI SCENARIUSZA (z mapą pokrycia SYS1B)

> Każdy krok zawiera pole `POKRYCIE:` z jednym ze statusów:
> **COVERED** | **PARTIAL** | **UNIT/INTEGRATION ONLY** | **NOT COVERED**

### FAZA 0 — SETUP (jednorazowy, przed scenariuszem)

---

#### KROK 0.1
**AKCJA:** Utwórz lokalizację LOC1
**DANE WEJŚCIOWE:** Nazwa: „Centrum Medyczne Warszawa", Adres: ul. Piękna 10, 00-001 Warszawa, isActive: true
**OCZEKIWANY WYNIK:** LOC1 pojawia się na liście lokalizacji
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings` → Lokalizacje; rekord z nazwą i adresem
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/locations.ts` → `createLocation`

**POKRYCIE: NOT COVERED**
- Istniejący spec: brak
- Żaden plik spec ani test jednostkowy nie weryfikuje tworzenia lokalizacji.
- Brakuje: pełnego browser E2E dla tworzenia LOC, asercji na nazwie i adresie.

---

#### KROK 0.2
**AKCJA:** Utwórz lokalizację LOC2
**DANE WEJŚCIOWE:** Nazwa: „Filia Kraków", Adres: ul. Floriańska 5, 31-019 Kraków, isActive: true
**OCZEKIWANY WYNIK:** LOC2 pojawia się na liście lokalizacji
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings` → Lokalizacje

**POKRYCIE: NOT COVERED**
- Istniejący spec: brak
- Brakuje: jak w 0.1.

---

#### KROK 0.3
**AKCJA:** Utwórz pracownika E1
**DANE WEJŚCIOWE:** Imię: Anna, Nazwisko: Kowalska, Rola: doctor, Lokalizacja primary: LOC1, Email: anna.kowalska@quera.pl
**OCZEKIWANY WYNIK:** E1 widoczny na liście pracowników, przypisany do LOC1
**CO SPRAWDZIĆ:** `/dashboard/gabinet/employees` → rekord E1; zakładka Lokalizacje
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/employees.ts` → `create`

**POKRYCIE: NOT COVERED**
- Istniejący spec: `e2e/gabinet/employees.spec.ts` — ale zawiera wyłącznie testy nawigacji do istniejących rekordów pracownika (`employee history tab`, `employee detail hides the wide shell sidebar`). Brak testu tworzenia pracownika.
- Brakuje: testu tworzenia E1 przez UI, asercji na roli doctor i przypisaniu LOC1.

---

#### KROK 0.4
**AKCJA:** Utwórz pracownika E2
**DANE WEJŚCIOWE:** Imię: Piotr, Nazwisko: Nowak, Rola: therapist, Lokalizacja primary: LOC2, Email: piotr.nowak@quera.pl
**OCZEKIWANY WYNIK:** E2 widoczny na liście pracowników, przypisany do LOC2
**CO SPRAWDZIĆ:** `/dashboard/gabinet/employees` → rekord E2
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/employees.ts` → `create`

**POKRYCIE: NOT COVERED**
- Istniejący spec: `e2e/gabinet/employees.spec.ts` — brak testu tworzenia (patrz 0.3).
- Brakuje: jak w 0.3.

---

### FAZA 1 — PRODUKT I MAGAZYN

---

#### KROK 1.1
**AKCJA:** Utwórz produkt P1 z włączonym śledzeniem stanu
**DANE WEJŚCIOWE:** Nazwa: „Kwas Hialuronowy 1ml", SKU: HA-001, Cena zakupu: 50.00 PLN, Cena sprzedaży: 120.00 PLN, VAT: 23%, track_stock: true, Jednostka: ml
**OCZEKIWANY WYNIK:** Produkt P1 aktywny; kolumna „Stan" wyświetla 0 szt; track_stock widoczny w formularzu
**CO SPRAWDZIĆ:** `/dashboard/products` → wiersz HA-001; Stan = 0
**MODUŁ ŹRÓDŁOWY:** `convex/products.ts` → `create`; tabela `products` w Supabase

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/crm/products.spec.ts` — zawiera test tworzenia produktu przez UI (real browser interaction, asercja na nazwie produktu w body).
- Test nie weryfikuje: pola `track_stock`, kolumny „Stan = 0", kontekstu gabinet inventory. Asercja obejmuje tylko pojawienie się nazwy w liście.
- Brakuje: asercji `track_stock: true`, widoczności kolumny Stan w gabinet, wartości Stan = 0 po utworzeniu.

---

#### KROK 1.2
**AKCJA:** Utwórz dostawę D1 (LOT-A, LOC1)
**DANE WEJŚCIOWE:** Lokalizacja: LOC1, Dostawca: Dermika Sp.z.o.o., Faktura: INV/2026/001, Data: 2026-09-01, Produkt: P1, Qty: 5, Cena jedn.: 50.00 PLN, LOT: LOT-A, Data ważności: 2026-10-01
**OCZEKIWANY WYNIK:** Dostawa D1 ze statusem `posted`; ruch magazynowy +5 w product_stock_movements; Stan P1 @ LOC1 = 5
**CO SPRAWDZIĆ:** `/dashboard/gabinet/magazyn` → Dostawy → D1; Ruchy produktu → +5 LOT-A; Stan P1 @ LOC1 = 5
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts`; tabele `warehouse_deliveries`, `warehouse_delivery_items`, `product_stock_movements`, `product_stock_levels`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test: `tests/convex/inventoryAvgCost.test.ts` — `applyMovementInternal`, "first receipt with no existing stock level sets avgCost to unit price"; `tests/convex/deliveryPostFromDecisions.test.ts` — postowanie dostaw.
- Brak browser E2E: `e2e/gabinet/inventory.spec.ts` nie istnieje.
- Brakuje: browser E2E dla tworzenia dostawy przez UI, asercji na statusie `posted`, widoczności ruchu +5 LOT-A w tabeli, stanu P1 @ LOC1 = 5.

---

#### KROK 1.3
**AKCJA:** Utwórz dostawę D2 (LOT-B, LOC1)
**DANE WEJŚCIOWE:** Lokalizacja: LOC1, Dostawca: Dermika Sp.z.o.o., Faktura: INV/2026/002, Data: 2026-09-02, Produkt: P1, Qty: 3, Cena jedn.: 50.00 PLN, LOT: LOT-B, Data ważności: 2027-02-01
**OCZEKIWANY WYNIK:** Dostawa D2 `posted`; +3 w ruchach (LOT-B); Stan P1 @ LOC1 = **8**
**CO SPRAWDZIĆ:** Stan P1 @ LOC1 = 8; widoczne 2 LOT-y (LOT-A=5, LOT-B=3)
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts`; `product_stock_movements`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test: jak w 1.2 (inventoryAvgCost, deliveryPostFromDecisions).
- Brakuje: browser E2E, asercji wielolotowej (LOT-A=5, LOT-B=3, suma=8).

---

#### KROK 1.4
**AKCJA:** Utwórz dostawę D3 (LOT-C, LOC2)
**DANE WEJŚCIOWE:** Lokalizacja: LOC2, Dostawca: Dermika Sp.z.o.o., Faktura: INV/2026/003, Data: 2026-09-03, Produkt: P1, Qty: 2, Cena jedn.: 55.00 PLN, LOT: LOT-C, Data ważności: 2027-05-01
**OCZEKIWANY WYNIK:** Dostawa D3 `posted`; Stan P1 @ LOC2 = **2**; LOC1 nie zmieniony (8)
**CO SPRAWDZIĆ:** Stan P1 @ LOC1 = 8 (bez zmian); Stan P1 @ LOC2 = 2
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts`; `product_stock_levels` per location

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test: jak w 1.2. Izolacja per-lokalizacja nie jest weryfikowana osobnym testem jednostkowym.
- Brakuje: browser E2E, asercji na izolacji LOC2 od LOC1.

---

#### KROK 1.5
**AKCJA:** Zweryfikuj planned_usage i projected_deficit
**DANE WEJŚCIOWE:** Filtr: P1, LOC1, horizon: 7 dni (2026-09-08..2026-09-14 — A1 w tym oknie)
**OCZEKIWANY WYNIK:** planned_usage = 1; projected_deficit = 0; brak alarmu
**CO SPRAWDZIĆ:** Karta produktu P1 → Prognoza zużycia; widget Shopping List pokazuje P1 bez flagi krytycznej
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts` → `getPlannedUsage`, `checkAppointmentShortage`

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak.
- Brakuje: jakiegokolwiek testu dla `getPlannedUsage` / `checkAppointmentShortage` — ani browser E2E, ani jednostkowego.

---

### FAZA 2 — ZABIEG I SZABLONY DOKUMENTÓW

---

#### KROK 2.1
**AKCJA:** Utwórz zabieg T1
**DANE WEJŚCIOWE:** Nazwa: „Mezoterapia twarzy", Czas: 60 min, Cena: 400.00 PLN, Kolor: #3B82F6 (niebieski)
**OCZEKIWANY WYNIK:** T1 aktywny na liście zabiegów, czas 60 min, cena 400.00 PLN
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments` → T1
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts` → `create`

**POKRYCIE: COVERED**
- Istniejący spec: `e2e/gabinet/treatments.spec.ts` — test `"create treatment succeeds"` (describe: `Gabinet — Treatments`)
- Realna interakcja browserowa: TAK — wypełnia formularz (nazwa, czas 60 min, cena), klika Utwórz, asercja `expect(bodyText).toContain(treatmentName)`.
- Brakuje: weryfikacji konkretnych wartości (60 min, 400.00 PLN, kolor) — test używa ogólnych wartości; asercja na nazwie jest wystarczająca dla statusu COVERED.

---

#### KROK 2.2
**AKCJA:** Przypisz produkt P1 do zabiegu T1
**DANE WEJŚCIOWE:** Zabieg: T1, Produkt: P1, Ilość: 1 szt/zabieg
**OCZEKIWANY WYNIK:** Zakładka „Produkty" zabiegu T1 pokazuje P1 × 1 szt
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments/{T1_ID}` → zakładka Produkty
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts`; tabela `gabinetTreatmentProducts`

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak.
- `e2e/gabinet/treatments.spec.ts` nie testuje zakładki Produkty ani przypisania produktu do zabiegu.
- Brakuje: browser E2E otwierającego detail zabiegu → zakładka Produkty → dodanie P1 × 1 szt → asercja.

---

#### KROK 2.3
**AKCJA:** Przypisz uprawnionych pracowników do T1
**DANE WEJŚCIOWE:** Zabieg: T1, Pracownicy: E1 (Dr. Kowalska), E2 (mgr Nowak)
**OCZEKIWANY WYNIK:** T1 → zakładka Pracownicy: E1 i E2 widoczni jako uprawnieni
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments/{T1_ID}` → zakładka Pracownicy
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts`; `gabinetEmployeeTreatments`

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak.
- `e2e/gabinet/treatments.spec.ts` nie testuje zakładki Pracownicy ani kwalifikacji.
- Brakuje: jak w 2.2, dla zakładki Pracownicy.

---

#### KROK 2.4
**AKCJA:** Utwórz szablon dokumentu DOC-CONSENT
**DANE WEJŚCIOWE:** Nazwa: „Zgoda na zabieg mezoterapii", Typ: consent, isRequired: true, frequency: before_each_visit, requiresSignature: true, method: click, validityDays: (pusty = bezterminowy)
**OCZEKIWANY WYNIK:** Szablon DOC-CONSENT zapisany, widoczny w liście szablonów
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings/document-templates` → DOC-CONSENT; isRequired = true; frequency = before_each_visit
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/documentTemplates.ts`; tabela `formTemplates`

**POKRYCIE: COVERED**
- Istniejący spec: `e2e/gabinet/documents.spec.ts` — test `"create template succeeds"` (describe: `Gabinet — Documents`)
- Realna interakcja browserowa: TAK — wypełnia nazwę szablonu, klika Utwórz, asercja `expect(bodyText).toContain(templateName)`.
- Brakuje: weryfikacji pól isRequired=true, frequency=before_each_visit, requiresSignature=true — test nie asertuje tych wartości.

---

#### KROK 2.5
**AKCJA:** Utwórz szablon dokumentu DOC-INFO
**DANE WEJŚCIOWE:** Nazwa: „Informacja o zabiegu i efektach ubocznych", Typ: consent, isRequired: false, frequency: once, requiresSignature: false
**OCZEKIWANY WYNIK:** Szablon DOC-INFO zapisany, isRequired = false
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings/document-templates` → DOC-INFO; isRequired = false; frequency = once
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/documentTemplates.ts`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/documents.spec.ts` — test `"create template succeeds"` (jak w 2.4).
- Realna interakcja browserowa: TAK — ale test tworzy jeden szablon generyczny i nie weryfikuje isRequired=false ani frequency=once.
- Brakuje: asercji na isRequired=false, frequency=once (brak weryfikacji pól checkbox/select w formularzu tworzenia).

---

#### KROK 2.6
**AKCJA:** Przypisz dokumenty do zabiegu T1
**DANE WEJŚCIOWE:** Zabieg: T1; Dodaj DOC-CONSENT (isRequired: true, timing: before_start, frequency: before_each_visit); Dodaj DOC-INFO (isRequired: false, timing: before_start, frequency: once)
**OCZEKIWANY WYNIK:** T1 → zakładka Dokumenty: DOC-CONSENT (wymagany) + DOC-INFO (opcjonalny)
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments/{T1_ID}` → zakładka Dokumenty; pole `requiredFormTemplates`
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts` → `updateTreatmentDocuments`

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak.
- Brakuje: browser E2E dla zakładki Dokumenty w detalu zabiegu.

---

### FAZA 3 — KLIENT

---

#### KROK 3.1
**AKCJA:** Utwórz pacjenta Maria Wiśniewska
**DANE WEJŚCIOWE:** Imię: Maria, Nazwisko: Wiśniewska, PESEL: 85031512345, Data ur.: 1985-03-15, Telefon: +48 600 123 456, Email: maria.wisniewska@test.pl
**OCZEKIWANY WYNIK:** Pacjent aktywny na liście; PESEL i data ur. widoczne; saldo = 0; brak historii
**CO SPRAWDZIĆ:** `/dashboard/gabinet/patients` → Maria Wiśniewska; profil → zakładka Ogólne
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/patients.ts` → `create`

**POKRYCIE: COVERED**
- Istniejący spec: `e2e/gabinet/patients.spec.ts` — test `"create patient with all fields succeeds"` (describe: `Gabinet — Patients`)
- Realna interakcja browserowa: TAK — wypełnia firstName, lastName, email, phone, klika Utwórz, asercja `expect(bodyText).toContain(firstName)`.
- Brakuje: weryfikacji PESEL (85031512345), daty urodzenia, saldo=0, braku historii. Test używa generycznych wartości testowych, nie SYS1-specificznych.

---

### FAZA 4 — PAKIET

---

#### KROK 4.1
**AKCJA:** Utwórz pakiet PKG1
**DANE WEJŚCIOWE:** Nazwa: „Pakiet 5x Mezoterapia twarzy", Zabiegi: T1 × 5, totalPrice: 1800.00 PLN, validityDays: 365, loyaltyPointsAwarded: 180
**OCZEKIWANY WYNIK:** PKG1 aktywny na liście pakietów; widoczna wartość 1800 PLN, 5 wejść T1
**CO SPRAWDZIĆ:** `/dashboard/gabinet/packages` → PKG1; cena, liczba wejść, ważność
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/packages.ts` → `create`

**POKRYCIE: COVERED**
- Istniejący spec: `e2e/gabinet/packages.spec.ts` — test `"create package with treatments succeeds"` (describe: `Gabinet — Packages`)
- Realna interakcja browserowa: TAK — wypełnia nazwę, cenę, klika Dodaj zabieg, klika Utwórz, asercja `expect(bodyText).toContain(pkgName)`.
- Brakuje: weryfikacji konkretnych wartości (1800 PLN, 5×T1, 365 dni, 180 pkt). Test używa ceny 500 i generycznej nazwy.

---

#### KROK 4.2
**AKCJA:** Sprzedaj pakiet PKG1 pacjentce Maria Wiśniewska
**DANE WEJŚCIOWE:** Pacjent: Maria Wiśniewska, Pakiet: PKG1, Cena: 1800.00 PLN, PayMethod: card, Data: 2026-09-01, Pracownik: E1
**OCZEKIWANY WYNIK:** Rekord `gabinetPackageUsage` status=active; treatmentsUsed: [{T1, usedCount:0, totalCount:5}]; expiresAt: 2027-09-01; paidAmount: 1800.00; 180 pkt lojalnościowych dodane
**CO SPRAWDZIĆ:**
- Profil Marii → zakładka Pakiety → PKG1 status=active; 0/5 wejść wykorzystanych
- Profil Marii → zakładka Lojalność → 180 pkt
- Płatności → PAY-PKG: 1800.00 PLN, karta
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/packages.ts` → `purchasePackage`; `gabinetPackageUsage`; `gabinetLoyaltyTransactions`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/packages.spec.ts` — testy `"purchase drawer opens from patient detail packages card"` i `"purchase drawer has package selector and payment method"`.
- Realna interakcja browserowa: TAK — otwiera drawer zakupu z profilu pacjenta, weryfikuje obecność selektora pakietu i metody płatności (`expect(selectCount).toBeGreaterThanOrEqual(1)`). Brak faktycznego kliknięcia Kup.
- Pokrycie backendowe: `tests/convex/appointmentBillingFlow.test.ts` — full path: package purchase → deduction → credit → refund (unit/integration).
- Brakuje: asercji na zakupie PKG1 za 1800 PLN kartą, weryfikacji 180 pkt lojalnościowych w UI, weryfikacji PAY-PKG w liście płatności.

---

#### KROK 4.3
**AKCJA:** Sprawdź numerację wejść PKG1
**DANE WEJŚCIOWE:** Otwórz szczegóły zakupu PKG1 u Marii
**OCZEKIWANY WYNIK:** Wyświetlany stan: T1 0/5 wejść; brak zarezerwowanych wejść
**CO SPRAWDZIĆ:** UI: etykieta X/Y → 0/5
**MODUŁ ŹRÓDŁOWY:** `gabinetPackageUsage.treatmentsUsed`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/packages.spec.ts` — test `"package usage shows used/total count"` sprawdza `/\d+\/\d+/.test(bodyText)` (soft regex na body text).
- Realna interakcja browserowa: TAK — ale asercja jest soft (czy JAKIEKOLWIEK X/Y pojawia się na stronie, nie czy konkretne 0/5).
- Brakuje: asercji na wartościach 0/5 dla PKG1 Marii Wiśniewskiej.

---

### FAZA 5 — KALENDARZ I WIZYTY

---

#### KROK 5.1
**AKCJA:** Utwórz wizytę A1 (scheduled)
**DANE WEJŚCIOWE:** Data: 2026-09-08, Godz: 10:00–11:00, Pracownik: E1, Lokalizacja: LOC1, Zabieg: T1, Pacjent: Maria Wiśniewska, Płatność: PKG1 (wejście z pakietu)
**OCZEKIWANY WYNIK:** A1 status=scheduled; widoczna w kalendarzu LOC1 / E1; PKG1 wejście = zarezerwowane
**CO SPRAWDZIĆ:**
- `/dashboard/gabinet/calendar` → 2026-09-08, slot 10:00 LOC1
- Szczegóły A1: status=scheduled, T1, E1, Maria
- Nie ma jeszcze rozchodu P1
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `create`

**POKRYCIE: COVERED**
- Istniejący spec: `e2e/gabinet/appointment-lifecycle.spec.ts` — test `"create → confirm → complete lifecycle"` (describe: `Gabinet — Appointment Full Lifecycle`)
- Realna interakcja browserowa: TAK — otwiera dialog tworzenia wizyty, wypełnia combobox-y (pracownik, zabieg, pacjent), datę i godzinę, klika Utwórz, asercja na braku error boundary + pojawienie się wizyty w kalendarzu.
- Brakuje: weryfikacji linkowania do PKG1 (entry allocation), asercji status=scheduled dla konkretnego terminu SYS1.

---

#### KROK 5.2
**AKCJA:** Potwierdź wizytę A1 (scheduled → confirmed)
**DANE WEJŚCIOWE:** Wizyta: A1, Status: confirmed
**OCZEKIWANY WYNIK:** A1 status=confirmed; kolor/ikona w kalendarzu zmieniają się
**CO SPRAWDZIĆ:** Szczegóły A1 → status = confirmed
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/appointment-lifecycle.spec.ts` — ten sam test `"create → confirm → complete lifecycle"` zawiera krok potwierdzenia.
- Realna interakcja browserowa: TAK — klika przycisk Potwierdź, asercja `expect(isConfirmed || hasCompleteBtn).toBe(true)`.
- Asercja jest miękka (lub-logika: tekst confirmed LUB obecność przycisku Complete). Nie weryfikuje zmiany koloru w kalendarzu.
- Brakuje: twardej asercji na `status = confirmed`, weryfikacji zmiany wizualizacji w kalendarzu.

---

#### KROK 5.3
**AKCJA:** Podpisz DOC-CONSENT przed wizytą A1 (document gate)
**DANE WEJŚCIOWE:** Wizyta: A1, Dokument: DOC-CONSENT, Podpis: kliknięcie elektroniczne (click), Imię: Maria Wiśniewska
**OCZEKIWANY WYNIK:** DOC-CONSENT status=signed; signedAt zapisane; wizyta A1 może przejść do in_progress
**CO SPRAWDZIĆ:**
- Szczegóły A1 → zakładka Dokumenty → DOC-CONSENT: status=signed
- DOC-INFO: status=pending/draft (opcjonalny, nie blokuje)
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/documents.ts`; `convex/gabinet/_helpers/documentGate.ts`

**POKRYCIE: PARTIAL**
- Istniejący spec browser: `e2e/gabinet/document-send.spec.ts` — test `"document card has a send/sign action available"` weryfikuje obecność akcji Send/Sign i otwarcie dialogu (soft check).
- Istniejący test jednostkowy: `tests/convex/appointmentDocumentCompleteness.test.ts` — pokrywa logikę document gate (jakie dokumenty blokują przejście statusu).
- Brakuje: E2E-owego pełnego flow: otwarcie detalu A1 → zakładka Dokumenty → kliknięcie Podpisz → asercja `status=signed` → weryfikacja braku blokady do in_progress.

---

#### KROK 5.4
**AKCJA:** Rozpocznij wizytę A1 (confirmed → in_progress)
**DANE WEJŚCIOWE:** Wizyta: A1, Status: in_progress
**OCZEKIWANY WYNIK:** A1 status=in_progress; stan P1 jeszcze nie zmieniony
**CO SPRAWDZIĆ:** Szczegóły A1 → status = in_progress; Stan P1 @ LOC1 = 8 (bez zmian)
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/appointment-lifecycle.spec.ts` — w teście lifecyclic przejście do in_progress jest pośrednim krokiem (klika Complete w bloku if hasCompleteBtn). Status in_progress nie jest osobno asertowany.
- Realna interakcja browserowa: TAK — ale in_progress jako stan pośredni nie ma dedykowanej asercji.
- Brakuje: twardej asercji `status = in_progress`, weryfikacji Stan P1 @ LOC1 = 8 (brak zmiany magazynowej przy in_progress).

---

#### KROK 5.5
**AKCJA:** Zakończ wizytę A1 (in_progress → completed)
**DANE WEJŚCIOWE:** Wizyta: A1, Status: completed
**OCZEKIWANY WYNIK:**
- A1 status=completed
- Rozchód P1: -1 z LOT-A (FEFO) → LOT-A=4, LOC1 total=7
- PKG1: usedCount T1 = 1 → 1/5 wejść
- Ruch magazynowy: typ=appointment_usage, delta=-1, LOT=LOT-A, balance_after=7 (LOC1), appointment_id=A1, employee_id=E1
**CO SPRAWDZIĆ:**
- Szczegóły A1: status=completed; zakładka Produkty: P1 -1 szt, LOT-A
- Stan P1 @ LOC1 = 7 (LOT-A=4, LOT-B=3)
- Profil Marii → Pakiety → PKG1: 1/5 wejść
- Ruchy magazynowe P1: rekord z appointment_id=A1, delta=-1, LOT-A
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → status `completed`; `convex/inventory.ts` → `adjustStock`; `gabinetPackageUsage`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący spec browser: `e2e/gabinet/appointment-lifecycle.spec.ts` — test lifecyclic dokonuje kliknięcia Complete i asertuje tekst "completed/zakończona". Nie weryfikuje zmian magazynowych ani PKG1.
- Istniejący test jednostkowy: `tests/convex/appointmentBillingFlow.test.ts` — pokrywa full path: appointment → package deduction (backend, bez browser). `tests/convex/inventoryAvgCost.test.ts` — pokrywa FEFO i `applyMovementInternal`.
- Brakuje: browser E2E weryfikującego Stan P1 @ LOC1 = 7 po completed, PKG1 = 1/5 w profilu Marii, rekordu ruchu z appointment_id i LOT-A.

---

#### KROK 5.6
**AKCJA:** Utwórz wizytę A2 i anuluj ją (cancelled)
**DANE WEJŚCIOWE:** A2: Data 2026-09-15, 10:00, E1, LOC1, T1, Maria, PKG1 entry; Status A2 = cancelled, Powód: „Pacjentka odwołała wizytę", cancelledAt: 2026-09-12
**OCZEKIWANY WYNIK:**
- A2 status=cancelled; cancelledAt zapisane
- PKG1: usedCount NIE zmieniony → nadal 1/5
- Brak ruchu magazynowego (stan P1 bez zmian)
**CO SPRAWDZIĆ:**
- Szczegóły A2: status=cancelled, cancellationReason widoczny
- Stan P1 @ LOC1 = 7 (bez zmian)
- Profil Marii → Pakiety → PKG1: nadal 1/5 (nie 2/5)
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`; brak wywołania `adjustStock`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/packageDeduction.test.ts` — pokrywa edge case: wejścia wyczerpane, pakiet wygasły, treatment-not-in-package; pośrednio pokrywa guard przed podwójnym zużyciem. Brak explicit testu anulowania wizyty bez dedukcji PKG.
- Brak browser E2E: `e2e/gabinet/appointment-lifecycle.spec.ts` nie zawiera testu flow cancel.
- Brakuje: browser E2E tworzącego A2 → zmiana statusu na cancelled → weryfikacja PKG1 = 1/5 bez zmian.

---

#### KROK 5.7
**AKCJA:** Utwórz wizytę A3 i ustaw status no_show
**DANE WEJŚCIOWE:** A3: Data 2026-09-22, 10:00, E1, LOC1, T1, Maria, PKG1 entry; Status A3 = no_show
**OCZEKIWANY WYNIK:**
- A3 status=no_show
- PKG1: usedCount T1 = 2 → **2/5 wejść** (no_show zużywa wejście per reguła biznesowa)
- Brak ruchu magazynowego (stan P1 bez zmian: LOC1=7)
**CO SPRAWDZIĆ:**
- Szczegóły A3: status=no_show
- Stan P1 @ LOC1 = 7 (bez zmian)
- Profil Marii → Pakiety → PKG1: **2/5 wejść**
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`; `gabinetPackageUsage` (no_show consumes entry)

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak testu pokrywającego no_show + konsumpcję wejścia PKG1.
- Brakuje: testu (browser lub jednostkowego) weryfikującego, że no_show zużywa wejście (PKG1 2/5) ale nie tworzy ruchu magazynowego.

---

#### KROK 5.8
**AKCJA:** Utwórz wizytę A4 (płatność indywidualna)
**DANE WEJŚCIOWE:** A4: Data 2026-09-29, 10:00, E1, LOC1, T1, Maria, Płatność: cash 400.00 PLN
**OCZEKIWANY WYNIK:** A4 status=scheduled; płatność PAY-A4 zaplanowana
**CO SPRAWDZIĆ:** Szczegóły A4: status=scheduled, T1, E1, LOC1, Maria; metoda płatności: cash
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `create`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/appointment-lifecycle.spec.ts` — test tworzenia wizyty przez UI (patrz 5.1).
- Realna interakcja browserowa: TAK — ale metoda płatności cash i linkowanie do konkretnego pacjenta/pracownika nie są weryfikowane w teście.
- Brakuje: asercji na PayMethod=cash, weryfikacji statusu scheduled dla konkretnej wizyty.

---

#### KROK 5.9
**AKCJA:** Przejdź A4 do completed
**DANE WEJŚCIOWE:** A4: scheduled→confirmed→in_progress → completed; Płatność PAY-A4: 400.00 PLN, cash, 2026-09-29
**OCZEKIWANY WYNIK:**
- A4 status=completed; Rozchód P1: -1 z LOT-A (FEFO) → LOT-A=3, LOC1 total=6
- PAY-A4 status=completed, 400.00 PLN cash
**CO SPRAWDZIĆ:**
- Stan P1 @ LOC1 = 6 (LOT-A=3, LOT-B=3)
- Płatności A4: 400.00 PLN, cash, completed
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`; `convex/inventory.ts`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/appointmentBillingFlow.test.ts` — pokrywa billing flow + package deduction (unit). `tests/convex/inventoryAvgCost.test.ts` — pokrywa stock movement.
- Brakuje: browser E2E weryfikującego kompletny przepływ A4 (wszystkie 4 statusy), Stan P1 @ LOC1 = 6 w UI, rekordu PAY-A4 w liście płatności.

---

#### KROK 5.10
**AKCJA:** Cofnij completed A4 (revert do in_progress)
**DANE WEJŚCIOWE:** A4: Status = in_progress (cofnięcie z completed)
**OCZEKIWANY WYNIK:**
- A4 status=in_progress
- Odtworzenie stanu: +1 do LOT-A → LOT-A=4, LOC1 total=7
- Ruch magazynowy: delta=+1, LOT-A, typ=appointment_revert, appointment_id=A4
**CO SPRAWDZIĆ:**
- Szczegóły A4: status=in_progress
- Stan P1 @ LOC1 = 7 (LOT-A=4, LOT-B=3)
- Ruchy P1: dwa ruchy dla A4: -1 (completion) i +1 (revert)
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → revert logic; `convex/inventory.ts` → odwrotny `adjustStock`

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak testu (browser lub jednostkowego) pokrywającego cofnięcie statusu completed→in_progress z odwróceniem ruchu magazynowego.
- Brakuje: zarówno unit testu dla revert logic, jak i browser E2E.

---

#### KROK 5.11
**AKCJA:** Ponowne completed A4 (drugie zakończenie — bez podwójnego rozchodu)
**DANE WEJŚCIOWE:** A4: in_progress → completed (po raz drugi)
**OCZEKIWANY WYNIK:**
- A4 status=completed; net rozchód P1 = -1 (nie -2)
- Łączne ruchy A4: -1 (1. completed) +1 (revert) -1 (2. completed) = net -1 ✓
**CO SPRAWDZIĆ:**
- Stan P1 @ LOC1 = 6 (LOT-A=3, LOT-B=3)
- Ruchy P1 związane z A4: dokładnie 3 rekordy (-1, +1, -1); net = -1
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`; `convex/inventory.ts`; guard: `stockDeducted` flag

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak.
- Brakuje: testu guard `stockDeducted` — zarówno unit jak i browser.

---

#### KROK 5.12
**AKCJA:** Częściowy refund płatności PAY-A4
**DANE WEJŚCIOWE:** Wizyta: A4, Płatność: PAY-A4 (400 PLN, cash), Refund: 100.00 PLN częściowy, PayMethod: cash
**OCZEKIWANY WYNIK:**
- PAY-A4: amount=400, refund_amount=100, status=completed
- Netto dla A4: 300.00 PLN
**CO SPRAWDZIĆ:**
- Płatności A4: refund_amount=100; netto 300
- Cash breakdown: PAY-A4 gross=400, refund=100, net=300
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/payments.ts`; tabela `payments.refund_amount`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/payments.test.ts` — pokrywa tworzenie płatności, aktualizację statusu. `tests/convex/appointmentBillingFlow.test.ts` — pokrywa overpayment credit i authorized refund.
- Brak browser E2E: `e2e/gabinet/payments.spec.ts` nie istnieje.
- Brakuje: browser E2E dla częściowego refund 100 PLN, weryfikacji refund_amount=100 w UI, nettu 300 PLN.

---

#### KROK 5.13
**AKCJA:** Edycja wizyty — przełożenie (reschedule)
**DANE WEJŚCIOWE:** A2b: Data: 2026-09-30, 14:00–15:00, E1, LOC1, T1, Maria, PKG1 entry
**OCZEKIWANY WYNIK:** A2b status=scheduled; A2 pozostaje cancelled; PKG1 usedCount bez zmian (2/5)
**CO SPRAWDZIĆ:** Kalendarz 2026-09-30: slot 14:00 z A2b; A2 cancelled niezmienione
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `create` (nowa wizyta)

> **Uwaga:** A2b NIE jest częścią głównych obliczeń finansowych.

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/appointment-lifecycle.spec.ts` — pokrywa tworzenie wizyty przez UI. `e2e/gabinet/appointments.spec.ts` — zawiera testy tworzenia i zarządzania wizytami.
- Realna interakcja browserowa: TAK — ale reschedule jako kontekst (nowa wizyta w miejsce cancelled) nie jest specyficznie testowany.
- Brakuje: weryfikacji, że PKG1 usedCount pozostaje 2/5 po stworzeniu A2b, asercji na kalendarzu 2026-09-30 dla konkretnego slotu.

---

#### KROK 5.14
**AKCJA:** Weryfikacja konfliktu dostępności
**DANE WEJŚCIOWE:** Próba umówienia wizyty E1 w LOC1 na 2026-09-29 10:30 (nakłada się z A4 10:00–11:00)
**OCZEKIWANY WYNIK:** System zgłasza konflikt dostępności; wizyta nie zostaje zapisana
**CO SPRAWDZIĆ:** UI: komunikat o konflikcie terminu; żadna nowa wizyta nie pojawia się w kalendarzu
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → availability check

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/scheduling.spec.ts` — pokrywa UI harmonogramu, time pickery, toggle isOpen. `e2e/gabinet/appointments.spec.ts` — zawiera testy wizyt.
- Realna interakcja browserowa: TAK (scheduling.spec.ts) — ale nie testuje nakładania terminów wizyt (overlap detection) dla konkretnego pracownika.
- Brakuje: testu próby zapisu wizyty E1 w nakładającym slocie → asercja na komunikacie o konflikcie → wizyta nie pojawia się.

---

#### KROK 5.15
**AKCJA:** Utwórz wizytę A5 (LOC2, E2)
**DANE WEJŚCIOWE:** A5: Data 2026-10-06, 14:00–15:00, E2, LOC2, T1, Maria, Płatność: card 400.00 PLN
**OCZEKIWANY WYNIK:** A5 status=scheduled; E2 widoczny jako dostępny (brak konfliktu w LOC2)
**CO SPRAWDZIĆ:** `/dashboard/gabinet/calendar` przełączony na LOC2 → 2026-10-06 slot 14:00
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/calendar.spec.ts` — pokrywa ładowanie kalendarza, widoki (day/week/month). `e2e/gabinet/appointment-lifecycle.spec.ts` — pokrywa tworzenie wizyt.
- Realna interakcja browserowa: TAK — ale przełączenie na LOC2, wybór E2 i weryfikacja dostępności w kontekście cross-location nie są testowane.
- Brakuje: asercji na przełączeniu lokalizacji na LOC2 w kalendarzu, weryfikacji, że A5 pojawia się w widoku LOC2/E2.

---

#### KROK 5.16
**AKCJA:** Zakończ wizytę A5 (completed, LOC2)
**DANE WEJŚCIOWE:** A5: scheduled→confirmed→in_progress→completed; Płatność: PAY-A5 400.00 PLN, card; Podpis DOC-CONSENT (nowy, before_each_visit)
**OCZEKIWANY WYNIK:**
- A5 status=completed; Rozchód P1 @ LOC2: -1 z LOT-C → LOT-C=1, LOC2 total=1
- PAY-A5: 400.00 PLN, card; DOC-CONSENT A5: nowy rekord signed
**CO SPRAWDZIĆ:**
- Stan P1 @ LOC2 = 1; Stan P1 @ LOC1 = 6 (bez zmian)
- Ruchy P1: -1, LOT-C, A5, E2
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`; `convex/inventory.ts`

**POKRYCIE: PARTIAL**
- Istniejący spec: `e2e/gabinet/appointment-lifecycle.spec.ts` (completion), `e2e/gabinet/document-send.spec.ts` (signing).
- Realna interakcja browserowa: TAK (fragmentarycznie) — completion i signing UI istnieją, ale nie są testowane razem w kontekście before_each_visit przy LOC2.
- Brakuje: E2E-owego flow: completed A5 → nowe podpisanie DOC-CONSENT (before_each_visit) → asercja Stan P1 @ LOC2 = 1, LOC1 = 6 bez zmian.

---

### FAZA 6 — DIRECT SALE

---

#### KROK 6.1
**AKCJA:** Sprzedaj produkt P1 bezpośrednio (direct_sale DS1)
**DANE WEJŚCIOWE:** Produkt: P1, Qty: 1 szt, Cena: 120.00 PLN, Pracownik: E1, LOC: LOC1, Pacjent: Maria (opcjonalnie), PayMethod: card, Data: 2026-09-29
**OCZEKIWANY WYNIK:**
- Ruch: delta=-1, LOT-A (FEFO), typ=direct_sale
- Stan P1 @ LOC1 = **5** (LOT-A=2, LOT-B=3)
- Płatność PAY-DS1: 120.00 PLN, card
**CO SPRAWDZIĆ:**
- Stan P1 @ LOC1 = 5; Ruchy P1: -1, LOT-A, direct_sale
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts` → `directSale`; `product_stock_movements`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/sellStandalone.test.ts` — pokrywa `directSale` path: stock deduction, LOT selection, movement record (unit/integration).
- Brak browser E2E: `e2e/gabinet/inventory.spec.ts` nie istnieje.
- Brakuje: browser E2E dla UI direct_sale, asercji Stan P1 @ LOC1 = 5 w widoku produktu.

---

#### KROK 6.2
**AKCJA:** Zwróć produkt (direct_sale_return DSR1)
**DANE WEJŚCIOWE:** Zwrot DS1: Produkt: P1, Qty: 1 szt, Cena: -120.00 PLN, PayMethod: card (refund), Data: 2026-09-29
**OCZEKIWANY WYNIK:**
- Ruch: delta=+1, LOT-A, typ=direct_sale_return
- Stan P1 @ LOC1 = **6** (LOT-A=3, LOT-B=3)
- PAY-DS1: refund 120.00 PLN, net = 0.00 PLN
**CO SPRAWDZIĆ:**
- Stan P1 @ LOC1 = 6; Ruchy P1: +1, LOT-A, direct_sale_return
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts` → `directSaleReturn`

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak testu dla `directSaleReturn` — ani browser, ani jednostkowego.
- Brakuje: unit testu dla direct_sale_return (zwrot do tego samego LOT, odwrócenie ruchu) i browser E2E.

---

### FAZA 7 — KASA I SEJF

---

#### KROK 7.1
**AKCJA:** Zarejestruj ręczną wpłatę do Kasy (cash deposit)
**DANE WEJŚCIOWE:** LOC: LOC1, Data: 2026-09-29, Typ: deposit, Kwota: 300.00 PLN, Powód: „Wpłata własna — reszta z zakupu"
**OCZEKIWANY WYNIK:** Rekord `gabinetCashTransactions` type=deposit; NIE pojawia się w raporcie sprzedaży
**CO SPRAWDZIĆ:**
- Kasa LOC1 → Historia transakcji → wpłata 300 PLN
- Raport sprzedaży: 300 PLN NIE doliczone do przychodu
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/dayClose.ts` → `createCashTransaction`; `gabinetCashTransactions`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/dayClose.test.ts` — pokrywa logikę cash flow (cashOpeningBalance, cashDeposits, cashExpected); deposit jest częścią kalkulacji.
- Brak browser E2E: `e2e/gabinet/kasa-sejf.spec.ts` nie istnieje.
- Brakuje: browser E2E dla rejestracji wpłaty przez UI i weryfikacji izolacji od raportu sprzedaży.

---

#### KROK 7.2
**AKCJA:** Zarejestruj wypłatę z Kasy (cash withdrawal)
**DANE WEJŚCIOWE:** LOC: LOC1, Data: 2026-09-29, Typ: withdrawal, Kwota: 50.00 PLN, Powód: „Zakup materiałów biurowych"
**OCZEKIWANY WYNIK:** Rekord `gabinetCashTransactions` type=withdrawal; NIE wpływa na obrót
**CO SPRAWDZIĆ:**
- Kasa LOC1 → Historia: wypłata -50 PLN
- Raport: -50 PLN NIE odjęte od przychodu
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/dayClose.ts` → `createCashTransaction`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/dayClose.test.ts` — cashWithdrawals wchodzi do kalkulacji cashExpected; izolacja od przychodu weryfikowana przez strukturę danych.
- Brakuje: browser E2E jak w 7.1.

---

#### KROK 7.3
**AKCJA:** Zamknij dzień (Day Close) dla LOC1 — 2026-09-29
**DANE WEJŚCIOWE:** cashExpected: 750.00 PLN; cashCounted: 740.00 PLN; cashNextOpening: 100.00 PLN; cashToSafe: 640.00 PLN
**OCZEKIWANY WYNIK:** `gabinetDayCloses` rekord zapisany; cashDiscrepancy: -10.00 PLN; cashToSafe: 640.00 PLN
**CO SPRAWDZIĆ:**
- Kasa LOC1 → Zamknięcia → 2026-09-29: discrepancy=-10, cashToSafe=640
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/dayClose.ts` → `createDayClose`; `gabinetDayCloses`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/dayClose.test.ts` — test 1: "correct split persists cashNextOpening and cashToSafe"; test 2: "invalid sum rejected"; test 7: "cashToSafe exceeding cashCounted rejected". Bezpośrednie pokrycie logiki cashExpected, discrepancy, cashToSafe.
- Brakuje: browser E2E dla formularza zamknięcia dnia w UI.

---

#### KROK 7.4
**AKCJA:** Transfer Kasa → Sejf
**DANE WEJŚCIOWE:** LOC: LOC1, Amount: 640.00 PLN, referenceDayCloseId: (ID z kroku 7.3)
**OCZEKIWANY WYNIK:** `gabinetSafeMovements` rekord: type=transfer_in, amount=640.00; Saldo Sejfu LOC1 = 640.00 PLN
**CO SPRAWDZIĆ:**
- Sejf LOC1 → Historia → rekord transfer_in 640 PLN
- Raport: transfer 640 PLN NIEWIDOCZNY w przychodach
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/safe.ts` → `transferToSafe`; `gabinetSafeMovements`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `tests/convex/dayClose.test.ts` — test 4: "positive cashToSafe — exactly one transfer_in movement is created"; test 5: "idempotency — retry does not create a second safe movement".
- Brakuje: browser E2E dla transferu przez UI i asercji w widoku Sejfu.

---

#### KROK 7.5
**AKCJA:** Wypłata z Sejfu
**DANE WEJŚCIOWE:** LOC: LOC1, Kwota: 200.00 PLN, Opis: „Płatność gotówkowa dostawcy Dermika"
**OCZEKIWANY WYNIK:** `gabinetSafeMovements` rekord: type=withdrawal; Saldo Sejfu LOC1 = 440.00 PLN
**CO SPRAWDZIĆ:**
- Sejf LOC1 → Saldo: 440.00 PLN; Historia: withdrawal -200 PLN
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/safe.ts` → `withdrawFromSafe`

**POKRYCIE: NOT COVERED**
- Istniejący spec/test: brak testu dla `withdrawFromSafe` — `tests/convex/dayClose.test.ts` nie pokrywa wypłat z Sejfu (pokrywa wyłącznie transfer_in).
- Brakuje: unit testu dla `withdrawFromSafe` i browser E2E.

---

### FAZA 8 — RAPORTY

---

#### KROK 8.1
**AKCJA:** Sprawdź raport sprzedaży (LOC1 + LOC2, okres 2026-09-01..2026-10-06)
**OCZEKIWANY WYNIK (pre-calculated):**

| Kategoria | Wartość oczekiwana |
|---|---|
| Sprzedaż pakietów (PKG1) | 1,800.00 PLN |
| Zabiegi indywidualne brutto | 800.00 PLN (A4 400 + A5 400) |
| Refundy zabiegów | -100.00 PLN (A4 częściowy) |
| Zabiegi indywidualne netto | **700.00 PLN** |
| Sprzedaż produktów (DS1) | 120.00 PLN |
| Zwroty produktów (DSR1) | -120.00 PLN |
| Sprzedaż produktów netto | **0.00 PLN** |
| **Przychód netto łącznie** | **2,500.00 PLN** |

**CO SPRAWDZIĆ:** `/dashboard/gabinet/reports` → widgety sumaryczne
**MODUŁ ŹRÓDŁOWY:** `src/routes/_app/_auth/dashboard/_layout.gabinet.reports.tsx`

**POKRYCIE: UNIT/INTEGRATION ONLY**
- Istniejący test jednostkowy: `src/routes/_app/_auth/dashboard/gabinet-report-utils.test.ts` — pokrywa funkcje `computePaymentMethodBreakdown`, `computeEmployeeStats`, `computeDailyStats`, `computeStatusStats`, `computeTreatmentStats` (unit testy logiki obliczeniowej).
- Brak browser E2E: `e2e/gabinet/reports.spec.ts` nie istnieje.
- Brakuje: browser E2E ładującego stronę raportów z danymi SYS1 i weryfikującego wartości 2,500.00 PLN.

---

#### KROK 8.2
**AKCJA:** Sprawdź breakdown metod płatności
**OCZEKIWANY WYNIK:**

| Metoda | Brutto | Refund | Netto |
|---|---|---|---|
| card | 2,320.00 PLN | -120.00 PLN | **2,200.00 PLN** |
| cash | 400.00 PLN | -100.00 PLN | **300.00 PLN** |
| **ŁĄCZNIE** | **2,720.00 PLN** | **-220.00 PLN** | **2,500.00 PLN** |

> Ręczna wpłata do Kasy (300 PLN) i wypłata (50 PLN) NIE wchodzą do tego breakdownu.

**CO SPRAWDZIĆ:** Raport → Payment Methods breakdown
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/reports.ts` / Supabase view per payment_method

**POKRYCIE: PARTIAL**
- Istniejący test: `gabinet-report-utils.test.ts` — zawiera testy `computePaymentMethodBreakdown` (logika obliczeniowa, nie E2E).
- Brakuje: browser E2E weryfikującego wartości card=2200, cash=300 w widoku raportu.

---

#### KROK 8.3
**AKCJA:** Sprawdź raport per pracownik
**OCZEKIWANY WYNIK:**

| Pracownik | Przychód |
|---|---|
| E1 (Dr. Kowalska) | **2,100.00 PLN** |
| E2 (mgr Nowak) | **400.00 PLN** |

**POKRYCIE: PARTIAL**
- Istniejący test: `gabinet-report-utils.test.ts` — zawiera testy `computeEmployeeStats` (logika obliczeniowa).
- Brakuje: browser E2E weryfikującego wartości E1=2100, E2=400 w widoku raportu.

---

#### KROK 8.4
**AKCJA:** Sprawdź raport per lokalizacja
**OCZEKIWANY WYNIK:**

| Lokalizacja | Przychód |
|---|---|
| LOC1 | **2,100.00 PLN** |
| LOC2 | **400.00 PLN** |

**POKRYCIE: PARTIAL**
- Istniejący test: `gabinet-report-utils.test.ts` — brak dedykowanej funkcji `computeLocationStats` w imporcie; per-lokalizacja filtrowanie opiera się na zapytaniu Supabase.
- Brakuje: unit testu dla per-location breakdown i browser E2E weryfikującego LOC1=2100, LOC2=400.

---

#### KROK 8.5
**AKCJA:** Sprawdź raport Kasy (LOC1, 2026-09-29)
**OCZEKIWANY WYNIK:**

| Pole | Wartość |
|---|---|
| cashExpected | **750.00 PLN** |
| cashCounted | 740.00 PLN |
| discrepancy | **-10.00 PLN** |
| cashToSafe | 640.00 PLN |
| cashNextOpening | 100.00 PLN |

**POKRYCIE: PARTIAL**
- Istniejący test: `tests/convex/dayClose.test.ts` — pokrywa logikę obliczeniową wszystkich pól (unit). Brak browser E2E strony raportu kasy.
- Brakuje: browser E2E ładującego raport Kasy w UI i weryfikującego wartości 750/740/-10/640/100.

---

#### KROK 8.6
**AKCJA:** Sprawdź raport Sejfu (LOC1)
**OCZEKIWANY WYNIK:**

| Ruch | Kwota |
|---|---|
| Transfer z Kasy (2026-09-29) | +640.00 PLN |
| Wypłata (dostawca) | -200.00 PLN |
| **Saldo Sejfu LOC1** | **440.00 PLN** |

**POKRYCIE: PARTIAL**
- Istniejący test: `tests/convex/dayClose.test.ts` — pokrywa tworzenie ruchu transfer_in (unit). Brak testu dla `getSafeBalance` i brak browser E2E raportu Sejfu.
- Brakuje: unit testu `getSafeBalance` i browser E2E weryfikującego saldo 440 PLN w widoku Sejfu.

---

## CZĘŚĆ III — STAN KOŃCOWY MAGAZYNU

### Ruchy produktu P1 — pełna historia

| Kolejność | Zdarzenie | Typ | LOT | Qty | LOT-A po | LOT-B po | LOC1 total | LOC2 (LOT-C) |
|---|---|---|---|---|---|---|---|---|
| 1 | D1 dostawa | receipt | LOT-A | +5 | **5** | 0 | 5 | 0 |
| 2 | D2 dostawa | receipt | LOT-B | +3 | 5 | **3** | **8** | 0 |
| 3 | D3 dostawa (LOC2) | receipt | LOT-C | +2 | 5 | 3 | 8 | **2** |
| 4 | A1 completed | appointment_usage | LOT-A (FEFO) | -1 | **4** | 3 | **7** | 2 |
| 5 | A2 cancelled | — | — | 0 | 4 | 3 | 7 | 2 |
| 6 | A3 no_show | — | — | 0 | 4 | 3 | 7 | 2 |
| 7 | A4 completed (1) | appointment_usage | LOT-A (FEFO) | -1 | **3** | 3 | **6** | 2 |
| 8 | A4 revert | appointment_revert | LOT-A | +1 | **4** | 3 | **7** | 2 |
| 9 | A4 completed (2) | appointment_usage | LOT-A (FEFO) | -1 | **3** | 3 | **6** | 2 |
| 10 | DS1 direct_sale | direct_sale | LOT-A (FEFO) | -1 | **2** | 3 | **5** | 2 |
| 11 | DSR1 zwrot | direct_sale_return | LOT-A | +1 | **3** | 3 | **6** | 2 |
| 12 | A5 completed (LOC2) | appointment_usage | LOT-C (FEFO) | -1 | 3 | 3 | 6 | **1** |

### Stan końcowy

| Lokalizacja | LOT | Qty końcowy | Data ważności |
|---|---|---|---|
| LOC1 | LOT-A | **3 szt** | 2026-10-01 |
| LOC1 | LOT-B | **3 szt** | 2027-02-01 |
| LOC2 | LOT-C | **1 szt** | 2027-05-01 |
| **ŁĄCZNIE** | | **7 szt** | |

> LOT-A wygasa 2026-10-01. Przy kolejnych wizytach po tej dacie system powinien użyć LOT-B (FEFO).

---

## CZĘŚĆ IV — STAN KOŃCOWY PAKIETU

| Pole | Wartość |
|---|---|
| Status PKG1 | active |
| expiresAt | 2027-09-01 |
| T1 usedCount | 2 (A1 + A3/no_show) |
| T1 totalCount | 5 |
| Pozostałe wejścia | **3/5** |
| Punkty lojalnościowe przyznane | 180 pkt |

---

## CZĘŚĆ V — STAN KOŃCOWY DOKUMENTÓW

| Dokument | Wizyta | Status | signedAt |
|---|---|---|---|
| DOC-CONSENT | A1 | signed | 2026-09-08 |
| DOC-INFO | A1 (raz dla pacjenta) | draft/pending (opcjonalny) | — |
| DOC-CONSENT | A4 | signed | 2026-09-29 (przed_start) |
| DOC-CONSENT | A5 | signed | 2026-10-06 |

> A2 cancelled → brak dokumentów zakończonych.
> A3 no_show → DOC-CONSENT może nie być podpisany (status=draft) — brak blokady przy no_show.

---

## CZĘŚĆ VI — TABELA WARUNKÓW KOŃCOWYCH

| KONTROLA | WARTOŚĆ OCZEKIWANA | ŹRÓDŁO W SYSTEMIE | GDZIE SPRAWDZIĆ W UI |
|---|---|---|---|
| Stan P1 @ LOC1 | **6 szt** (LOT-A=3, LOT-B=3) | `product_stock_levels` per location | Produkt P1 → Stan → LOC1 |
| Stan P1 @ LOC2 | **1 szt** (LOT-C=1) | `product_stock_levels` per location | Produkt P1 → Stan → LOC2 |
| Stan LOT-A | 3 szt | `product_stock_movements` (sum per lot) | Ruchy P1 → filtr LOT-A |
| Stan LOT-B | 3 szt (nienaruszone) | `product_stock_movements` | Ruchy P1 → filtr LOT-B |
| Stan LOT-C | 1 szt | `product_stock_movements` | Ruchy P1 → filtr LOT-C |
| Wejścia PKG1 | 2/5 zużyte, 3/5 pozostałe | `gabinetPackageUsage.treatmentsUsed` | Profil Marii → Pakiety → PKG1 |
| Saldo lojalnościowe Marii | 180 pkt | `gabinetLoyaltyPoints.balance` | Profil Marii → Lojalność |
| Kompletność dokumentacji A1 | signed (DOC-CONSENT) | `formDocuments` status=signed | Wizyta A1 → Dokumenty |
| Kompletność dokumentacji A5 | signed (DOC-CONSENT) | `formDocuments` status=signed | Wizyta A5 → Dokumenty |
| Przychód netto (łączny) | **2,500.00 PLN** | `payments` (sum amount - refund_amount) | Raporty → Przychód netto |
| Breakdown: card netto | **2,200.00 PLN** | `payments` per payment_method=card | Raporty → Metody płatności |
| Breakdown: cash netto | **300.00 PLN** | `payments` per payment_method=cash | Raporty → Metody płatności |
| Przychód E1 (Dr. Kowalska) | **2,100.00 PLN** | payments per employee_id=E1 | Raporty → Pracownicy |
| Przychód E2 (mgr Nowak) | **400.00 PLN** | payments per employee_id=E2 | Raporty → Pracownicy |
| Przychód LOC1 | **2,100.00 PLN** | payments per location_id=LOC1 | Raporty → Lokalizacje |
| Przychód LOC2 | **400.00 PLN** | payments per location_id=LOC2 | Raporty → Lokalizacje |
| Kasa LOC1 — cashExpected | **750.00 PLN** | `gabinetDayCloses.cashExpected` | Kasa → 2026-09-29 |
| Kasa LOC1 — cashCounted | 740.00 PLN | `gabinetDayCloses.cashCounted` | Kasa → 2026-09-29 |
| Kasa LOC1 — discrepancy | **-10.00 PLN** | `gabinetDayCloses.cashDiscrepancy` | Kasa → 2026-09-29 |
| Kasa LOC1 — cashToSafe | **640.00 PLN** | `gabinetDayCloses.cashToSafe` | Kasa → 2026-09-29 |
| Sejf LOC1 — saldo | **440.00 PLN** | `gabinetSafeMovements` (sum transfer_in - withdrawal) | Sejf → LOC1 → Saldo |
| Raport sprzedaży produktów | **0.00 PLN netto** (120-120) | `product_stock_movements` direct_sale/return | Raporty → Produkty |
| Pakiet sprzedaż | **1,800.00 PLN** | `payments` per package_id=PKG1 | Raporty → Pakiety |

---

## CZĘŚĆ VII — ANTY-DUPLIKACJA

### „CZEGO SYSTEM NIE MOŻE POLICZYĆ DRUGI RAZ"

| Ryzyko | Źródło ryzyka | Jak zweryfikować |
|---|---|---|
| **Płatność + sprzedaż** | Ręczna wpłata do Kasy (deposit) 300 PLN NIE jest przychodem ze sprzedaży | Raport sprzedaży: 300 PLN nie wchodzi do sumy; `gabinetCashTransactions.type=deposit` oddzielny od `payments` |
| **Pakiet + wejście** | Sprzedaż PKG1 (1800 PLN) i każde wejście NIE są sumowane | Raport: brak double-count |
| **Kasa → Sejf** | Transfer 640 PLN NIE jest przychodem ani kosztem | Raport sprzedaży: 640 PLN NIE pojawia się |
| **Wypłata z Kasy** | 50 PLN NIE pomniejsza obrotu | Raport sprzedaży: 50 PLN niewidoczne jako koszt |
| **Wypłata z Sejfu** | 200 PLN NIE jest kosztem biznesowym | Raport: -200 PLN niewidoczne w P&L |
| **Cofnięcie completed** | A4 completed→revert→completed: łączny rozchód P1 = -1, nie -2 | Ruchy P1 przy A4: 3 rekordy (-1, +1, -1) → net=-1 |
| **Ponowne completed** | Drugie `completed` A4 NIE tworzy drugiej płatności | PAY-A4 jedna płatność 400 PLN |
| **direct_sale + payments** | DS1 i PAY-DS1 to jeden rekord | Raport: DS1 = 120 PLN tylko raz |
| **Zwrot produktu** | DSR1 (+1 P1) NIE anuluje rozchodu z A1/A4 | Ruchy: DSR1 +1 LOT-A; ruchy A1, A4 osobne |
| **Refund + płatność** | Refund A4 (-100 PLN) widoczny jako refund_amount | `payments.refund_amount=100`; net=300 |
| **no_show + completed** | A3 (no_show) zużywa wejście PKG1, NIE generuje payment | Raport: brak PAY dla A3 |
| **Wejście a1 + no_show** | A1 i A3 zużywają łącznie 2 wejścia PKG1; przychód = 1800 PLN raz | PKG1 total: 1800 PLN raz |
| **unattributedReturns** | DSR1 bez przypiętej oryginalnej transakcji → unattributed | Sprawdź: DSR1 linked do DS1 |

---

## CZĘŚĆ VIII — MAPOWANIE NA ISTNIEJĄCE SPEC FILES PLAYWRIGHT

> **Uwaga SYS1B:** Usunięto wymienione poniżej pliki spec jako nieistniejące. Były one błędnie wskazywane jako istniejące pokrycie w poprzedniej wersji dokumentu:
> - `e2e/gabinet/inventory.spec.ts` — **NIE ISTNIEJE**
> - `e2e/gabinet/payments.spec.ts` — **NIE ISTNIEJE**
> - `e2e/gabinet/kasa-sejf.spec.ts` — **NIE ISTNIEJE**
> - `e2e/gabinet/reports.spec.ts` — **NIE ISTNIEJE**

### Istniejące spec files pokrywające elementy SYS1

| Obszar scenariusza | Istniejący spec file | Konkretne testy | Checkpointy SYS1 |
|---|---|---|---|
| Zabieg CRUD | `e2e/gabinet/treatments.spec.ts` | `"create treatment succeeds"` (asercja contain nazwy) | 2.1 (COVERED) |
| Pacjent CRUD | `e2e/gabinet/patients.spec.ts` | `"create patient with all fields succeeds"` | 3.1 (COVERED) |
| Pakiet CRUD | `e2e/gabinet/packages.spec.ts` | `"create package with treatments succeeds"` | 4.1 (COVERED) |
| Pakiet zakup | `e2e/gabinet/packages.spec.ts` | `"purchase drawer opens..."`, `"purchase drawer has package selector..."` — drawer otwiera się, brak kliknięcia Kup | 4.2 (PARTIAL) |
| Pakiet użycie X/Y | `e2e/gabinet/packages.spec.ts` | `"package usage shows used/total count"` — soft regex | 4.3 (PARTIAL) |
| Wizyty — tworzenie | `e2e/gabinet/appointment-lifecycle.spec.ts` | `"create → confirm → complete lifecycle"` (create step) | 5.1 (COVERED) |
| Wizyty — potwierdzenie | `e2e/gabinet/appointment-lifecycle.spec.ts` | jak wyżej (confirm step, miękka asercja) | 5.2 (PARTIAL) |
| Wizyty — in_progress | `e2e/gabinet/appointment-lifecycle.spec.ts` | jak wyżej (in_progress jako krok pośredni) | 5.4 (PARTIAL) |
| Wizyty — create A4 | `e2e/gabinet/appointment-lifecycle.spec.ts` | jak wyżej (create) | 5.8 (PARTIAL) |
| Wizyty — reschedule | `e2e/gabinet/appointments.spec.ts` + `appointment-lifecycle.spec.ts` | create flow; reschedule context nie testowany | 5.13 (PARTIAL) |
| Konflikty terminu | `e2e/gabinet/scheduling.spec.ts` | availability UI, time pickers, toggle | 5.14 (PARTIAL) |
| Kalendarz multi-loc | `e2e/gabinet/calendar.spec.ts` | day/week/month views; LOC2 switch nie testowany | 5.15 (PARTIAL) |
| Wizyty — A5 completion | `e2e/gabinet/appointment-lifecycle.spec.ts` + `document-send.spec.ts` | completion + signing fragmentarycznie | 5.16 (PARTIAL) |
| Szablony dokumentów | `e2e/gabinet/documents.spec.ts` | `"create template succeeds"` | 2.4 (COVERED), 2.5 (PARTIAL) |
| Dokumenty — signing UI | `e2e/gabinet/document-send.spec.ts` | `"document card has a send/sign action available"` — soft | 5.3 (PARTIAL) |
| Produkt — tworzenie | `e2e/crm/products.spec.ts` | create product (browser, asercja nazwy); bez track_stock | 1.1 (PARTIAL) |
| Lojalność | `e2e/gabinet/loyalty.spec.ts` | loyalty tab exists, points display | — (poza 48 checkpoint.) |
| Portal pacjenta | `e2e/gabinet/portal.spec.ts` | patient login flow | — (poza 48 checkpoint.) |

### Istniejące testy jednostkowe / integracyjne pokrywające elementy SYS1

| Obszar | Plik testu | Pokrywane checkpointy |
|---|---|---|
| Inventory — stock movements, FEFO, avgCost | `tests/convex/inventoryAvgCost.test.ts` | 1.2, 1.3, 1.4 |
| Inventory — delivery posting | `tests/convex/deliveryPostFromDecisions.test.ts` | 1.2, 1.3, 1.4 |
| Inventory — direct sale | `tests/convex/sellStandalone.test.ts` | 6.1 |
| Package billing flow (E2E unit) | `tests/convex/appointmentBillingFlow.test.ts` | 5.5, 5.6, 5.9, 4.2 |
| Package deduction edge cases | `tests/convex/packageDeduction.test.ts` | 5.6 |
| Payments CRUD | `tests/convex/payments.test.ts` | 5.12 |
| Day close — cashExpected, split, safe | `tests/convex/dayClose.test.ts` | 7.1, 7.2, 7.3, 7.4 |
| Document gate logic | `tests/convex/appointmentDocumentCompleteness.test.ts` | 5.3 |
| Report utility functions | `src/routes/.../gabinet-report-utils.test.ts` | 8.1, 8.2, 8.3 |

---

## CZĘŚĆ IX — CHECKLISTA PO ODBLOKOWANIU ENV

Kolejność wykonania po odblokowaniu środowiska browser E2E:

### A. Smoke browser test

Uruchom podstawowy smoke test, który weryfikuje ładowanie aplikacji bez błędów:

```bash
npx playwright test e2e/auth.spec.ts e2e/gabinet/treatments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/packages.spec.ts e2e/gabinet/appointment-lifecycle.spec.ts --reporter=list
```

### B. Magazyn

Uruchomić moduł M2A przez istniejące UI (brak spec, ręczne lub przez helpers):

- Otworzyć `/dashboard/gabinet/magazyn` w przeglądarce
- Zweryfikować, czy UI magazynu renderuje się bez błędu (error boundary check)
- Sprawdzić, czy dostawa przez formularz tworzy ruch w `product_stock_movements`

Brak istniejącego spec — nie tworzyć nowego przed weryfikacją ręczną.

### C. Kalendarz/Wizyty

Uruchomić istniejące spec pliki:

```bash
npx playwright test e2e/gabinet/appointments.spec.ts e2e/gabinet/calendar.spec.ts --reporter=list
```

### D. Uruchomić wszystkie istniejące browser testy pokrywające elementy SYS1

```bash
npx playwright test \
  e2e/gabinet/treatments.spec.ts \
  e2e/gabinet/patients.spec.ts \
  e2e/gabinet/packages.spec.ts \
  e2e/gabinet/appointment-lifecycle.spec.ts \
  e2e/gabinet/appointments.spec.ts \
  e2e/gabinet/calendar.spec.ts \
  e2e/gabinet/scheduling.spec.ts \
  e2e/gabinet/documents.spec.ts \
  e2e/gabinet/document-send.spec.ts \
  e2e/gabinet/employees.spec.ts \
  e2e/crm/products.spec.ts \
  --reporter=list
```

### E. Weryfikacja punktów PARTIAL

Po uruchomieniu testów z punktu D — dla każdego punktu oznaczonego PARTIAL:

1. Sprawdzić, czy test rzeczywiście **przeszedł** (nie tylko się uruchomił).
2. Ocenić, czy istniejąca asercja jest wystarczająca dla SYS1 (czy weryfikuje konkretne wartości, czy tylko miękki check).
3. Udokumentować wynik per checkpoint (pass/fail + ocena asercji).

Checkpointy PARTIAL do weryfikacji: 1.1, 2.5, 4.2, 4.3, 5.2, 5.3, 5.4, 5.8, 5.13, 5.14, 5.15, 5.16, 8.2, 8.3, 8.4, 8.5, 8.6.

### F. Lista brakujących browser speców (dopiero po E)

Dopiero po rzeczywistym wykonaniu testów z kroku E ustalić, dla których punktów PARTIAL istniejący test NIE daje wystarczającej asercji — te będą wymagały nowych spec plików lub rozszerzenia istniejących.

Wstępna lista obszarów wymagających nowych speców (po E):
- Magazyn / LOT tracking / FEFO / dostawy (checkpointy 1.2–1.5, 6.1–6.2)
- Kasa i Sejf (checkpointy 7.1–7.5)
- Raporty z weryfikacją konkretnych wartości (8.1–8.6)
- Brakujące flow: no_show + PKG1 (5.7), revert (5.10–5.11), direct sale return (6.2)

### G. Zasada — nie tworzyć speców wyprzedzająco

Nie tworzyć nowych spec plików (`inventory.spec.ts`, `payments.spec.ts`, `kasa-sejf.spec.ts`, `reports.spec.ts`) tylko dlatego, że dokument wcześniej je zakładał. Nowe spec pliki tworzyć dopiero po: (1) ręcznej weryfikacji że feature działa w UI, (2) potwierdzeniu że istniejące testy nie wystarczają.

---

## CZĘŚĆ X — TABELA POKRYCIA SYS1 (wszystkie 48 punktów)

| SYS1 PUNKT | MODUŁ | STATUS POKRYCIA | ISTNIEJĄCY TEST | BRAKUJĄCA WERYFIKACJA |
|---|---|---|---|---|
| 0.1 | Setup — LOC1 | NOT COVERED | brak | Browser E2E: create location, asercja nazwy |
| 0.2 | Setup — LOC2 | NOT COVERED | brak | Browser E2E: create location LOC2 |
| 0.3 | Setup — E1 | NOT COVERED | `employees.spec.ts` (brak testu create) | Browser E2E: create employee, asercja roli i LOC |
| 0.4 | Setup — E2 | NOT COVERED | `employees.spec.ts` (brak testu create) | Browser E2E: create employee E2 |
| 1.1 | Produkt P1 | PARTIAL | `crm/products.spec.ts` — create product browser | Asercja `track_stock=true`, kolumna Stan=0 w gabinet |
| 1.2 | Dostawa D1 LOT-A | UNIT/INTEGRATION ONLY | `inventoryAvgCost.test.ts`, `deliveryPostFromDecisions.test.ts` | Browser E2E: UI dostawy, asercja status=posted, ruch +5 LOT-A |
| 1.3 | Dostawa D2 LOT-B | UNIT/INTEGRATION ONLY | `inventoryAvgCost.test.ts`, `deliveryPostFromDecisions.test.ts` | Browser E2E: wielolotowa asercja (LOT-A=5, LOT-B=3, suma=8) |
| 1.4 | Dostawa D3 LOT-C LOC2 | UNIT/INTEGRATION ONLY | `inventoryAvgCost.test.ts`, `deliveryPostFromDecisions.test.ts` | Browser E2E: izolacja per-lokalizacja (LOC2=2, LOC1=8 bez zmian) |
| 1.5 | planned_usage | NOT COVERED | brak | Unit test dla `getPlannedUsage`; browser E2E widżetu Shopping List |
| 2.1 | Create T1 | COVERED | `treatments.spec.ts` — `"create treatment succeeds"` | — |
| 2.2 | Assign P1→T1 | NOT COVERED | brak | Browser E2E: zakładka Produkty w detalu T1 |
| 2.3 | Assign E1/E2→T1 | NOT COVERED | brak | Browser E2E: zakładka Pracownicy w detalu T1 |
| 2.4 | Create DOC-CONSENT | COVERED | `documents.spec.ts` — `"create template succeeds"` | — |
| 2.5 | Create DOC-INFO | PARTIAL | `documents.spec.ts` — `"create template succeeds"` | Asercja isRequired=false, frequency=once w formularzu |
| 2.6 | Assign docs→T1 | NOT COVERED | brak | Browser E2E: zakładka Dokumenty w detalu T1 |
| 3.1 | Create Maria | COVERED | `patients.spec.ts` — `"create patient with all fields succeeds"` | — |
| 4.1 | Create PKG1 | COVERED | `packages.spec.ts` — `"create package with treatments succeeds"` | — |
| 4.2 | Sell PKG1 | PARTIAL | `packages.spec.ts` — purchase drawer; `appointmentBillingFlow.test.ts` (unit) | Asercja na zakupie 1800 PLN, 180 pkt, PAY-PKG w UI |
| 4.3 | PKG1 0/5 count | PARTIAL | `packages.spec.ts` — `"package usage shows used/total count"` (soft) | Asercja na konkretnych wartościach 0/5 dla PKG1 Marii |
| 5.1 | Create A1 | COVERED | `appointment-lifecycle.spec.ts` — `"create → confirm → complete lifecycle"` | — |
| 5.2 | Confirm A1 | PARTIAL | `appointment-lifecycle.spec.ts` — confirm step (miękka asercja) | Twarda asercja status=confirmed; zmiana koloru w kalendarzu |
| 5.3 | Sign DOC-CONSENT A1 | PARTIAL | `document-send.spec.ts` + `appointmentDocumentCompleteness.test.ts` (unit) | E2E: pełny gate flow — podpisanie → brak blokady do in_progress |
| 5.4 | Start A1 in_progress | PARTIAL | `appointment-lifecycle.spec.ts` — in_progress jako krok pośredni | Twarda asercja status=in_progress; Stan P1 @ LOC1 = 8 (bez zmian) |
| 5.5 | Complete A1 + FEFO + PKG1 1/5 | UNIT/INTEGRATION ONLY | `appointmentBillingFlow.test.ts`, `inventoryAvgCost.test.ts` | Browser E2E: Stan P1 @ LOC1 = 7, PKG1 = 1/5 w profilu Marii |
| 5.6 | Cancel A2 + PKG1 1/5 | UNIT/INTEGRATION ONLY | `packageDeduction.test.ts` (edge cases) | Browser E2E: cancel flow, PKG1 1/5 bez zmian po cancelu |
| 5.7 | A3 no_show + PKG1 2/5 | NOT COVERED | brak | Unit test: no_show consumes entry; browser E2E: PKG1 2/5 |
| 5.8 | Create A4 (cash) | PARTIAL | `appointment-lifecycle.spec.ts` — create flow | Asercja PayMethod=cash, status=scheduled dla A4 |
| 5.9 | Complete A4 + stock + payment | UNIT/INTEGRATION ONLY | `appointmentBillingFlow.test.ts`, `inventoryAvgCost.test.ts` | Browser E2E: Stan P1 @ LOC1 = 6, PAY-A4 w UI |
| 5.10 | Revert A4 completed→in_progress | NOT COVERED | brak | Unit test revert logic; browser E2E: Stan P1 + 1 po revert |
| 5.11 | Re-complete A4 (no double deduct) | NOT COVERED | brak | Unit test dla `stockDeducted` flag guard; browser E2E |
| 5.12 | Partial refund PAY-A4 | UNIT/INTEGRATION ONLY | `payments.test.ts`, `appointmentBillingFlow.test.ts` | Browser E2E: refund_amount=100, netto 300 PLN w UI |
| 5.13 | Reschedule A2b | PARTIAL | `appointment-lifecycle.spec.ts` + `appointments.spec.ts` — create | Asercja PKG1 2/5 bez zmian po A2b, slot 14:00 w kalendarzu |
| 5.14 | Conflict detection | PARTIAL | `scheduling.spec.ts` — availability UI | Asercja na komunikacie o konflikcie dla nakładającego slotu E1 |
| 5.15 | Create A5 LOC2/E2 | PARTIAL | `calendar.spec.ts` + `appointment-lifecycle.spec.ts` | Asercja na przełączeniu LOC2 w kalendarzu, widoczność A5 |
| 5.16 | Complete A5 + DOC re-sign | PARTIAL | `appointment-lifecycle.spec.ts` + `document-send.spec.ts` | E2E: before_each_visit re-sign przy completion A5, Stan LOC2=1 |
| 6.1 | DS1 direct sale | UNIT/INTEGRATION ONLY | `sellStandalone.test.ts` | Browser E2E: UI direct_sale, Stan P1 @ LOC1 = 5 |
| 6.2 | DSR1 direct sale return | NOT COVERED | brak | Unit test `directSaleReturn`; browser E2E |
| 7.1 | Cash deposit | UNIT/INTEGRATION ONLY | `dayClose.test.ts` — deposit w kalkulacji cashExpected | Browser E2E: UI wpłaty, historia transakcji, izolacja od przychodu |
| 7.2 | Cash withdrawal | UNIT/INTEGRATION ONLY | `dayClose.test.ts` — withdrawal w kalkulacji | Browser E2E: UI wypłaty, historia transakcji |
| 7.3 | Day Close | UNIT/INTEGRATION ONLY | `dayClose.test.ts` — bezpośrednie testy cashExpected, discrepancy, cashToSafe | Browser E2E: formularz zamknięcia dnia w UI |
| 7.4 | Transfer Kasa→Sejf | UNIT/INTEGRATION ONLY | `dayClose.test.ts` — `"positive cashToSafe — exactly one transfer_in"` | Browser E2E: widok Sejfu, rekord transfer_in 640 PLN |
| 7.5 | Safe withdrawal | NOT COVERED | brak | Unit test `withdrawFromSafe`; browser E2E: saldo 440 PLN |
| 8.1 | Sales report total | UNIT/INTEGRATION ONLY | `gabinet-report-utils.test.ts` — compute utility functions | Browser E2E: raporty z wartościami SYS1 (2500 PLN) |
| 8.2 | Payment method breakdown | PARTIAL | `gabinet-report-utils.test.ts` — `computePaymentMethodBreakdown` | Browser E2E: card=2200, cash=300 w widoku raportu |
| 8.3 | Per employee report | PARTIAL | `gabinet-report-utils.test.ts` — `computeEmployeeStats` | Browser E2E: E1=2100, E2=400 w widoku raportu |
| 8.4 | Per location report | PARTIAL | `gabinet-report-utils.test.ts` — brak `computeLocationStats` | Unit test per-location; browser E2E: LOC1=2100, LOC2=400 |
| 8.5 | Kasa LOC1 report | PARTIAL | `dayClose.test.ts` — logika kasy (unit) | Browser E2E: raport kasy z wartościami 750/-10/640/100 |
| 8.6 | Sejf LOC1 report | PARTIAL | `dayClose.test.ts` — transfer_in movement (unit) | Unit test `getSafeBalance`; browser E2E: saldo 440 PLN w UI |

---

## CZĘŚĆ XI — PODSUMOWANIE LICZBOWE

| Status | Liczba punktów |
|---|---|
| COVERED | 5 |
| PARTIAL | 17 |
| UNIT/INTEGRATION ONLY | 13 |
| NOT COVERED | 13 |
| **SUMA** | **48** |

### Breakdown per faza

| Faza | COVERED | PARTIAL | UNIT/INTEGRATION ONLY | NOT COVERED |
|---|---|---|---|---|
| FAZA 0 (0.1–0.4) | 0 | 0 | 0 | 4 |
| FAZA 1 (1.1–1.5) | 0 | 1 | 3 | 1 |
| FAZA 2 (2.1–2.6) | 2 | 1 | 0 | 3 |
| FAZA 3 (3.1) | 1 | 0 | 0 | 0 |
| FAZA 4 (4.1–4.3) | 1 | 2 | 0 | 0 |
| FAZA 5 (5.1–5.16) | 1 | 8 | 5 | 4 |
| FAZA 6 (6.1–6.2) | 0 | 0 | 1 | 1 |
| FAZA 7 (7.1–7.5) | 0 | 0 | 4 | 1 |
| FAZA 8 (8.1–8.6) | 0 | 5 | 1 | 0 |
| **ŁĄCZNIE** | **5** | **17** | **13** | **13** |

---

## CZĘŚĆ XII — ODPOWIEDZI NA PYTANIA KONTROLNE

### Czy dokument SYS1 jest już zgodny z rzeczywistym stanem repo?

TAK. Dokument został zaktualizowany zgodnie z rzeczywistym stanem repozytorium. Każdy z 48 punktów kontrolnych ma przypisany status pokrycia oparty na inspekcji istniejących plików spec w `e2e/gabinet/`, `e2e/crm/` oraz testów jednostkowych/integracyjnych w `tests/convex/` i `src/`.

### Czy wszystkie nieistniejące spec pliki zostały usunięte z deklarowanego pokrycia?

TAK. Następujące pliki zostały usunięte z deklarowanego pokrycia (wymienione explicite w CZĘŚCI VIII):
- `e2e/gabinet/inventory.spec.ts` — nie istnieje
- `e2e/gabinet/payments.spec.ts` — nie istnieje
- `e2e/gabinet/kasa-sejf.spec.ts` — nie istnieje
- `e2e/gabinet/reports.spec.ts` — nie istnieje

Żaden z tych plików nie jest już wymieniany jako istniejące pokrycie.

### Czy zachowano wszystkie wartości kontrolne?

TAK. Następujące wartości biznesowe pozostają niezmienione:
- LOC1 stan końcowy P1: **6 szt** (LOT-A=3, LOT-B=3)
- LOC2 stan końcowy P1: **1 szt** (LOT-C=1)
- PKG1: **2/5** wejść zużytych (A1 + A3 no_show)
- Przychód netto łączny: **2,500.00 PLN**
- Breakdown karta: **2,200.00 PLN** netto; gotówka: **300.00 PLN** netto
- cashExpected: **750.00 PLN**; discrepancy: **-10.00 PLN**; cashToSafe: **640.00 PLN**
- Saldo Sejfu LOC1: **440.00 PLN**
- 13 ryzyk anty-duplikacji (CZĘŚĆ VII)

### Czy powstała gotowa checklista do wykonania po odblokowaniu ENV?

TAK — patrz CZĘŚĆ IX (CHECKLISTA PO ODBLOKOWANIU ENV) z krokami A–G w wymaganej kolejności: smoke test → magazyn przez UI → istniejące specs kalendarza/wizyt → wszystkie istniejące browser testy SYS1 → weryfikacja PARTIAL → identyfikacja brakujących speców → tworzenie nowych speców tylko po potwierdzeniu potrzeby.
