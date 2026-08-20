# QUERA — Kontrolowany Scenariusz Przekrojowego E2E

**Issue:** #5645  
**Data przygotowania:** 2026-08-20  
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

## CZĘŚĆ II — KROKI SCENARIUSZA

### FAZA 0 — SETUP (jednorazowy, przed scenariuszem)

---

#### KROK 0.1
**AKCJA:** Utwórz lokalizację LOC1  
**DANE WEJŚCIOWE:** Nazwa: „Centrum Medyczne Warszawa", Adres: ul. Piękna 10, 00-001 Warszawa, isActive: true  
**OCZEKIWANY WYNIK:** LOC1 pojawia się na liście lokalizacji  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings` → Lokalizacje; rekord z nazwą i adresem  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/locations.ts` → `createLocation`

---

#### KROK 0.2
**AKCJA:** Utwórz lokalizację LOC2  
**DANE WEJŚCIOWE:** Nazwa: „Filia Kraków", Adres: ul. Floriańska 5, 31-019 Kraków, isActive: true  
**OCZEKIWANY WYNIK:** LOC2 pojawia się na liście lokalizacji  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings` → Lokalizacje  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/locations.ts` → `createLocation`

---

#### KROK 0.3
**AKCJA:** Utwórz pracownika E1  
**DANE WEJŚCIOWE:** Imię: Anna, Nazwisko: Kowalska, Rola: doctor, Lokalizacja primary: LOC1, Email: anna.kowalska@quera.pl  
**OCZEKIWANY WYNIK:** E1 widoczny na liście pracowników, przypisany do LOC1  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/employees` → rekord E1; zakładka Lokalizacje  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/employees.ts` → `create`

---

#### KROK 0.4
**AKCJA:** Utwórz pracownika E2  
**DANE WEJŚCIOWE:** Imię: Piotr, Nazwisko: Nowak, Rola: therapist, Lokalizacja primary: LOC2, Email: piotr.nowak@quera.pl  
**OCZEKIWANY WYNIK:** E2 widoczny na liście pracowników, przypisany do LOC2  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/employees` → rekord E2  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/employees.ts` → `create`

---

### FAZA 1 — PRODUKT I MAGAZYN

---

#### KROK 1.1
**AKCJA:** Utwórz produkt P1 z włączonym śledzeniem stanu  
**DANE WEJŚCIOWE:** Nazwa: „Kwas Hialuronowy 1ml", SKU: HA-001, Cena zakupu: 50.00 PLN, Cena sprzedaży: 120.00 PLN, VAT: 23%, track_stock: true, Jednostka: ml  
**OCZEKIWANY WYNIK:** Produkt P1 aktywny; kolumna „Stan" wyświetla 0 szt; track_stock widoczny w formularzu  
**CO SPRAWDZIĆ:** `/dashboard/products` → wiersz HA-001; Stan = 0  
**MODUŁ ŹRÓDŁOWY:** `convex/products.ts` → `create`; tabela `products` w Supabase

---

#### KROK 1.2
**AKCJA:** Utwórz dostawę D1 (LOT-A, LOC1)  
**DANE WEJŚCIOWE:** Lokalizacja: LOC1, Dostawca: Dermika Sp.z.o.o., Faktura: INV/2026/001, Data: 2026-09-01, Produkt: P1, Qty: 5, Cena jedn.: 50.00 PLN, LOT: LOT-A, Data ważności: 2026-10-01  
**OCZEKIWANY WYNIK:** Dostawa D1 ze statusem `posted`; ruch magazynowy +5 w product_stock_movements; Stan P1 @ LOC1 = 5  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/magazyn` → Dostawy → D1; Ruchy produktu → +5 LOT-A; Stan P1 @ LOC1 = 5  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts`; tabele `warehouse_deliveries`, `warehouse_delivery_items`, `product_stock_movements`, `product_stock_levels`

---

#### KROK 1.3
**AKCJA:** Utwórz dostawę D2 (LOT-B, LOC1)  
**DANE WEJŚCIOWE:** Lokalizacja: LOC1, Dostawca: Dermika Sp.z.o.o., Faktura: INV/2026/002, Data: 2026-09-02, Produkt: P1, Qty: 3, Cena jedn.: 50.00 PLN, LOT: LOT-B, Data ważności: 2027-02-01  
**OCZEKIWANY WYNIK:** Dostawa D2 `posted`; +3 w ruchach (LOT-B); Stan P1 @ LOC1 = **8**  
**CO SPRAWDZIĆ:** Stan P1 @ LOC1 = 8; widoczne 2 LOT-y (LOT-A=5, LOT-B=3)  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts`; `product_stock_movements`

---

#### KROK 1.4
**AKCJA:** Utwórz dostawę D3 (LOT-C, LOC2)  
**DANE WEJŚCIOWE:** Lokalizacja: LOC2, Dostawca: Dermika Sp.z.o.o., Faktura: INV/2026/003, Data: 2026-09-03, Produkt: P1, Qty: 2, Cena jedn.: 55.00 PLN, LOT: LOT-C, Data ważności: 2027-05-01  
**OCZEKIWANY WYNIK:** Dostawa D3 `posted`; Stan P1 @ LOC2 = **2**; LOC1 nie zmieniony (8)  
**CO SPRAWDZIĆ:** Stan P1 @ LOC1 = 8 (bez zmian); Stan P1 @ LOC2 = 2  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts`; `product_stock_levels` per location

---

#### KROK 1.5
**AKCJA:** Zweryfikuj planned_usage i projected_deficit  
**DANE WEJŚCIOWE:** Filtr: P1, LOC1, horizon: 7 dni (2026-09-08..2026-09-14 — A1 w tym oknie)  
**OCZEKIWANY WYNIK:** planned_usage = 1 (jedna wizyta A1 z P1×1); projected_deficit = 0 (stan 8 > 1); brak alarmu  
**CO SPRAWDZIĆ:** Karta produktu P1 → Prognoza zużycia; widget Shopping List pokazuje P1 bez flagi krytycznej  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts` → `getPlannedUsage`, `checkAppointmentShortage`

---

### FAZA 2 — ZABIEG I SZABLONY DOKUMENTÓW

---

#### KROK 2.1
**AKCJA:** Utwórz zabieg T1  
**DANE WEJŚCIOWE:** Nazwa: „Mezoterapia twarzy", Czas: 60 min, Cena: 400.00 PLN, Kolor: #3B82F6 (niebieski)  
**OCZEKIWANY WYNIK:** T1 aktywny na liście zabiegów, czas 60 min, cena 400.00 PLN  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments` → T1  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts` → `create`

---

#### KROK 2.2
**AKCJA:** Przypisz produkt P1 do zabiegu T1  
**DANE WEJŚCIOWE:** Zabieg: T1, Produkt: P1, Ilość: 1 szt/zabieg  
**OCZEKIWANY WYNIK:** Zakładka „Produkty" zabiegu T1 pokazuje P1 × 1 szt  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments/{T1_ID}` → zakładka Produkty  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts`; tabela `gabinetTreatmentProducts`

---

#### KROK 2.3
**AKCJA:** Przypisz uprawnionych pracowników do T1  
**DANE WEJŚCIOWE:** Zabieg: T1, Pracownicy: E1 (Dr. Kowalska), E2 (mgr Nowak)  
**OCZEKIWANY WYNIK:** T1 → zakładka Pracownicy: E1 i E2 widoczni jako uprawnieni  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments/{T1_ID}` → zakładka Pracownicy  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts`; `gabinetEmployeeTreatments`

---

#### KROK 2.4
**AKCJA:** Utwórz szablon dokumentu DOC-CONSENT  
**DANE WEJŚCIOWE:** Nazwa: „Zgoda na zabieg mezoterapii", Typ: consent, isRequired: true, frequency: before_each_visit, requiresSignature: true, method: click, validityDays: (pusty = bezterminowy)  
**OCZEKIWANY WYNIK:** Szablon DOC-CONSENT zapisany, widoczny w liście szablonów  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings/document-templates` → DOC-CONSENT; isRequired = true; frequency = before_each_visit  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/documentTemplates.ts`; tabela `formTemplates`

---

#### KROK 2.5
**AKCJA:** Utwórz szablon dokumentu DOC-INFO  
**DANE WEJŚCIOWE:** Nazwa: „Informacja o zabiegu i efektach ubocznych", Typ: consent, isRequired: false, frequency: once, requiresSignature: false  
**OCZEKIWANY WYNIK:** Szablon DOC-INFO zapisany, isRequired = false  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/settings/document-templates` → DOC-INFO; isRequired = false; frequency = once  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/documentTemplates.ts`

---

#### KROK 2.6
**AKCJA:** Przypisz dokumenty do zabiegu T1  
**DANE WEJŚCIOWE:** Zabieg: T1; Dodaj DOC-CONSENT (isRequired: true, timing: before_start, frequency: before_each_visit); Dodaj DOC-INFO (isRequired: false, timing: before_start, frequency: once)  
**OCZEKIWANY WYNIK:** T1 → zakładka Dokumenty: DOC-CONSENT (wymagany) + DOC-INFO (opcjonalny)  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/treatments/{T1_ID}` → zakładka Dokumenty; pole `requiredFormTemplates`  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/treatments.ts` → `updateTreatmentDocuments`

---

### FAZA 3 — KLIENT

---

#### KROK 3.1
**AKCJA:** Utwórz pacjenta Maria Wiśniewska  
**DANE WEJŚCIOWE:** Imię: Maria, Nazwisko: Wiśniewska, PESEL: 85031512345, Data ur.: 1985-03-15, Telefon: +48 600 123 456, Email: maria.wisniewska@test.pl  
**OCZEKIWANY WYNIK:** Pacjent aktywny na liście; PESEL i data ur. widoczne; saldo = 0; brak historii  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/patients` → Maria Wiśniewska; profil → zakładka Ogólne  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/patients.ts` → `create`

---

### FAZA 4 — PAKIET

---

#### KROK 4.1
**AKCJA:** Utwórz pakiet PKG1  
**DANE WEJŚCIOWE:** Nazwa: „Pakiet 5x Mezoterapia twarzy", Zabiegi: T1 × 5, totalPrice: 1800.00 PLN, validityDays: 365, loyaltyPointsAwarded: 180  
**OCZEKIWANY WYNIK:** PKG1 aktywny na liście pakietów; widoczna wartość 1800 PLN, 5 wejść T1  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/packages` → PKG1; cena, liczba wejść, ważność  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/packages.ts` → `create`

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

---

#### KROK 4.3
**AKCJA:** Sprawdź numerację wejść PKG1  
**DANE WEJŚCIOWE:** Otwórz szczegóły zakupu PKG1 u Marii  
**OCZEKIWANY WYNIK:** Wyświetlany stan: T1 0/5 wejść; brak zarezerwowanych wejść (żadna wizyta jeszcze niezapisana)  
**CO SPRAWDZIĆ:** UI: etykieta X/Y → 0/5  
**MODUŁ ŹRÓDŁOWY:** `gabinetPackageUsage.treatmentsUsed`

---

### FAZA 5 — KALENDARZ I WIZYTY

---

#### KROK 5.1
**AKCJA:** Utwórz wizytę A1 (scheduled)  
**DANE WEJŚCIOWE:** Data: 2026-09-08, Godz: 10:00–11:00, Pracownik: E1, Lokalizacja: LOC1, Zabieg: T1, Pacjent: Maria Wiśniewska, Płatność: PKG1 (wejście z pakietu)  
**OCZEKIWANY WYNIK:** A1 status=scheduled; widoczna w kalendarzu LOC1 / E1; PKG1 wejście = zarezerwowane (1 entry allocated lub widoczne w UI)  
**CO SPRAWDZIĆ:**  
- `/dashboard/gabinet/calendar` → 2026-09-08, slot 10:00 LOC1  
- Szczegóły A1: status=scheduled, T1, E1, Maria  
- Nie ma jeszcze rozchodu P1  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `create`

---

#### KROK 5.2
**AKCJA:** Potwierdź wizytę A1 (scheduled → confirmed)  
**DANE WEJŚCIOWE:** Wizyta: A1, Status: confirmed  
**OCZEKIWANY WYNIK:** A1 status=confirmed; kolor/ikona w kalendarzu zmieniają się  
**CO SPRAWDZIĆ:** Szczegóły A1 → status = confirmed  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`

---

#### KROK 5.3
**AKCJA:** Podpisz DOC-CONSENT przed wizytą A1 (document gate)  
**DANE WEJŚCIOWE:** Wizyta: A1, Dokument: DOC-CONSENT, Podpis: kliknięcie elektroniczne (click), Imię: Maria Wiśniewska  
**OCZEKIWANY WYNIK:** DOC-CONSENT status=signed; signedAt zapisane; wizyta A1 może przejść do in_progress (brak blokady dokumentacyjnej)  
**CO SPRAWDZIĆ:**  
- Szczegóły A1 → zakładka Dokumenty → DOC-CONSENT: status=signed  
- DOC-INFO: status=pending/draft (opcjonalny, nie blokuje)  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/documents.ts`; `convex/gabinet/_helpers/documentGate.ts`

---

#### KROK 5.4
**AKCJA:** Rozpocznij wizytę A1 (confirmed → in_progress)  
**DANE WEJŚCIOWE:** Wizyta: A1, Status: in_progress  
**OCZEKIWANY WYNIK:** A1 status=in_progress; stan P1 jeszcze nie zmieniony  
**CO SPRAWDZIĆ:** Szczegóły A1 → status = in_progress; Stan P1 @ LOC1 = 8 (bez zmian)  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`

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

---

#### KROK 5.6
**AKCJA:** Utwórz wizytę A2 i anuluj ją (cancelled)  
**DANE WEJŚCIOWE:** A2: Data 2026-09-15, 10:00, E1, LOC1, T1, Maria, PKG1 entry  
Następnie: Status A2 = cancelled, Powód: „Pacjentka odwołała wizytę", cancelledAt: 2026-09-12  
**OCZEKIWANY WYNIK:**  
- A2 status=cancelled; cancelledAt zapisane  
- PKG1: usedCount NIE zmieniony → nadal 1/5  
- Brak ruchu magazynowego (stan P1 bez zmian)  
**CO SPRAWDZIĆ:**  
- Szczegóły A2: status=cancelled, cancellationReason widoczny  
- Stan P1 @ LOC1 = 7 (bez zmian)  
- Profil Marii → Pakiety → PKG1: nadal 1/5 (nie 2/5)  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`; brak wywołania `adjustStock`

---

#### KROK 5.7
**AKCJA:** Utwórz wizytę A3 i ustaw status no_show  
**DANE WEJŚCIOWE:** A3: Data 2026-09-22, 10:00, E1, LOC1, T1, Maria, PKG1 entry  
Następnie: Status A3 = no_show  
**OCZEKIWANY WYNIK:**  
- A3 status=no_show  
- PKG1: usedCount T1 = 2 → **2/5 wejść** (no_show zużywa wejście per reguła biznesowa)  
- Brak ruchu magazynowego (stan P1 bez zmian: LOC1=7)  
**CO SPRAWDZIĆ:**  
- Szczegóły A3: status=no_show  
- Stan P1 @ LOC1 = 7 (bez zmian)  
- Profil Marii → Pakiety → PKG1: **2/5 wejść**  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `updateStatus`; `gabinetPackageUsage` (no_show consumes entry)

---

#### KROK 5.8
**AKCJA:** Utwórz wizytę A4 (płatność indywidualna)  
**DANE WEJŚCIOWE:** A4: Data 2026-09-29, 10:00, E1, LOC1, T1, Maria, Płatność: cash 400.00 PLN  
**OCZEKIWANY WYNIK:** A4 status=scheduled; płatność PAY-A4 zaplanowana (pending lub linked)  
**CO SPRAWDZIĆ:** Szczegóły A4: status=scheduled, T1, E1, LOC1, Maria; metoda płatności: cash  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `create`

---

#### KROK 5.9
**AKCJA:** Przejdź A4 do completed  
**DANE WEJŚCIOWE:** A4: scheduled→confirmed→in_progress → completed  
Przy completed: Zarejestruj płatność PAY-A4: 400.00 PLN, cash, 2026-09-29  
**OCZEKIWANY WYNIK:**  
- A4 status=completed  
- Rozchód P1: -1 z LOT-A (FEFO) → LOT-A=3, LOC1 total=6  
- Ruch: delta=-1, LOT-A, appointment_id=A4  
- PAY-A4 status=completed, 400.00 PLN cash  
**CO SPRAWDZIĆ:**  
- Szczegóły A4: status=completed  
- Stan P1 @ LOC1 = 6 (LOT-A=3, LOT-B=3)  
- Ruch P1: -1, LOT-A, A4  
- Płatności A4: 400.00 PLN, cash, completed  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`; `convex/inventory.ts`

---

#### KROK 5.10
**AKCJA:** Cofnij completed A4 (revert do in_progress)  
**DANE WEJŚCIOWE:** A4: Status = in_progress (cofnięcie z completed)  
**OCZEKIWANY WYNIK:**  
- A4 status=in_progress  
- Odtworzenie stanu: +1 do LOT-A → LOT-A=4, LOC1 total=7  
- Ruch magazynowy: delta=+1, LOT-A, typ=appointment_revert lub similar, appointment_id=A4  
- Płatność PAY-A4 nie zmieniona (płatność pozostaje)  
**CO SPRAWDZIĆ:**  
- Szczegóły A4: status=in_progress  
- Stan P1 @ LOC1 = 7 (LOT-A=4, LOT-B=3)  
- Ruchy P1: dwa ruchy dla A4: -1 (completion) i +1 (revert)  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → revert logic; `convex/inventory.ts` → odwrotny `adjustStock`

---

#### KROK 5.11
**AKCJA:** Ponowne completed A4 (drugie zakończenie — bez podwójnego rozchodu)  
**DANE WEJŚCIOWE:** A4: in_progress → completed (po raz drugi)  
**OCZEKIWANY WYNIK:**  
- A4 status=completed  
- Rozchód: -1 z LOT-A (FEFO) → LOT-A=3, LOC1 total=6  
- Łączne ruchy A4: -1 (1. completed) +1 (revert) -1 (2. completed) = **net -1** ✓  
- Brak podwójnego rozchodu (nie -2)  
**CO SPRAWDZIĆ:**  
- Stan P1 @ LOC1 = 6 (LOT-A=3, LOT-B=3)  
- Ruchy P1 związane z A4: dokładnie 3 rekordy (-1, +1, -1); net = -1  
- Raport magazynowy: A4 nie powoduje podwójnego kosztu  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`; `convex/inventory.ts`; guard: `stockDeducted` flag

---

#### KROK 5.12
**AKCJA:** Częściowy refund płatności PAY-A4  
**DANE WEJŚCIOWE:** Wizyta: A4, Płatność: PAY-A4 (400 PLN, cash), Refund: 100.00 PLN częściowy, PayMethod: cash  
**OCZEKIWANY WYNIK:**  
- PAY-A4: amount=400, refund_amount=100, status=completed (lub partial_refund)  
- Netto dla A4: 300.00 PLN  
- Kasa: -100 PLN odnotowane  
**CO SPRAWDZIĆ:**  
- Płatności A4: refund_amount=100; netto 300  
- Cash breakdown: PAY-A4 gross=400, refund=100, net=300  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/payments.ts`; tabela `payments.refund_amount` (migration 00147)

---

#### KROK 5.13
**AKCJA:** Edycja wizyty — przełożenie (reschedule)  
**DANE WEJŚCIOWE:** Wizyta A2 (cancelled) — zamiast niej utwórz nową wizytę A2b: Data: 2026-09-30, 14:00–15:00, E1, LOC1, T1, Maria, PKG1 entry  
**OCZEKIWANY WYNIK:** A2b status=scheduled; A2 pozostaje cancelled; PKG1 usedCount bez zmian (2/5)  
**CO SPRAWDZIĆ:** Kalendarz 2026-09-30: slot 14:00 z A2b; A2 cancelled niezmienione  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → `create` (nowa wizyta)

> **Uwaga:** A2b NIE jest częścią głównych obliczeń finansowych. Pozostaje scheduled i nie przechodzi dalej w tym scenariuszu.

---

#### KROK 5.14
**AKCJA:** Weryfikacja konfliktu dostępności  
**DANE WEJŚCIOWE:** Spróbuj umówić inną wizytę E1 w LOC1 na 2026-09-29 10:30 (nakłada się z A4 10:00–11:00)  
**OCZEKIWANY WYNIK:** System zgłasza konflikt dostępności; wizyta nie zostaje zapisana  
**CO SPRAWDZIĆ:** UI: komunikat o konflikcie terminu; żadna nowa wizyta nie pojawia się w kalendarzu  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts` → availability check

---

#### KROK 5.15
**AKCJA:** Utwórz wizytę A5 (LOC2, E2)  
**DANE WEJŚCIOWE:** A5: Data 2026-10-06, 14:00–15:00, E2, LOC2, T1, Maria, Płatność: card 400.00 PLN  
**OCZEKIWANY WYNIK:** A5 status=scheduled; E2 widoczny jako dostępny (brak konfliktu w LOC2)  
**CO SPRAWDZIĆ:** `/dashboard/gabinet/calendar` przełączony na LOC2 → 2026-10-06 slot 14:00  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`

---

#### KROK 5.16
**AKCJA:** Zakończ wizytę A5 (completed, LOC2)  
**DANE WEJŚCIOWE:** A5: scheduled→confirmed→in_progress→completed; Płatność: PAY-A5 400.00 PLN, card, 2026-10-06  
Przy completed: podpisz DOC-CONSENT (nowy, bo before_each_visit)  
**OCZEKIWANY WYNIK:**  
- A5 status=completed  
- Rozchód P1 @ LOC2: -1 z LOT-C (FEFO jedyny LOT) → LOT-C=1, LOC2 total=1  
- Ruch: delta=-1, LOT-C, appointment_id=A5, employee_id=E2  
- PAY-A5: 400.00 PLN, card, completed  
- DOC-CONSENT: nowy rekord signed dla A5  
**CO SPRAWDZIĆ:**  
- Stan P1 @ LOC2 = 1 (LOT-C=1)  
- Stan P1 @ LOC1 = 6 (bez zmian)  
- Ruchy P1: -1, LOT-C, A5, E2  
- Płatności A5: 400.00 PLN, karta  
- DOC-CONSENT A5: status=signed  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/appointments.ts`; `convex/inventory.ts`

---

### FAZA 6 — DIRECT SALE

---

#### KROK 6.1
**AKCJA:** Sprzedaj produkt P1 bezpośrednio (direct_sale DS1)  
**DANE WEJŚCIOWE:** Produkt: P1, Qty: 1 szt, Cena: 120.00 PLN, Pracownik: E1, LOC: LOC1, Pacjent: Maria (opcjonalnie), PayMethod: card, Data: 2026-09-29  
**OCZEKIWANY WYNIK:**  
- Ruch: delta=-1, LOT-A (FEFO), typ=direct_sale, employee_id=E1  
- Stan P1 @ LOC1 = **5** (LOT-A=2, LOT-B=3)  
- Płatność PAY-DS1: 120.00 PLN, card, completed  
**CO SPRAWDZIĆ:**  
- Stan P1 @ LOC1 = 5  
- Ruchy P1: -1, LOT-A, direct_sale, E1, PAY-DS1  
- Raport sprzedaży produktów: +120.00 PLN  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts` → `directSale`; `product_stock_movements`

---

#### KROK 6.2
**AKCJA:** Zwróć produkt (direct_sale_return DSR1)  
**DANE WEJŚCIOWE:** Zwrot DS1: Produkt: P1, Qty: 1 szt, Cena: -120.00 PLN, Pracownik: E1, LOC: LOC1, PayMethod: card (refund), Data: 2026-09-29  
**OCZEKIWANY WYNIK:**  
- Ruch: delta=+1, LOT-A (zwrot do tego samego LOT), typ=direct_sale_return  
- Stan P1 @ LOC1 = **6** (LOT-A=3, LOT-B=3)  
- PAY-DS1: refund 120.00 PLN, net = 0.00 PLN  
**CO SPRAWDZIĆ:**  
- Stan P1 @ LOC1 = 6  
- Ruchy P1: +1, LOT-A, direct_sale_return  
- Raport sprzedaży produktów: zwrot widoczny; net = 0 PLN  
- Payment breakdown karta: DS1 + DSR1 = 120 - 120 = 0  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/inventory.ts` → `directSaleReturn`

---

### FAZA 7 — KASA I SEJF

---

#### KROK 7.1
**AKCJA:** Zarejestruj ręczną wpłatę do Kasy (cash deposit)  
**DANE WEJŚCIOWE:** LOC: LOC1, Data: 2026-09-29, Typ: deposit, Kwota: 300.00 PLN, Powód: „Wpłata własna — reszta z zakupu"  
**OCZEKIWANY WYNIK:** Rekord `gabinetCashTransactions` type=deposit, amount=300.00; NIE pojawia się w raporcie sprzedaży  
**CO SPRAWDZIĆ:**  
- Kasa LOC1 → Historia transakcji → wpłata 300 PLN widoczna  
- Raport sprzedaży: 300 PLN NIE doliczone do przychodu  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/dayClose.ts` → `createCashTransaction`; `gabinetCashTransactions`

---

#### KROK 7.2
**AKCJA:** Zarejestruj wypłatę z Kasy (cash withdrawal)  
**DANE WEJŚCIOWE:** LOC: LOC1, Data: 2026-09-29, Typ: withdrawal, Kwota: 50.00 PLN, Powód: „Zakup materiałów biurowych"  
**OCZEKIWANY WYNIK:** Rekord `gabinetCashTransactions` type=withdrawal, amount=50.00; NIE wpływa na obrót/przychód  
**CO SPRAWDZIĆ:**  
- Kasa LOC1 → Historia: wypłata -50 PLN  
- Raport kosztów/sprzedaży: -50 PLN NIE odjęte od przychodu  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/dayClose.ts` → `createCashTransaction`

---

#### KROK 7.3
**AKCJA:** Zamknij dzień (Day Close) dla LOC1 — 2026-09-29  
**DANE WEJŚCIOWE:**  
- LOC: LOC1, Data: 2026-09-29  
- paymentSummary: {cash: 300.00} (400 wpłata A4 – 100 refund = 300 net cash)  
- cashFromPayments: 300.00 PLN  
- cashOpeningBalance: 200.00 PLN  
- cashDeposits: 300.00 PLN  
- cashWithdrawals: 50.00 PLN  
- cashExpected: 750.00 PLN (200+300+300-50)  
- cashCounted: 740.00 PLN  
- cashNextOpening: 100.00 PLN  
- cashToSafe: 640.00 PLN  
**OCZEKIWANY WYNIK:**  
- `gabinetDayCloses` rekord zapisany  
- cashDiscrepancy: -10.00 PLN  
- cashToSafe: 640.00 PLN  
- Automatycznie lub manualnie: transfer do Sejfu +640 PLN  
**CO SPRAWDZIĆ:**  
- Kasa LOC1 → Zamknięcia → 2026-09-29: discrepancy=-10, cashToSafe=640  
- Sejf LOC1: nowy ruch +640 PLN  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/dayClose.ts` → `createDayClose`; `gabinetDayCloses`

---

#### KROK 7.4
**AKCJA:** Transfer Kasa → Sejf  
**DANE WEJŚCIOWE:** LOC: LOC1, Amount: 640.00 PLN, Opis: „Transfer dzienny 2026-09-29", referenceDayCloseId: (ID z kroku 7.3)  
**OCZEKIWANY WYNIK:**  
- `gabinetSafeMovements` rekord: type=transfer_in, amount=640.00, location_id=LOC1  
- Saldo Sejfu LOC1 = 640.00 PLN  
- Ruch NIE jest przychodem ani kosztem  
**CO SPRAWDZIĆ:**  
- Sejf LOC1 → Historia → rekord transfer_in 640 PLN z ref do Day Close  
- Raport: transfer 640 PLN NIEWIDOCZNY w przychodach  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/safe.ts` → `transferToSafe`; `gabinetSafeMovements`

---

#### KROK 7.5
**AKCJA:** Wypłata z Sejfu  
**DANE WEJŚCIOWE:** LOC: LOC1, Kwota: 200.00 PLN, Opis: „Płatność gotówkowa dostawcy Dermika"  
**OCZEKIWANY WYNIK:**  
- `gabinetSafeMovements` rekord: type=withdrawal, amount=200.00  
- Saldo Sejfu LOC1 = 640 - 200 = **440.00 PLN**  
- Wypłata NIE jest kosztem biznesowym w raportach sprzedaży  
**CO SPRAWDZIĆ:**  
- Sejf LOC1 → Saldo: 440.00 PLN  
- Historia: withdrawal -200 PLN  
- Raporty: -200 PLN niewidoczne w kosztach operacyjnych  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/safe.ts` → `withdrawFromSafe`

---

### FAZA 8 — RAPORTY

---

#### KROK 8.1
**AKCJA:** Sprawdź raport sprzedaży (LOC1 + LOC2, okres 2026-09-01..2026-10-06)  
**DANE WEJŚCIOWE:** Filtr: wszystkie lokalizacje, zakres dat 2026-09-01..2026-10-31  
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

**CO SPRAWDZIĆ:** `/dashboard/gabinet/reports` → widgety sumaryczne; breakdown per category  
**MODUŁ ŹRÓDŁOWY:** `src/routes/_app/_auth/dashboard/_layout.gabinet.reports.tsx`

---

#### KROK 8.2
**AKCJA:** Sprawdź breakdown metod płatności  
**OCZEKIWANY WYNIK:**

| Metoda | Brutto | Refund | Netto |
|---|---|---|---|
| card | 2,320.00 PLN | -120.00 PLN | **2,200.00 PLN** |
| cash | 400.00 PLN | -100.00 PLN | **300.00 PLN** |
| **ŁĄCZNIE** | **2,720.00 PLN** | **-220.00 PLN** | **2,500.00 PLN** |

> Uwaga: Ręczna wpłata do Kasy (300 PLN) i wypłata z Kasy (50 PLN) NIE wchodzą do tego breakdownu.

**CO SPRAWDZIĆ:** Raport → Payment Methods breakdown  
**MODUŁ ŹRÓDŁOWY:** `convex/gabinet/reports.ts` / Supabase view per payment_method

---

#### KROK 8.3
**AKCJA:** Sprawdź raport per pracownik  
**OCZEKIWANY WYNIK:**

| Pracownik | Przychód (sprzedaż) |
|---|---|
| E1 (Dr. Kowalska) | PKG1: 1,800 + A4 net: 300 + DS1 net: 0 = **2,100.00 PLN** |
| E2 (mgr Nowak) | A5: **400.00 PLN** |
| **ŁĄCZNIE** | **2,500.00 PLN** |

**CO SPRAWDZIĆ:** Raport → Per pracownik; E1 = 2,100; E2 = 400  
**MODUŁ ŹRÓDŁOWY:** `product_stock_movements.employee_id`; `payments.soldByEmployeeId` / appointment.employeeId

---

#### KROK 8.4
**AKCJA:** Sprawdź raport per lokalizacja  
**OCZEKIWANY WYNIK:**

| Lokalizacja | Przychód |
|---|---|
| LOC1 | PKG1: 1,800 + A4 net: 300 + DS1 net: 0 = **2,100.00 PLN** |
| LOC2 | A5: **400.00 PLN** |
| **ŁĄCZNIE** | **2,500.00 PLN** |

**CO SPRAWDZIĆ:** Raport → Per lokalizacja  
**MODUŁ ŹRÓDŁOWY:** `payments.locationId`; `gabinetAppointments.locationId`

---

#### KROK 8.5
**AKCJA:** Sprawdź raport Kasy (LOC1, 2026-09-29)  
**OCZEKIWANY WYNIK:**

| Pole | Wartość |
|---|---|
| cashOpeningBalance | 200.00 PLN |
| cashFromPayments | 300.00 PLN (400-100 refund) |
| cashDeposits | 300.00 PLN (ręczna wpłata) |
| cashWithdrawals | 50.00 PLN |
| cashExpected | **750.00 PLN** |
| cashCounted | 740.00 PLN |
| discrepancy | **-10.00 PLN** |
| cashToSafe | 640.00 PLN |
| cashNextOpening | 100.00 PLN |

**CO SPRAWDZIĆ:** Raport Kasy → zamknięcie 2026-09-29 @ LOC1  
**MODUŁ ŹRÓDŁOWY:** `gabinetDayCloses`; `convex/gabinet/dayClose.ts`

---

#### KROK 8.6
**AKCJA:** Sprawdź raport Sejfu (LOC1)  
**OCZEKIWANY WYNIK:**

| Ruch | Kwota |
|---|---|
| Transfer z Kasy (2026-09-29) | +640.00 PLN |
| Wypłata (dostawca) | -200.00 PLN |
| **Saldo Sejfu LOC1** | **440.00 PLN** |

**CO SPRAWDZIĆ:** Moduł Sejf → LOC1 → Historia i saldo bieżące = 440 PLN  
**MODUŁ ŹRÓDŁOWY:** `gabinetSafeMovements`; `convex/gabinet/safe.ts` → `getSafeBalance`

---

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
| **Pakiet + wejście** | Sprzedaż PKG1 (1800 PLN) i każde wejście NIE są sumowane → łączny przychód z T1 = 1800, nie 1800 + 5×400 | Raport: brak double-count; package entry = zero dodatkowej płatności |
| **Kasa → Sejf** | Transfer 640 PLN NIE jest przychodem ani kosztem | Raport sprzedaży: 640 PLN NIE pojawia się; Raport Sejfu: +640 = transfer, nie revenue |
| **Wypłata z Kasy** | 50 PLN NIE pomniejsza obrotu | Raport sprzedaży: 50 PLN niewidoczne jako koszt pomniejszający przychód |
| **Wypłata z Sejfu** | 200 PLN NIE jest kosztem biznesowym | Raport: -200 PLN niewidoczne w P&L |
| **Cofnięcie completed** | A4 completed→revert→completed: łączny rozchód P1 = -1, nie -2 | Ruchy P1 przy A4: 3 rekordy (-1, +1, -1) → net=-1; raport kosztów produktu nie dubluje |
| **Ponowne completed** | Drugie `completed` A4 NIE tworzy drugiej płatności | PAY-A4 jedna płatność 400 PLN; drugie completed nie duplikuje |
| **direct_sale + payments** | DS1 i PAY-DS1 to jeden rekord, nie dwa osobne przychody | Raport: DS1 = 120 PLN tylko raz; nie sumowany z A4 payment |
| **Zwrot produktu** | DSR1 (+1 P1) NIE anuluje wcześniejszego rozchodu z A1/A4 (te są z wizyt, nie ze sprzedaży) | Ruchy: DSR1 dodaje +1 do LOT-A; ruchy A1, A4 pozostają jako osobne; net per wizyta bez zmian |
| **Refund + płatność** | Refund A4 (-100 PLN) widoczny jako refund_amount, nie jako osobna pozytywna płatność | `payments.refund_amount=100`; payment_amount=400; net=300 w raporcie |
| **no_show + completed** | A3 (no_show) zużywa wejście PKG1, ale NIE generuje przychodu payment z zabiegu | Raport: brak PAY dla A3; entry PKG1 konsumpcja nie = dodatkowa płatność |
| **Wejście a1 + no_show** | A1 i A3 zużywają łącznie 2 wejścia PKG1; przychód = 0 (już w PKG1 sale) | PKG1 total: 1800 PLN raz; A1 + A3 = 2 zużyte wejścia, bez dodatkowego przychodu |
| **unattributedReturns** | Jeśli DSR1 nie ma przypiętej oryginalnej transakcji → pojawia się jako unattributedReturn | Sprawdź: DSR1 powinien być linked do DS1; jeśli nie → raport powinien wyodrębnić jako unattributed |

---

## CZĘŚĆ VIII — MAPOWANIE NA ISTNIEJĄCE SPEC FILES PLAYWRIGHT

| Obszar scenariusza | Istniejący spec file | Konkretne testy |
|---|---|---|
| Zabieg CRUD | `e2e/gabinet/treatments.spec.ts` | Create, update, product assignment |
| Pacjent CRUD | `e2e/gabinet/patients.spec.ts` | Create, PESEL, history |
| Dokumenty — wysyłanie, podpisywanie | `e2e/gabinet/documents.spec.ts`, `e2e/gabinet/document-send.spec.ts` | Template create, sign flow, document gate |
| Pakiety — zakup, wejścia | `e2e/gabinet/packages.spec.ts` | Purchase, use entry, expiry |
| Lojalność | `e2e/gabinet/loyalty.spec.ts` | Points earn, tier |
| Wizyty — cykl życia statusów | `e2e/gabinet/appointment-lifecycle.spec.ts` | scheduled→completed, cancel, no_show |
| Wizyty — pełne flow | `e2e/gabinet/appointments.spec.ts` | Create, reschedule, conflicts, automation |
| Kalendarz | `e2e/gabinet/calendar.spec.ts` | Multi-location, employee view |
| Harmonogram / konflikty | `e2e/gabinet/scheduling.spec.ts` | Availability, overlap detection |
| Pracownicy | `e2e/gabinet/employees.spec.ts` | Create, location assignment |
| Portal pacjenta | `e2e/gabinet/portal.spec.ts` | Patient login, view appointments |

**Brakujące spec files** (wymagałyby stworzenia dla pełnego pokrycia tego scenariusza):
- `e2e/gabinet/inventory.spec.ts` — Magazyn, LOT tracking, FEFO, deliveries
- `e2e/gabinet/payments.spec.ts` — Płatności, refundy, breakdowny
- `e2e/gabinet/kasa-sejf.spec.ts` — Kasa dzienna, Sejf, transfer
- `e2e/gabinet/reports.spec.ts` — Raporty ze zweryfikowanymi wartościami

---

## ODPOWIEDZI NA PYTANIA KONTROLNE

### 1. Czy scenariusz obejmuje pełny przekrojowy core flow QUERA?

**TAK.** Scenariusz przechodzi przez wszystkie 13 obszarów wskazanych w issue: magazyn z LOT/FEFO, zabieg z product usage, klient, dokumenty (wymagane/opcjonalne/ważność), pakiet z wejściami (X/Y), kalendarz ze wszystkimi 6 statusami, płatności (pełna/częściowa/refund pełny/refund częściowy/pakiet/produkt), direct_sale + zwrot, kasa dzienna + sejf z dokładną arytmetyką, dwóch pracowników i dwie lokalizacje, raporty z pre-wyliczonymi wartościami, stan końcowy każdego LOT-u.

### 2. Czy wszystkie wartości finansowe i magazynowe są policzone z góry?

**TAK.** Każda operacja ma z góry policzone:
- Stan magazynowy per LOT i per lokalizacja po każdym zdarzeniu
- Breakdown płatności per metoda (card netto 2,200 PLN; cash netto 300 PLN; łącznie 2,500 PLN)
- Przychód per pracownik (E1: 2,100; E2: 400) i per lokalizacja (LOC1: 2,100; LOC2: 400)
- Arytmetykę Kasy (cashExpected=750, discrepancy=-10, cashToSafe=640)
- Saldo Sejfu (440 PLN)
- Numerację PKG1 (2/5 zużyte, 3/5 pozostałe)

### 3. Czy scenariusz nadaje się do późniejszego automatycznego browser E2E?

**TAK.** Każdy krok zawiera AKCJĘ, DANE WEJŚCIOWE (konkretne wartości), OCZEKIWANY WYNIK (weryfikowalny warunek) i MODUŁ ŹRÓDŁOWY (plik backendu). Format jest bezpośrednio przekładalny na Playwright `test(...)` bloki z `page.fill()`, `expect()` i `page.waitForSelector()`. Stałe testowe (ceny, LOT-y, daty) są zdefiniowane raz w Części I i używane konsekwentnie.

### 4. Jakie istniejące spec files Playwright mogą zostać użyte jako części tego scenariusza?

Patrz Część VIII — mapowanie. Bezpośrednio nadają się:
- `e2e/gabinet/appointment-lifecycle.spec.ts` — statusy A1–A5
- `e2e/gabinet/appointments.spec.ts` — tworzenie, edycja, konflikty
- `e2e/gabinet/packages.spec.ts` — PKG1 sprzedaż i wejścia
- `e2e/gabinet/documents.spec.ts` + `document-send.spec.ts` — DOC-CONSENT flow
- `e2e/gabinet/patients.spec.ts` — Maria Wiśniewska setup
- `e2e/gabinet/treatments.spec.ts` — T1 setup z produktem

Wymagają stworzenia nowych spec files: `inventory.spec.ts`, `payments.spec.ts`, `kasa-sejf.spec.ts`, `reports.spec.ts`.
