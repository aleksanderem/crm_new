# System dokumentów generowanych z szablonów

## 1. Architektura

### Zasada naczelna

Core systemu dokumentów jest platformowy — żyje poza modułami, obsługuje szablony, pola, instancje dokumentów, rendering, workflow i podpisy. Moduły (CRM, Gabinet, przyszłe) wpinają się przez jeden punkt integracji: rejestrację data source'ów. Core nie wie nic o pacjentach, kontaktach ani żadnej encji modułowej — widzi tylko abstrakcyjne źródła danych.

### Data Source Registry — fundament elastyczności

Zamiast hardkodowanych resolwerów (`patient.firstName`, `contact.email`) system opiera się na rejestrze źródeł danych. Każdy moduł rejestruje swoje źródła deklaratywnie. Core konsumuje je generycznie.

Źródło danych (data source) to:
  - klucz identyfikujący (np. `"patient"`, `"contact"`, `"invoice"`)
  - etykieta do wyświetlenia w UI (np. "Pacjent", "Kontakt")
  - moduł-właściciel (np. `"gabinet"`, `"crm"`)
  - deklaracja pól: lista `{ key, label, type }` opisująca jakie dane to źródło potrafi dostarczyć
  - resolver: funkcja `(ctx, sourceInstanceId) => Record<string, any>` która dla konkretnego ID encji zwraca wartości

Przykład rejestracji (Gabinet):

```typescript
// convex/gabinet/documentDataSources.ts
export const patientSource: DataSourceDefinition = {
  key: "patient",
  label: "Pacjent",
  module: "gabinet",
  fields: [
    { key: "firstName",   label: "Imię",            type: "text" },
    { key: "lastName",    label: "Nazwisko",         type: "text" },
    { key: "fullName",    label: "Imię i nazwisko",  type: "text" },
    { key: "pesel",       label: "PESEL",            type: "text" },
    { key: "dateOfBirth", label: "Data urodzenia",   type: "date" },
    { key: "phone",       label: "Telefon",          type: "phone" },
    { key: "email",       label: "E-mail",           type: "email" },
    { key: "address",     label: "Adres",            type: "text" },
    { key: "allergies",   label: "Alergie",          type: "textarea" },
    { key: "bloodType",   label: "Grupa krwi",       type: "text" },
  ],
  resolve: async (ctx, patientId) => {
    const patient = await ctx.db.get(patientId);
    const contact = patient.contactId ? await ctx.db.get(patient.contactId) : null;
    return {
      firstName: contact?.firstName ?? "",
      lastName: contact?.lastName ?? "",
      fullName: [contact?.firstName, contact?.lastName].filter(Boolean).join(" "),
      pesel: patient.pesel ?? "",
      dateOfBirth: patient.dateOfBirth ?? "",
      phone: contact?.phone ?? "",
      email: contact?.email ?? "",
      address: [patient.address?.street, patient.address?.city].filter(Boolean).join(", "),
      allergies: patient.allergies ?? "",
      bloodType: patient.bloodType ?? "",
    };
  },
};
```

Przykład rejestracji (CRM):

```typescript
// convex/crm/documentDataSources.ts
export const contactSource: DataSourceDefinition = {
  key: "contact",
  label: "Kontakt",
  module: "crm",
  fields: [
    { key: "name",      label: "Imię i nazwisko", type: "text" },
    { key: "firstName", label: "Imię",            type: "text" },
    { key: "lastName",  label: "Nazwisko",        type: "text" },
    { key: "email",     label: "E-mail",          type: "email" },
    { key: "phone",     label: "Telefon",         type: "phone" },
    { key: "company",   label: "Firma",           type: "text" },
    { key: "position",  label: "Stanowisko",      type: "text" },
  ],
  resolve: async (ctx, contactId) => {
    const contact = await ctx.db.get(contactId);
    const company = contact.companyId ? await ctx.db.get(contact.companyId) : null;
    return {
      name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      company: company?.name ?? "",
      position: contact.position ?? "",
    };
  },
};
```

Dodanie nowego modułu (np. HR) = dodanie nowego pliku:

```typescript
// convex/hr/documentDataSources.ts
export const employeeSource: DataSourceDefinition = {
  key: "hr_employee",
  label: "Pracownik",
  module: "hr",
  fields: [
    { key: "name",       label: "Imię i nazwisko", type: "text" },
    { key: "position",   label: "Stanowisko",      type: "text" },
    { key: "department", label: "Dział",            type: "text" },
    { key: "hireDate",   label: "Data zatrudnienia",type: "date" },
    { key: "salary",     label: "Wynagrodzenie",    type: "currency" },
  ],
  resolve: async (ctx, employeeId) => { /* ... */ },
};
```

I zarejestrowanie go w centralnym rejestrze (jeden import, jedna linijka). Zero zmian w core, zero zmian w UI, zero zmian w renderingu. Nowe źródło natychmiast pojawia się w edytorze szablonów do wyboru.

Core rejestruje bazowe źródła dostępne zawsze (bez modułu):

```typescript
// convex/documentDataSources.ts (core)
export const systemSource: DataSourceDefinition = {
  key: "system",
  label: "System",
  module: "platform",
  fields: [
    { key: "today",       label: "Dzisiejsza data",  type: "date" },
    { key: "datetime",    label: "Data i godzina",    type: "datetime" },
    { key: "year",        label: "Bieżący rok",       type: "text" },
  ],
  resolve: async () => ({
    today: new Date().toISOString().split("T")[0],
    datetime: new Date().toISOString(),
    year: new Date().getFullYear().toString(),
  }),
};

export const currentUserSource: DataSourceDefinition = {
  key: "current_user",
  label: "Bieżący użytkownik",
  module: "platform",
  fields: [
    { key: "name",  label: "Imię i nazwisko", type: "text" },
    { key: "email", label: "E-mail",          type: "email" },
  ],
  resolve: async (ctx, _id, { userId }) => {
    const user = await ctx.db.get(userId);
    return { name: user.name ?? "", email: user.email ?? "" };
  },
};

export const orgSource: DataSourceDefinition = {
  key: "org",
  label: "Organizacja",
  module: "platform",
  fields: [
    { key: "name",    label: "Nazwa firmy",  type: "text" },
    { key: "nip",     label: "NIP",           type: "text" },
    { key: "address", label: "Adres firmy",   type: "text" },
    { key: "phone",   label: "Telefon firmy", type: "phone" },
    { key: "email",   label: "E-mail firmy",  type: "email" },
  ],
  resolve: async (ctx, _id, { orgId }) => {
    const org = await ctx.db.get(orgId);
    return {
      name: org.name ?? "",
      nip: org.nip ?? "",
      address: org.address ?? "",
      phone: org.phone ?? "",
      email: org.email ?? "",
    };
  },
};
```

### Jak binding działa w szablonie

Pole szablonu (documentTemplateFields) ma:

```
binding: {
  source: "patient",        // klucz data source
  field: "fullName"          // klucz pola w tym source
} | null                     // null = pole ręczne, bez bindingu
```

Zamiast `defaultValueSource: "static"|"dynamic"` i `dynamicKey: "patient.firstName"`. Binding jest strukturalny — wiadomo dokładnie z jakiego źródła i jakiego pola pochodzi wartość. Zmiana nazwy pola w source łamie binding jawnie (nie po cichu).

Pole BEZ bindingu: user wypełnia ręcznie. Może mieć statyczną wartość domyślną.

Pole Z bindingiem: przy tworzeniu dokumentu system odpala resolver source'a i wstawia wartość. User widzi ją i może nadpisać. W formularzu przy polu jest informacja "Wypełnione z: [etykieta source] → [etykieta pola]".

### Jak wiele źródeł działa jednocześnie

Szablon może korzystać z wielu źródeł danych naraz. Przykład: szablon "Zgoda na zabieg" używa pól z `patient` (dane pacjenta), `current_user` (dane lekarza), `org` (dane kliniki) i `system` (data).

Przy tworzeniu dokumentu, caller podaje instancje źródeł jako mapę:

```typescript
// Tworzenie dokumentu z kontekstu wizyty w Gabinecie
createDocumentInstance({
  templateId: "...",
  title: "Zgoda na zabieg — Jan Kowalski",
  sources: {
    patient: patientId,       // resolver patient dostanie ten ID
    appointment: appointmentId, // resolver appointment dostanie ten ID
    // system, current_user, org — nie potrzebują ID, rozwiązywane z kontekstu
  },
});
```

Core iteruje po polach szablonu. Dla każdego pola z bindingiem: sprawdza czy `sources` zawiera wymagane źródło → odpala resolver → wstawia wartość. Jeśli źródło nie zostało podane (np. szablon używa `patient` ale dokument tworzony bez kontekstu pacjenta) — pole pozostaje puste, user wypełnia ręcznie.

To oznacza, że ten sam szablon może być użyty w różnych kontekstach: z karty pacjenta (sources zawiera patient), z listy platformowej (sources puste — wszystko ręcznie), albo z przyszłego modułu który dostarczy inne źródła.

### Szablon deklaruje wymagane źródła

Szablon ma pole `requiredSources: string[]` — lista kluczy źródeł które MUSZĄ być dostarczone przy tworzeniu dokumentu. Jeśli szablon wymaga `["patient"]`, to:
  - W liście wyboru szablonów, gdy user tworzy dokument z kontekstu pacjenta — szablon jest dostępny.
  - Gdy user tworzy dokument z listy platformowej bez kontekstu — szablon jest widoczny ale oznaczony: "Wymaga kontekstu: Pacjent". User może go wybrać ale musi ręcznie wskazać pacjenta (picker encji).
  - Gdy user tworzy dokument z kontekstu kontaktu CRM — szablon wymagający `patient` nie pojawia się (chyba że moduł Gabinet zarejestruje mapping contact→patient).

### Warstwy

```
+---------------------------------------------------------------+
|  Moduł CRM            Moduł Gabinet       Moduł X (przyszły)  |
|  rejestruje:           rejestruje:          rejestruje:         |
|  - contact source      - patient source     - swoje source'y   |
|  - company source      - employee source                       |
|  - lead source         - appointment source                    |
|  - deal source                                                 |
|  UI: przycisk w        UI: przycisk w       UI: przycisk w     |
|  karcie kontaktu       karcie pacjenta      swoim widoku       |
+---------------------------------------------------------------+
|                    PLATFORMA (core)                            |
|  - Data Source Registry (agreguje source'y z modułów)          |
|  - documentTemplates (schemat, CRUD, wersjonowanie)            |
|  - documentTemplateFields (pola z binding do source.field)     |
|  - documentInstances (instancje, workflow, podpisy)            |
|  - rendering engine (content + bindings + values → HTML)       |
|  - bazowe source'y: system, current_user, org                  |
|  - komponenty UI: edytor, formularz, viewer, podpis, PDF      |
+---------------------------------------------------------------+
```

### Baza danych (Convex)

Cztery nowe tabele na poziomie platformy:

documentDataSources (opcjonalna — registry może być in-code, ale tabela pozwala na runtime discovery):
  - organizationId (null dla globalnych/platformowych)
  - key (unikalny identyfikator, np. "patient", "contact")
  - label (wyświetlana nazwa)
  - module (moduł-właściciel)
  - fields: [{ key, label, type }] (deklaracja dostępnych pól)
  - isActive: boolean

  Alternatywa: registry in-code (importy + obiekt). Wybieram in-code bo:
  - resolver musi być kodem (nie da się zapisać funkcji w bazie)
  - deklaracja pól jest ściśle powiązana z resolverem
  - dodanie source'a i tak wymaga deploymentu (nowy kod resolvera)
  - discovery w UI: query zwraca zagregowaną listę z in-code registry

  Tabela w bazie miałaby sens gdyby admin mógł tworzyć source'y z UI
  (np. custom fields entity) — to temat na przyszłość. Na start: in-code.

documentTemplates:
  - organizationId
  - name, description
  - category: "contract"|"invoice"|"consent"|"referral"|"prescription"|"report"|"protocol"|"custom"
  - content (HTML z placeholderami {{field:klucz}})
  - module: "platform"|"crm"|"gabinet"|string (tag filtrujący)
  - requiredSources: string[] (klucze source'ów wymaganych przy tworzeniu dokumentu)
  - requiresSignature: boolean
  - signatureSlots: [{id, role: "author"|"client"|"patient"|"employee"|"witness", label: string}]
  - accessControl: { mode: "all"|"roles"|"users", roles: string[], userIds: Id<"users">[] }
  - version: number
  - parentTemplateId: opcjonalny self-ref do poprzedniej wersji
  - status: "draft"|"active"|"archived"
  - createdBy, createdAt, updatedAt

documentTemplateFields:
  - templateId
  - fieldKey (slug, unikalny w ramach szablonu)
  - label (wyświetlana etykieta)
  - type: "text"|"textarea"|"number"|"date"|"select"|"checkbox"|"signature"|"currency"|"phone"|"email"|"pesel"
  - sortOrder
  - group (opcjonalny string — nazwa sekcji grupującej pola w formularzu)
  - options: [{label, value}] (dla select)
  - defaultValue: string|null (statyczny default, używany gdy brak bindingu)
  - binding: { source: string, field: string } | null
  - validation: { required, min, max, pattern, minLength, maxLength }
  - placeholder, helpText
  - width: "full"|"half" (layout hint dla formularza)

documentInstances:
  - organizationId
  - templateId, templateVersion
  - title
  - renderedContent (HTML snapshot po wyrenderowaniu)
  - fieldValues: Record<string, any> (JSON z wartościami pól — finalne, po nadpisaniu przez usera)
  - resolvedSources: Record<string, string> (mapa source key → instance ID, snapshot tego co zostało użyte do rozwiązania wartości)
  - status: "draft"|"pending_review"|"approved"|"pending_signature"|"signed"|"archived"
  - module: string (dziedziczony z szablonu)
  - signatures: [{slotId, slotLabel, signatureData (base64), signedByUserId, signedByName, signedAt}]
  - pdfFileId: Id<"_storage">|null
  - createdBy, createdAt, updatedAt
  - reviewedBy, reviewedAt
  - approvedBy, approvedAt

Usunięty contextType/contextId — zastąpiony przez resolvedSources. Instancja nie musi wiedzieć "jestem dokumentem pacjenta" — wie "przy tworzeniu użyto patient=ID123, appointment=ID456". To jest bardziej elastyczne bo:
  - dokument może mieć wiele kontekstów jednocześnie (pacjent + wizyta + lekarz)
  - query "pokaż dokumenty tego pacjenta" robi się przez filtr na resolvedSources
  - nie trzeba definiować enum contextType — nowe źródło działa od razu

### Struktura plików

```
convex/
  documentTemplates.ts          (CRUD szablonów)
  documentTemplateFields.ts     (CRUD pól szablonu)
  documentInstances.ts          (CRUD instancji + workflow + rendering)
  documentDataSources.ts        (registry core: definicja typu, bazowe source'y, agregacja)
  gabinet/documentDataSources.ts (source'y: patient, employee, appointment)
  crm/documentDataSources.ts    (source'y: contact, company, lead, deal)

src/lib/document-data-sources.ts (typy TypeScript dla frontu, lista source'ów do UI discovery)

src/components/documents/
  template-editor.tsx
  template-field-panel.tsx
  template-field-config.tsx
  document-from-template.tsx
  document-viewer.tsx
  document-instance-table.tsx
  signature-pad.tsx
  pdf-export.tsx
  source-field-picker.tsx       (komponent wyboru source→field w konfiguracji pola)

src/routes/_app/_auth/dashboard/
  _layout.settings.document-templates.tsx
  _layout.settings.document-templates.new.tsx
  _layout.settings.document-templates.$id.tsx
  _layout.documents.index.tsx
  _layout.documents.$instanceId.tsx
```

### RBAC

Nowe wpisy w orgPermissions:
  - document_templates / view|create|edit|delete
  - document_instances / view|create|edit|approve|sign|delete

Plus per-template accessControl jako dodatkowy filtr.

---

## 2. Specyfikacja zachowania UI

Specyfikacja funkcjonalna — co musi być obecne i jak elementy działają względem siebie.

### 2.1 Edytor szablonu (admin)

Ekran podzielony na dwie strefy: edytor treści (centralna, dominująca) i panel boczny (prawa strona, stała szerokość).

EDYTOR TREŚCI:
  - TipTap z toolbarem: bold, italic, underline, nagłówki (H1-H3), listy, tabela, linia pozioma, wyrównanie tekstu.
  - W toolbarze dodatkowy przycisk "Wstaw pole" — aktywuje/deaktywuje panel boczny z polami.
  - Placeholder pola w treści renderowany jako inline badge z etykietą pola i ikoną typu. Badge nieedytowalny jako tekst — Delete/Backspace usuwa, drag-and-drop przesuwa.
  - Dwuklik na badge otwiera modal edycji tego pola.
  - Wpisanie {{ otwiera dropdown autocomplete z listą zdefiniowanych pól. Wybranie wstawia badge. Brak pól → "Brak pól — dodaj pole w panelu bocznym".
  - Treść zapisywana jako HTML z placeholderami {{field:fieldKey}}.

PANEL BOCZNY (pola szablonu):
  - Lista zdefiniowanych pól szablonu: etykieta, typ (badge), binding info (jeśli zbindowane: "← Pacjent → Imię"), ikona przeciągania.
  - Klik na pole → wstawia w edytor w pozycji kursora.
  - Przycisk "Dodaj pole" → modal konfiguracji.
  - Każde pole: przycisk edycji (ołówek) i usunięcia (kosz). Usunięcie pola użytego w treści → ostrzeżenie.
  - Drag-and-drop sortowanie — kolejność determinuje kolejność w formularzu wypełniania.
  - Sekcja "Dostępne źródła danych" pod listą pól. Drzewo: źródło (np. "Pacjent") → pola (Imię, Nazwisko, PESEL...). Czysto informacyjne — pokazuje adminowi co może zbindować. Widoczne źródła zależą od pola `module` szablonu: platform → tylko bazowe; gabinet → bazowe + gabinet sources; crm → bazowe + crm sources. Klik na pole w drzewie źródeł → tworzy nowe pole szablonu z pre-wypełnionym bindingiem.

MODAL KONFIGURACJI POLA:
  - Etykieta (wymagane). Klucz systemowy (auto-slug, edytowalny). Typ (select). Grupa (tekst). Szerokość (full/half).
  - Sekcja "Źródło danych": toggle "Pole ręczne" / "Powiązane ze źródłem danych".
    - Pole ręczne: opcjonalna statyczna wartość domyślna.
    - Powiązane: dwa selecty kaskadowo — pierwszy wybiera source (np. "Pacjent"), drugi wybiera pole w tym source (np. "Imię"). Po wybraniu, etykieta pola auto-wypełnia się etykietą ze source'a (admin może nadpisać). Typ pola auto-ustawia się z typu pola source'a.
  - Sekcja "Walidacja": checkbox "Wymagane", min/max (number/currency), min/max length (text/textarea).
  - Dla type=select: edytor opcji.
  - "Zapisz" / "Anuluj".

NAGŁÓWEK STRONY EDYTORA:
  - Nazwa szablonu (inline editable, duża czcionka).
  - Select kategorii.
  - Select modułu (platform/crm/gabinet) — zmiana modułu zmienia listę dostępnych source'ów w panelu bocznym. Jeśli pola mają bindingi do source'ów niedostępnych w nowym module → ostrzeżenie.
  - Opis szablonu (textarea, opcjonalny).
  - "Wymagane źródła": multi-select z kluczami source'ów. Auto-wypełniany na podstawie bindingów pól (jeśli jakiekolwiek pole jest zbindowane do "patient", to "patient" automatycznie trafia do requiredSources). Admin może dodać ręcznie dodatkowe.
  - "Podgląd" — renderuje treść z przykładowymi wartościami (mock data dla każdego typu pola).
  - "Zapisz szkic" / "Opublikuj". Aktywny szablon: "Opublikuj nową wersję".

USTAWIENIA SZABLONU (zakładka lub sekcja pod edytorem):
  - Podpisy: toggle "Wymaga podpisu". Lista slotów: etykieta + rola (select). Drag-and-drop.
  - Dostęp: "Wszyscy w organizacji" / "Wybrane role" / "Wybrani użytkownicy".

### 2.2 Tworzenie dokumentu z szablonu (user)

Punkt wejścia: przycisk "Nowy dokument" w trzech miejscach:
  a) Lista dokumentów (platformowa) — user wybiera szablon z pełnej listy.
  b) Karta encji (kontakt, pacjent, deal itd.) — zakładka "Dokumenty", "Nowy z szablonu". Lista filtrowana po module i dostępie. Kontekst encji automatyczny.
  c) Widok wizyty (Gabinet) — "Dodaj dokument". Filtr module=gabinet.

KROK 1 — WYBÓR SZABLONU:
  - Lista dostępnych szablonów pogrupowanych po kategorii.
  - Każdy szablon: nazwa, kategoria badge, opis, liczba pól, wymagane źródła (badge'e).
  - Filtr tekstowy.
  - Szablony z niespełnionymi wymaganiami źródeł (np. wymaga "patient" ale user jest w kontekście CRM): widoczne ale wyszarzone z tooltipem "Wymaga kontekstu: Pacjent".
  - Klik na dostępny szablon → krok 2.

KROK 1a — WYBÓR BRAKUJĄCYCH ŹRÓDEŁ (opcjonalny):
  - Jeśli szablon wymaga źródeł które nie zostały dostarczone automatycznie z kontekstu, user musi je wskazać ręcznie.
  - Dla każdego brakującego źródła: picker encji (np. wyszukiwarka pacjentów, kontaktów).
  - Ten krok pomija się gdy wszystkie wymagane źródła są dostępne z kontekstu.

KROK 2 — WYPEŁNIANIE PÓL:
  - Split view: formularz pól (~40%) + podgląd dokumentu (~60%).
  - Formularz: pola wg sortOrder, pogrupowane w sekcje. Width=half → 2 kolumny. Width=full → pełna.
  - Pola zbindowane: wartość rozwiązana z source'a, pre-wypełniona. Obok pola ikona linku i tooltip "Wypełnione z: Pacjent → Imię". User może nadpisać — wtedy ikona zmienia się na "Nadpisane ręcznie" i pojawia się przycisk "Przywróć z danych źródłowych".
  - Pola ręczne: puste (lub z domyślną statyczną wartością).
  - Pola wymagane: gwiazdka. Walidacja on blur i przy zapisie.
  - Podgląd: live render (debounce 300ms). Niewypełnione → pomarańczowy placeholder z etykietą. Wypełnione → tekst inline.
  - Mobile (< 768px): tabs "Formularz" / "Podgląd".
  - Tytuł dokumentu: na górze, default "[Nazwa szablonu] — [data]", edytowalny.

KROK 2 AKCJE:
  - "Zapisz szkic" → draft.
  - "Zatwierdź" → pending_review (jeśli wymaga review) lub pending_signature (jeśli wymaga podpisu) lub approved.
  - "Anuluj" → potwierdzenie jeśli dirty.

### 2.3 Widok instancji dokumentu

NAGŁÓWEK:
  - Tytuł, status badge.
  - Metadane: data, autor, szablon źródłowy (link), powiązane źródła (np. "Pacjent: Jan Kowalski" — link do karty, "Wizyta: 15.03.2026" — link do wizyty). Generowane z resolvedSources.
  - Przyciski akcji zależne od statusu.

TREŚĆ:
  - Wyrenderowany HTML (read-only).
  - Draft: przycisk "Edytuj" → formularz z zachowanymi fieldValues.

PODPISY:
  - Widoczne jeśli szablon wymaga.
  - Lista slotów: etykieta, status, miniatura podpisu (jeśli podpisany), imię, data.
  - Slot oczekujący na bieżącego usera → "Podpisz" → pad.
  - Slot na kogoś innego → "Oczekuje na podpis: [rola]".
  - Wszystkie podpisane → auto-przejście do signed.

AKCJE WG STATUSU:
  - draft: "Edytuj", "Zatwierdź", "Usuń"
  - pending_review: "Zatwierdź" (approve permission), "Odrzuć" (→ draft z komentarzem)
  - approved: "Wyślij do podpisu" (jeśli wymaga), "Pobierz PDF", "Archiwizuj"
  - pending_signature: "Podpisz" (jeśli slot usera), "Pobierz PDF"
  - signed: "Pobierz PDF", "Archiwizuj"
  - archived: "Pobierz PDF", "Przywróć"

### 2.4 Lista dokumentów

LISTA PLATFORMOWA (/dashboard/documents):
  - Tabela: tytuł, szablon, kategoria, status, powiązania (source badge'e z nazwami), autor, data.
  - Filtry: status, kategoria, moduł, autor.
  - Wyszukiwanie po tytule.
  - Klik → widok instancji.
  - "Nowy dokument" → wybór szablonu bez kontekstu.

LISTA W KARCIE ENCJI:
  - Tabela filtrowana: wszystkie instancje gdzie resolvedSources zawiera tę encję.
  - Kolumny: tytuł, szablon, status, data. Bez powiązań (wiadomo).
  - "Nowy z szablonu" → wybór szablonu z automatycznym kontekstem.

### 2.5 Zarządzanie szablonami (admin)

LISTA SZABLONÓW (Ustawienia → Szablony dokumentów):
  - Tabela: nazwa, kategoria, moduł, status, pola (count), wymagane źródła (badge'e), wersja, data.
  - Filtry: status, kategoria, moduł.
  - Akcje: edytuj, duplikuj, archiwizuj.
  - "Nowy szablon" → edytor.

DUPLIKACJA: kopia z polami, nazwa + "— kopia", status draft.

ARCHIWIZACJA: nie pojawia się w wyborze, istniejące instancje działają, potwierdzenie.

WERSJONOWANIE: edycja aktywnego → draft nowej wersji. Stara aktywna do publikacji nowej. Info w edytorze.

### 2.6 Interakcje między elementami

SZABLON → POLE:
  - Usunięcie pola: placeholder w treści → "[brak pola]" w podglądzie. Ostrzeżenie.
  - Zmiana fieldKey: auto-aktualizacja placeholdera w HTML.
  - Zmiana typu: reset walidacji i opcji (potwierdzenie).

SZABLON → INSTANCJA:
  - Instancja = snapshot. Zmiana szablonu nie wpływa na istniejące.
  - Draft + szablon zmieniony → notyfikacja "Szablon zaktualizowany. Odświeżyć?"

POLE → BINDING → SOURCE:
  - Binding wskazuje source + field. Jeśli source zostanie usunięty z registry → binding staje się "osierocony". Edytor szablonu podświetla takie pola na czerwono z komunikatem "Źródło danych '[key]' niedostępne".
  - Jeśli pole w source zmieni nazwę → binding łamie się. Dlatego klucze pól w source muszą być stabilne (konwencja: nigdy nie zmieniaj key, dodawaj nowe).

FORMULARZ → PODGLĄD (live):
  - Zmiana w formularzu → aktualizacja podglądu (debounce 300ms).
  - Podgląd scrolluje się niezależnie.
  - Klik na pole w podglądzie → focus na pole w formularzu.
  - Klik na pole w formularzu → highlight w podglądzie.

PODPISY → STATUS:
  - pending_signature tylko po approved/zatwierdzone.
  - Podpis jednorazowy, nieodwracalny.
  - Wszystkie podpisane → auto signed.
  - Signed = niemutowalny.

ŹRÓDŁA → FILTROWANIE SZABLONÓW:
  - Kontekst encji determinuje dostępne source'y → filtruje szablony wg requiredSources.
  - Brak kontekstu → wszystkie szablony, user musi ręcznie podać source instances.
  - Nadmiarowe source'y ignorowane (szablon wymaga patient, user daje patient + appointment — ok).

PDF EXPORT:
  - Dostępny od approved wzwyż (nie draft).
  - Client-side: html2canvas + jsPDF. Zapis do Convex storage.
  - Podpisy w PDF na dole jako obrazy z metadanymi.
  - Regeneracja przy zmianie dokumentu (np. po review round).

---

## 3. Plan implementacji

### Etap 1: Schema + Data Source Registry + backend core

1.1. Typ TypeScript DataSourceDefinition: { key, label, module, fields[], resolve() }.
1.2. Bazowe source'y w convex/documentDataSources.ts (system, current_user, org).
1.3. Source'y Gabinet w convex/gabinet/documentDataSources.ts (patient, employee, appointment).
1.4. Source'y CRM w convex/crm/documentDataSources.ts (contact, company, lead, deal).
1.5. Centralny registry: getAllDataSources(), getDataSource(key), resolveSource(ctx, key, id).
1.6. Tabele w convex/schema.ts (documentTemplates, documentTemplateFields, documentInstances).
1.7. convex/documentTemplates.ts — CRUD + publish + archive + duplicate.
1.8. convex/documentTemplateFields.ts — CRUD + reorder.
1.9. convex/documentInstances.ts — create (z resolve sources + render), update draft, workflow transitions, sign, archive.
1.10. Query: listAvailableSources(module) — zwraca deklaracje source'ów (bez resolverów) do UI.

### Etap 2: UI edytora szablonów

2.1. template-editor.tsx — TipTap z {{field:key}} badge'ami.
2.2. template-field-panel.tsx — lista pól, drag-and-drop, CRUD.
2.3. template-field-config.tsx — modal: etykieta, typ, binding (source-field-picker), walidacja.
2.4. source-field-picker.tsx — kaskadowe selecty source → field, z deklaracjami z registry.
2.5. Route: settings.document-templates (lista), .new (nowy), .$id (edycja).

### Etap 3: UI tworzenia dokumentu

3.1. template-picker.tsx — dialog wyboru szablonu z filtrowaniem, grupowaniem, source requirements.
3.2. source-instance-picker.tsx — picker brakujących source instances (np. wyszukiwarka pacjenta).
3.3. document-from-template.tsx — split view: formularz + live preview. Binding resolution, override tracking.
3.4. document-viewer.tsx — read-only, podpisy, akcje wg statusu.
3.5. signature-pad.tsx — przeniesienie z gabinet.
3.6. Route: documents.index (lista), .$instanceId (widok).

### Etap 4: Integracja z modułami

4.1. DocumentFromTemplateDialog — wrapper przyjmujący sources map + module.
4.2. Karta pacjenta (Gabinet): zakładka Dokumenty, przycisk, lista filtrowana.
4.3. Karta kontaktu/firmy/deala (CRM): j.w.
4.4. Widok wizyty (Gabinet): przycisk + lista.
4.5. document-instance-table.tsx — reużywalna tabela z filtrowaniem po resolvedSources.

### Etap 5: Workflow + podpisy + PDF

5.1. Workflow transitions z walidacją.
5.2. Interfejs podpisywania w viewerze.
5.3. PDF export client-side.
5.4. Powiadomienia (review request, signature request).

### Etap 6: Migracja Gabinet

6.1. Migracja gabinetDocumentTemplates → documentTemplates + documentTemplateFields (z auto-tworzeniem pól z bindingami ze starych {{patient.X}} placeholderów).
6.2. Migracja gabinetDocuments → documentInstances.
6.3. Aktualizacja route'ów Gabinet.
6.4. Deprecation starych tabel.

---

## 4. Metryki sukcesu

### Funkcjonalne (bezwzględnie wymagane)

M1. Admin tworzy szablon, definiuje pola ręczne i zbindowane do source'ów, publikuje. Szablon dostępny dla userów.

M2. User wybiera szablon z kontekstu encji. Pola zbindowane automatycznie wypełnione danymi encji. User nadpisuje jedną wartość — nadpisanie zachowane, reszta z source'a.

M3. User zapisuje draft, wraca, edytuje, zatwierdza. Workflow: draft → approved (bez review) lub draft → pending_review → approved → pending_signature → signed.

M4. Podpis na padzie, zapis, auto-signed po wszystkich slotach. Signed = immutable.

M5. PDF z treścią i podpisami. Zapis do storage, re-download.

M6. Wersjonowanie: edycja aktywnego tworzy nową wersję. Stare instancje zachowują snapshot.

M7. Access control: user bez dostępu nie widzi szablonu. User bez approve nie widzi przycisku.

M8. Ten sam szablon użyty w CRM (kontekst contact) i Gabinet (kontekst patient) — core bez zmian.

M9. Dodanie nowego modułu = 1 plik data source definitions. Zero zmian w core, zero zmian w UI komponentach, zero zmian w schema. Nowe source'y natychmiast dostępne w edytorze szablonów i w formularzu wypełniania.

M10. Szablon korzystający z wielu source'ów jednocześnie (patient + appointment + org) — działa poprawnie, każde źródło rozwiązane niezależnie.

### Jakościowe

M11. Od kliknięcia "Nowy dokument" do zapisania draftu: max 4 kliknięcia (gdy kontekst dostępny automatycznie).

M12. Live preview < 500ms perceived latency.

M13. Mobile: formularz w pełni funkcjonalny (tabs).

M14. Binding UX: admin konfiguruje binding w 2 kliknięcia (wybierz source → wybierz pole). Typ i etykieta auto-wypełnione.

### Regresja

M15. Istniejące dokumenty Gabinet (po migracji) czytelne, podpisy zachowane.

M16. CRM file-based documents nietknięte.

M17. Wydajność: listy < 1s load (Convex real-time).
