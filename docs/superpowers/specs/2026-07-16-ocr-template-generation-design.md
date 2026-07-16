# Spec: Generyczny pipeline analizy dokumentów (AnalysisKind) + generowanie szablonów ze skanów

Data: 2026-07-16
Status: zatwierdzony (brainstorming z użytkownikiem)

## Cel

Rozszerzyć istniejący pipeline OCR/AI (`convex/_ai/documentAnalyzer.ts`, dziś używany
wyłącznie do faktur dostaw) tak, aby:

1. był **horyzontalnie reużywalny** — dodanie kolejnego rodzaju analizy dokumentu nie
   wymaga zmian w providerze, fabryce ani infrastrukturze („raz zrobione, używane
   wielokrotnie"),
2. pierwszym nowym zastosowaniem było **generowanie szablonów dokumentów ze skanów**:
   użytkownik wgrywa skan/PDF istniejącego formularza (zgoda, wywiad, RODO…), AI
   odtwarza strukturę dokumentu i wykrywa edytowalne pola, wynik otwiera się w
   istniejącym edytorze szablonów TipTap do weryfikacji i zapisu.

## Decyzje produktowe (zatwierdzone)

1. **Zakres reuse:** abstrakcja projektowana pod cztery zastosowania — faktury (już
   jest), szablony ze skanów (budujemy teraz), a w przyszłości: skan wypełnionego
   dokumentu → dane (odpowiedzi do formDocument/kartoteki), skan dowodu → kartoteka,
   wyniki badań → karta klienta. Implementujemy TYLKO faktury+szablony (YAGNI na
   pozostałych; mają być tanie do dodania).
2. **Weryfikacja wyniku:** bez dedykowanego ekranu decyzji — wygenerowany szablon
   otwiera się bezpośrednio w istniejącym edytorze TipTap (węzły `formField` są już
   wizualnie wyróżnione, edytowalne, z dropdownem mapowania do kartoteki). Edytor JEST
   ekranem weryfikacji.
3. **Persystencja wyniku:** generyczna tabela `document_analysis_jobs` współdzielona
   przez wszystkie tryby (przeżywa odświeżenie strony, gotowa pod przyszły async).
4. **Auto-mapowanie:** AI sugeruje mapowanie wykrytych pól do PÓL WBUDOWANYCH
   kartoteki (`patientFieldHint`), z zamkniętej listy; NIE proponuje pól
   niestandardowych (`custom:*`).

## Architektura rdzenia (podejście B — rejestr AnalysisKind)

Odwrócenie zależności: provider staje się czystym transportem, rodzaje analizy są
pluginami.

```
convex/_ai/
  documentAnalyzer.ts          # kontrakt: DocumentPage, transport, fabryka (refaktor)
  providers/
    openaiDocumentAnalyzer.ts  # CZYSTY transport: (pages, prompt, maxTokens) → surowy JSON
  kinds/
    invoice.ts                 # kind "invoice" — prompt+walidacja+map WYNIESIONE z providera
    formTemplate.ts            # kind "form_template" — NOWY
  registry.ts                  # mapa id → definicja kind
convex/documentAnalysisJobs.ts # generyczne akcje: createJob / runJob / getJob (+ RBAC)
```

Kontrakt rodzaju analizy:

```ts
interface AnalysisKind<TResult> {
  id: string;                                          // "invoice" | "form_template" | ...
  buildPrompt(context?: Record<string, unknown>): string;
  validate(raw: unknown): boolean;                     // czysta funkcja
  map(raw: unknown): TResult;                          // czysta funkcja
  maxTokens?: number;
}
```

`context` to kanał na dane specyficzne dla trybu (dla szablonów: lista pól wbudowanych
kartoteki; dla przyszłego „wypełnionego dokumentu": `variableBindings` szablonu).
Provider nic o nim nie wie — wchodzi wyłącznie do `buildPrompt`.

Transport providera: `runAnalysis(pages, prompt, maxTokens) → { status, rawJson }`.
Zachowuje całą obecną mechanikę: fetch bajtów z Convex storage server-side (bez
publicznych URL-i), base64, PDF jako `file` / obrazy jako `image_url detail:high`,
`response_format: json_object`, mapowanie błędów API, statusy `no_pages` /
`unsupported_format` / `not_implemented` / `error`. NullProvider bez zmian.

### Wspólna tabela zadań

```
document_analysis_jobs:
  id, organization_id, kind, pages (JSON [{storageId,mimeType,position}]),
  context (JSON, opcjonalny), status (pending|running|ok|error),
  result_json (TEXT), error_message (TEXT),
  created_by, created_at, updated_at, completed_at
indeksy: by_org, by_org_and_kind; RLS: standardowe org-isolation (4 polityki per-command)
```

Jedna migracja SQL + wpis w `TABLE_MAP` + row type + regeneracja typów. CI auto-apply
(naprawione w #2855) nakłada ją przy merge.

Akcje (`convex/documentAnalysisJobs.ts`):
- `createJob(kind, pages, context?)` → id (status `pending`)
- `runJob(jobId)` — synchronicznie: registry→kind, buildPrompt(context), transport,
  validate+map, zapis `result_json`/`error_message` + status. Idempotentny (retry =
  ponowne wywołanie, nadpisuje wynik).
- `getJob(jobId)` → pełny job.

### Dwie kluczowe zasady

1. **Faktury stają się pierwszym kind.** `analyzeDeliveryInvoice` zachowuje identyczny
   publiczny kontrakt (zero zmian dla magazynu/UI dostaw), wewnętrznie woła rdzeń z
   kind `invoice`. Refaktor udowodniony na produkcyjnym konsumencie od pierwszego dnia.
2. **Jobs są opcją, nie przymusem.** Dostawy NIE przechodzą na tabelę zadań (mają
   własne pola `analysisStatus` na wierszu dostawy). Tabela zadań jest dla trybów bez
   naturalnego wiersza na wynik (np. szablon przed zapisaniem). Kind można wołać oboma
   kanałami.

## Tryb `form_template`

### Schemat wyniku (ParsedFormTemplate)

```ts
{
  title: string | null,
  blocks: Array<
    | { type: "heading", level: 1|2|3, text: string }
    | { type: "paragraph", segments: Segment[] }
    | { type: "bulletList" | "orderedList", items: Segment[][] }
  >,
  confidence: number | null
}

Segment =
  | { type: "text", text: string }
  | { type: "field",
      label: string,
      fieldType: "text"|"textarea"|"select"|"button_select"|"date"|"checkbox",
      options?: string[],
      required?: boolean,
      patientFieldHint?: string | null }   // np. "builtin:pesel"
```

Reguły prompta: puste linie / kropkowane miejsca / kratki → `field`; checkboxy z
opcjami → `select`/`checkbox`; daty przy podpisach → `date`; większe ramki na opis →
`textarea`. Dokumenty głównie po polsku — prompt to uwzględnia.

**Auto-mapowanie zawężone:** prompt dostaje w `context` zamkniętą listę celów z
`PATIENT_BUILTIN_FIELDS` (ta sama stała, którą renderuje dropdown w edytorze —
`src/lib/documents/patient-mappable-fields.ts`); AI wolno zwrócić wyłącznie wartość z
listy albo `null`. `map()` dodatkowo odrzuca hinty spoza listy (podwójna walidacja).
Bez sugerowania `custom:*` (ryzyko zaśmiecenia rejestru definicji) — pola
niestandardowe użytkownik tworzy ręcznie w edytorze (funkcja już istnieje).

### Mapper → TipTap

Czysta funkcja frontendowa `parsedTemplateToTipTap(parsed): string` w
`src/lib/documents/analysis-to-template.ts`. Buduje `content_json`: bloki → węzły
heading/paragraph/bulletList/orderedList; segmenty `field` → istniejące węzły
`formField` (`fieldId` = slug z label + licznik przy kolizji, `filledBy: "client"`,
`patientField` z hinta). Zero nowych typów węzłów — edytor renderuje wynik bez zmian.

### Przepływ UI

1. Ustawienia → Szablony: przycisk **„Nowy ze skanu"** obok „Nowy szablon".
2. Dialog uploadu multi-plik (PDF/JPG/PNG; reuse wzorca uploadu stron faktury do
   Convex storage) → `createJob(kind: "form_template", pages, context)` → `runJob` →
   spinner.
3. Sukces → nawigacja na `/settings/form-templates/new?analysisJobId=<id>`. Strona
   `new` przy obecności parametru robi `getJob`, mapper buduje treść, edytor startuje
   wypełniony + baner „Szablon wygenerowany ze skanu — zweryfikuj wykryte pola przed
   zapisem" (z `confidence`). Refresh nie gubi pracy — job w tabeli.
4. Zapis = istniejący `createTemplate` bez zmian; `buildPatientVariableBindings`
   automatycznie zbiera `patientField` z wygenerowanych węzłów → szablon ze skanu od
   razu zapisuje dane podpisanych dokumentów do kartoteki (feature mapowania z
   2026-07-09).

### Ograniczenie (zapisane wprost)

TipTap jest flow-based: skan odtwarzamy jako strukturalny dokument (nagłówki, akapity,
listy, pola inline), NIE jako pixel-perfect kopię graficzną. Dla zgód / wywiadów /
RODO to właściwa semantyka. Format `pdfme` (współrzędne) jest w projekcie martwy
(legacy w schema) i nie wraca.

## Błędy, bezpieczeństwo, testy

**Błędy:** statusy transportu → `status: "error"` + `error_message` na jobie; UI toast
z konkretem + „Ponów" (idempotentny `runJob`). JSON niezgodny z walidacją kind →
`error` (bez ratowania połowicznych wyników). NullProvider → czytelny komunikat
„Analiza AI niedostępna — brak konfiguracji". Timeout 60s; `maxTokens` dla
`form_template` = 8192. `confidence` w banerze edytora. Bez crona sprzątającego joby w
MVP (świadoma decyzja; kandydat do tech-debt).

**RBAC:** `createJob`/`runJob`/`getJob` — `verifyOrgAccess` + ten sam `checkPermission`,
którego używa `templates.create` (tworzenie szablonu ze skanu = tworzenie szablonu).
Nowa tabela: standardowe RLS org-isolation. `created_by` na jobie. Pliki w Convex
storage, czytane server-side.

**Testy:**
- Jednostkowe (czyste funkcje, bez OpenAI): regresja kind `invoice` (walidacja/map na
  fixture'ach identyczna z obecną logiką — dowód nieinwazyjności refaktoru); kind
  `form_template` (poprawny JSON / zepsuty JSON / hint spoza allowlisty odrzucony);
  mapper `parsedTemplateToTipTap` (bloki→węzły, kolizje `fieldId`, propagacja
  `patientField`).
- Integracyjne (convex-test + stub Supabase in-memory): create→run→get happy path,
  ścieżka błędu z NullProviderem, odmowa RBAC, odczyt joba po „odświeżeniu".
- Polityka zero nowych błędów typecheck vs main.
- E2E: ręczna checklista smoke (upload → edytor wypełniony → zapis → szablon działa w
  przepływie wypełniania/podpisu).

## Poza zakresem MVP (świadomie)

- Asynchroniczna kolejka analizy (tabela gotowa, `runJob` synchroniczny).
- Sugerowanie pól `custom:*` przez AI.
- Pozostałe trzy tryby (wypełniony dokument → dane; dowód → kartoteka; wyniki badań →
  karta klienta) — każdy to w tej architekturze nowy plik w `kinds/` + własny
  konsument.
- Sprzątanie starych jobów (cron).

## Kryteria sukcesu

1. Istniejący przepływ faktur działa bez żadnej zmiany zachowania (regresja testowa).
2. Skan przykładowej zgody/wywiadu (PDF lub zdjęcie) → szablon w edytorze ze
   strukturą, wykrytymi polami i sensownymi hintami mapowania → zapis → szablon
   normalnie działa w przepływie wypełniania i podpisu.
3. Dodanie hipotetycznego trzeciego kind nie wymaga zmian poza nowym plikiem w
   `kinds/` i rejestracją (weryfikowalne przeglądem kodu).
