# Plan: Mapowanie pól szablonu dokumentu → kartoteka pacjenta

Data: 2026-07-09
Status: do wdrożenia

## Cel

Pola wypełniane przez klienta w szablonach dokumentów (`formTemplates`) mają być
mapowalne do pól kartoteki pacjenta (`gabinet_patients`). Jeśli docelowe pole
niestandardowe nie istnieje — jest tworzone. Wielokrotne generowanie dokumentów
z tym samym polem NIE tworzy duplikatów.

## Decyzje (zatwierdzone)

1. Pole niestandardowe powstaje **przy projektowaniu szablonu** (nie leniwie).
2. Zapis zwrotny: **wypełnij tylko gdy puste** (nie nadpisuje istniejących danych).
3. Zapis zwrotny następuje **po podpisaniu/zakończeniu** dokumentu (nie na draftach).

## Fundament (już istnieje — bez migracji SQL)

- `form_templates.variable_bindings` (TEXT/JSON) — dziś zapisywane, nieużywane. Tu ląduje mapa.
- `customFieldDefinitions` — rejestr pól, unikalny indeks `(organization_id, entity_type, field_key)` = twardy dedup. `entityType="gabinetPatient"` już wspierany (Ustawienia + `patient-form.tsx`).
- `customFieldValues` — wartości per encja, unikalny indeks `(org, entity_type, entity_id, field_definition_id)`.
- `completeMissingData.ts` — istniejący write-back doc→pacjent, dziś TYLKO pola wbudowane.

**Brak nowej migracji SQL.** Wszystkie tabele i indeksy już są.

## Model mapowania

`variable_bindings` = JSON `{ [fieldId]: target }`, gdzie `fieldId` = atrybut węzła
pola w edytorze TipTap, a `target`:
- `builtin:<column>` — kolumna `gabinet_patients` (np. `builtin:pesel`, `builtin:allergies`), lub
- `custom:<fieldKey>` — definicja w `customFieldDefinitions` (gabinetPatient).

## Zakres prac

### A. Backend (Convex)
1. `ensurePatientCustomField(org, {fieldKey, label, type, options})` — idempotentny
   upsert-po-kluczu (SELECT po `(org, gabinetPatient, fieldKey)`; INSERT gdy brak;
   na unique-violation → re-SELECT). Baza pól wbudowanych jako stała współdzielona
   (lista mapowalnych kolumn `gabinet_patients`).
2. Rozszerzyć `completeMissingData` (lub nowy `applyBindingsToPatient`):
   - czyta `variable_bindings` szablonu, ustala `patientId` ze `scope_entities`,
   - dla każdego pola z wiązaniem i niepustą wartością w `response_data`:
     - `builtin:X` → patch `gabinet_patients.X` **tylko gdy puste**,
     - `custom:key` → upsert `customFieldValues` **tylko gdy brak wartości**,
   - koercja wg typu pola; błąd walidacji = pominięcie pola, NIE przerwanie podpisu,
   - nieznany `fieldKey` (wiszące wiązanie) = pominięcie.
3. Wpiąć wywołanie write-backu w moment przejścia dokumentu w `signed`/`completed`
   (ścieżka podpisu w `convex/documents/documents.ts` + `sign.form.$token`).

### B. Frontend
4. W edytorze pola szablonu dropdown „Mapuj do kartoteki":
   - Grupa 1: pola wbudowane pacjenta,
   - Grupa 2: istniejące `customFieldDefinitions` (gabinetPatient),
   - Grupa 3: „+ Utwórz nowe pole pacjenta" (nazwa + typ) → tworzy definicję od razu.
5. Zapis szablonu utrwala `variable_bindings` (mechanizm zapisu już istnieje).

## Przypadki brzegowe
- Pola zagnieżdżone (`address.city`) — `completeMissingData` już scala adres, reużyć.
- To samo pole w dwóch szablonach → ten sam `fieldKey` → ta sama definicja (cel).
- Usunięta definicja → write-back pomija nieznany klucz (log, brak crashu).
- Zapobieganie duplikatowi „PESEL" obok wbudowanego `pesel`: mapowanie jest **jawnym
  wyborem** (dropdown z wbudowanymi na górze), nigdy zgadywaniem po nazwie.

## Weryfikacja
- Typecheck convex + app (zero nowych błędów vs main).
- Test jednostkowy: dwa dokumenty z tym samym „nowym" polem → jedna definicja, jedna wartość.
- Test: write-back nie nadpisuje istniejącej wartości; działa dopiero po podpisie.
- E2E smoke: zaprojektuj szablon z mapowaniem → wypełnij/podpisz → wartość w kartotece.

## Poza zakresem (na później)
- Mapowanie do encji innych niż pacjent (wizyta/zabieg) — architektura to dopuszcza
  (`target` mógłby mieć prefiks encji), ale nie teraz.
