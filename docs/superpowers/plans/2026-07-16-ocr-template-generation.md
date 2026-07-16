# OCR Template Generation (AnalysisKind pipeline) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zrefaktorować pipeline OCR do generycznego rejestru `AnalysisKind` (provider = czysty transport) i zbudować pierwszy nowy tryb: generowanie szablonów dokumentów ze skanów, otwieranych do weryfikacji w istniejącym edytorze TipTap.

**Architecture:** Provider OpenAI staje się transportem `(pages, prompt, maxTokens) → surowy JSON`; rodzaje analizy są pluginami `{ id, buildPrompt, validate, map }` w `convex/_ai/kinds/`. Wynik trybów bez własnego wiersza trwa w nowej generycznej tabeli `document_analysis_jobs`. Faktury zostają pierwszym kind bez zmiany zachowania (`analyzeDeliveryInvoice` zachowuje kontrakt). Spec: `docs/superpowers/specs/2026-07-16-ocr-template-generation-design.md`.

**Tech Stack:** Convex actions + Supabase (hybryda projektu), OpenAI SDK (mockowany w testach przez `vi.mock("openai")`), TipTap `formField` nodes, TanStack Router, vitest (`npm run test:unit` = `cd convex && vitest run`; testy w `tests/convex/`).

## Global Constraints

- Gałąź robocza: `feat/ocr-template-generation` (istnieje; spec już zacommitowany).
- Zero zmian zachowania przepływu faktur — istniejący `tests/convex/openaiDocumentAnalyzer.test.ts` po adaptacji API musi przechodzić z tymi samymi asercjami wyników.
- Zero NOWYCH błędów `tsc` vs main: `npx tsc -p convex/tsconfig.json --pretty false` i `npx tsc -p tsconfig.app.json --pretty false` — porównuj listę błędów z main (main ma znane pre-existing błędy; nie naprawiaj ich, nie dodawaj nowych).
- Każdy string UI ma klucze i18n PL + EN (`public/locales/pl/translation.json`, `public/locales/en/translation.json`).
- Migracja SQL: NIE nakładać ręcznie na bazę — commit + PR; CI auto-apply na merge. Przed commitem sprawdź najwyższy numer w `supabase/migrations/` na aktualnym main i w razie kolizji przenumeruj (main jest szybki; dziś ostatnia = `00062`). Po dodaniu SQL uruchom `node scripts/gen-db-types.mjs` i zacommituj wygenerowane typy.
- Uwierzytelnianie akcji: wzorzec `ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, { organizationId })` — dokładnie jak `convex/documents/templates.ts:create` (szablony nie mają dodatkowego `checkPermission`; jobs też nie).
- Komendy testów: `npm run test:unit -- ../tests/convex/<plik>.test.ts` (cwd skryptu to `convex/`, stąd `../`). Pełny suite: `npm run test:unit`.

---

### Task 1: Rdzeń — transport + `AnalysisKind` + kind `invoice` (refaktor bez zmiany zachowania)

**Files:**
- Modify: `convex/_ai/documentAnalyzer.ts` (kontrakt + `analyzeDocument`)
- Modify: `convex/_ai/providers/openaiDocumentAnalyzer.ts` (czysty transport)
- Create: `convex/_ai/kinds/invoice.ts`
- Modify: `convex/warehouseDeliveries.ts:520-530` (call site) + import na górze pliku
- Modify: `tests/convex/openaiDocumentAnalyzer.test.ts` (adaptacja do nowego API)
- Test: `tests/convex/analysisKindInvoice.test.ts` (nowy)

**Interfaces:**
- Produces (używane przez WSZYSTKIE późniejsze taski):
  ```ts
  // convex/_ai/documentAnalyzer.ts
  export interface DocumentPage { storageId: string; mimeType: string; position: number }
  export type StorageFetcher = (storageId: string) => Promise<Blob | null>;
  export type TransportResult =
    | { status: "ok"; rawJson: string }
    | { status: "not_implemented" }
    | { status: "no_pages" }
    | { status: "unsupported_format"; mimeType: string }
    | { status: "error"; message: string };
  export interface DocumentTransport {
    run(pages: DocumentPage[], prompt: string, maxTokens?: number): Promise<TransportResult>;
  }
  export interface AnalysisKind<TResult> {
    id: string;
    buildPrompt(context?: Record<string, unknown>): string;
    validate(raw: unknown): boolean;
    map(raw: unknown, opts: { rawJson: string; context?: Record<string, unknown> }): TResult;
    maxTokens?: number;
  }
  export type AnalyzeResult<T> =
    | { status: "ok"; data: T }
    | Exclude<TransportResult, { status: "ok" }>;
  export function getDocumentTransport(fetchFile: StorageFetcher): DocumentTransport;
  export async function analyzeDocument<T>(
    transport: DocumentTransport, kind: AnalysisKind<T>,
    pages: DocumentPage[], context?: Record<string, unknown>,
  ): Promise<AnalyzeResult<T>>;
  // ParsedInvoice, ParsedInvoiceItem, isSupportedMimeType — eksporty ZOSTAJĄ bez zmian
  ```
  ```ts
  // convex/_ai/kinds/invoice.ts
  export const invoiceKind: AnalysisKind<ParsedInvoice>; // id: "invoice", maxTokens: 4096
  ```

- [ ] **Step 1: Napisz failing test dla kind invoice**

`tests/convex/analysisKindInvoice.test.ts` (fixture skopiowana 1:1 z `MINIMAL_VALID_RESPONSE` w istniejącym `tests/convex/openaiDocumentAnalyzer.test.ts` — zachowujemy identyczne dane, żeby udowodnić brak zmiany zachowania):

```ts
import { describe, expect, test } from "vitest";
import { invoiceKind } from "../../convex/_ai/kinds/invoice";

const VALID = {
  supplierName: "ACME Sp. z o.o.",
  supplierNip: "1234567890",
  invoiceNumber: "FV/2024/001",
  invoiceDate: "2024-06-01",
  deliveryDate: null,
  currency: "PLN",
  items: [
    {
      productName: "Krem regenerujący",
      quantity: 2,
      unit: "szt",
      unitPriceNet: 100,
      unitPriceGross: 123,
      vatRate: 23,
      vatCode: "A",
      lineValueNet: 200,
      lineValueGross: 246,
      lotNumber: "L-77",
      expiryDate: "2027-01-31",
    },
  ],
  confidence: 0.92,
};

describe("invoiceKind", () => {
  test("id and prompt", () => {
    expect(invoiceKind.id).toBe("invoice");
    expect(invoiceKind.buildPrompt()).toContain("supplierName");
    expect(invoiceKind.maxTokens).toBe(4096);
  });

  test("validate accepts a valid invoice and rejects garbage", () => {
    expect(invoiceKind.validate(VALID)).toBe(true);
    expect(invoiceKind.validate(null)).toBe(false);
    expect(invoiceKind.validate({ items: "nope" })).toBe(false);
    expect(invoiceKind.validate({ items: [{}] })).toBe(false); // item bez productName
  });

  test("map coerces types and carries rawJson as rawText", () => {
    const rawJson = JSON.stringify(VALID);
    const out = invoiceKind.map(VALID, { rawJson });
    expect(out.supplierName).toBe("ACME Sp. z o.o.");
    expect(out.items[0].unitPrice).toBe(100); // unitPriceNet → unitPrice
    expect(out.items[0].lotNumber).toBe("L-77");
    expect(out.confidence).toBe(0.92);
    expect(out.rawText).toBe(rawJson);
  });

  test("map nulls empty strings and non-finite numbers", () => {
    const messy = { ...VALID, supplierName: "", items: [{ ...VALID.items[0], quantity: "abc", unit: "" }] };
    const out = invoiceKind.map(messy, { rawJson: "{}" });
    expect(out.supplierName).toBeNull();
    expect(out.items[0].quantity).toBe(0);
    expect(out.items[0].unit).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILować (brak modułu)**

Run: `npm run test:unit -- ../tests/convex/analysisKindInvoice.test.ts`
Expected: FAIL — `Cannot find module '../../convex/_ai/kinds/invoice'`.

- [ ] **Step 3: Utwórz `convex/_ai/kinds/invoice.ts`**

PRZENIEŚ (nie kopiuj — usuń ze źródła w Step 4) z `convex/_ai/providers/openaiDocumentAnalyzer.ts`: `USER_PROMPT` (przemianuj na `INVOICE_PROMPT`), `RawItem`, `RawInvoice`, `isRawInvoice`, `str`, `num`, `mapItem`, `mapInvoice` — treść funkcji BEZ ZMIAN. Dodaj definicję kind:

```ts
// convex/_ai/kinds/invoice.ts
// Kind "invoice" — prompt + walidacja + mapowanie wyniesione 1:1 z providera
// OpenAI (refaktor #<PR>). Zachowanie identyczne jak przed refaktorem.
import type { AnalysisKind, ParsedInvoice } from "../documentAnalyzer";

const INVOICE_PROMPT = `<< dokładna, niezmieniona treść USER_PROMPT z openaiDocumentAnalyzer.ts:29-62 >>`;

// ... tu wklejone bez zmian: RawItem, RawInvoice, isRawInvoice, str, num, mapItem, mapInvoice ...

export const invoiceKind: AnalysisKind<ParsedInvoice> = {
  id: "invoice",
  maxTokens: 4096,
  buildPrompt: () => INVOICE_PROMPT,
  validate: (raw) => isRawInvoice(raw),
  map: (raw, opts) => mapInvoice(raw as RawInvoice, opts.rawJson),
};
```

(`<< ... >>` oznacza wierne przeniesienie istniejącego bloku — to jedyne miejsce w planie, gdzie treść już istnieje w repo i przenosi się bez modyfikacji.)

- [ ] **Step 4: Refaktor `documentAnalyzer.ts` i providera**

`convex/_ai/documentAnalyzer.ts`: zostaw `DocumentPage`, `ParsedInvoiceItem`, `ParsedInvoice`, `StorageFetcher`, `isSupportedMimeType`, `SUPPORTED_MIME_TYPES` bez zmian. USUŃ `interface DocumentAnalyzer { analyzeInvoice }`, `AnalyzeInvoiceResult` i klasę `NullDocumentAnalyzer` w obecnej formie. DODAJ typy z bloku Interfaces powyżej oraz:

```ts
class NullDocumentTransport implements DocumentTransport {
  async run(pages: DocumentPage[]): Promise<TransportResult> {
    if (pages.length === 0) return { status: "no_pages" };
    const unsupported = pages.find((p) => !isSupportedMimeType(p.mimeType));
    if (unsupported) return { status: "unsupported_format", mimeType: unsupported.mimeType };
    return { status: "not_implemented" };
  }
}

export function getDocumentTransport(fetchFile: StorageFetcher): DocumentTransport {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    const model = process.env.OPENAI_INVOICE_MODEL ?? "gpt-4o";
    return new OpenAIDocumentAnalyzer(apiKey, model, fetchFile);
  }
  return new NullDocumentTransport();
}

export async function analyzeDocument<T>(
  transport: DocumentTransport,
  kind: AnalysisKind<T>,
  pages: DocumentPage[],
  context?: Record<string, unknown>,
): Promise<AnalyzeResult<T>> {
  const res = await transport.run(pages, kind.buildPrompt(context), kind.maxTokens);
  if (res.status !== "ok") return res;
  let raw: unknown;
  try {
    raw = JSON.parse(res.rawJson);
  } catch {
    return { status: "error", message: "Model returned non-JSON response" };
  }
  if (!kind.validate(raw)) {
    return { status: "error", message: `Model response does not match expected ${kind.id} schema` };
  }
  return { status: "ok", data: kind.map(raw, { rawJson: res.rawJson, context }) };
}
```

`convex/_ai/providers/openaiDocumentAnalyzer.ts`: klasa implementuje teraz `DocumentTransport`. Metoda `analyzeInvoice(pages)` staje się `run(pages, prompt, maxTokens = 4096)`. Zmiany wewnątrz ciała metody (reszta transportu — pętla stron, base64, PDF/image parts, obsługa APIError — BEZ ZMIAN):
- `contentParts.push({ type: "text", text: USER_PROMPT })` → `contentParts.push({ type: "text", text: prompt })`
- `max_tokens: 4096` → `max_tokens: maxTokens`
- końcówka: zamiast `JSON.parse` + `isRawInvoice` + `mapInvoice` — po otrzymaniu niepustego `rawText` po prostu `return { status: "ok", rawJson: rawText };` (parsowanie/walidacja przeniesione do `analyzeDocument`). Pusty `rawText` → `{ status: "error", message: "Empty response from model" }` (bez zmian).
- Usuń z pliku przeniesione do kinds: prompt, typy Raw*, isRawInvoice, str/num/mapItem/mapInvoice. Zaktualizuj importy typów (`TransportResult`, `DocumentTransport` zamiast `AnalyzeInvoiceResult`, `DocumentAnalyzer`).

- [ ] **Step 5: Zaktualizuj call site w `convex/warehouseDeliveries.ts`**

Import (góra pliku): zamień `getDocumentAnalyzer` na `getDocumentTransport, analyzeDocument` (z `./_ai/documentAnalyzer`) i dodaj `import { invoiceKind } from "./_ai/kinds/invoice";`. W `analyzeDeliveryInvoice` (~linie 523-528):

```ts
const transport = getDocumentTransport(
  (id) => ctx.storage.get(id as unknown as Id<"_storage">),
);
const analysisResult = await analyzeDocument(transport, invoiceKind, pages);
```

Cała reszta funkcji (switch po statusach, strip `rawText`, persist) — BEZ ZMIAN; statusy i komunikaty są identyczne.

- [ ] **Step 6: Zaadaptuj `tests/convex/openaiDocumentAnalyzer.test.ts`**

Mechaniczna adaptacja, asercje wyników BEZ ZMIAN:
1. Importy: `import { analyzeDocument, getDocumentTransport } from "../../convex/_ai/documentAnalyzer";` + `import { invoiceKind } from "../../convex/_ai/kinds/invoice";` (usuń import `getDocumentAnalyzer`).
2. Dodaj helper pod sekcją Helpers: `const analyzeInvoice = (t: { run: DocumentTransport["run"] }, pages: DocumentPage[]) => analyzeDocument(t as DocumentTransport, invoiceKind, pages);` (dostosuj typ importu `DocumentTransport`).
3. Zamień każde `analyzer.analyzeInvoice(pages)` → `analyzeInvoice(analyzer, pages)` oraz każde `getDocumentAnalyzer(` → `getDocumentTransport(`.
4. Jeżeli któryś test woła prywatne symbole providera (isRawInvoice itp.) — przełącz import na `../../convex/_ai/kinds/invoice` lub przenieś asercję do `analysisKindInvoice.test.ts`.

- [ ] **Step 7: Uruchom oba pliki testów + pełny suite**

Run: `npm run test:unit -- ../tests/convex/analysisKindInvoice.test.ts ../tests/convex/openaiDocumentAnalyzer.test.ts`
Expected: PASS (wszystkie).
Run: `npm run test:unit` — Expected: PASS (bez regresji).
Run: `npx tsc -p convex/tsconfig.json --pretty false` — Expected: bez nowych błędów vs main.

- [ ] **Step 8: Commit**

```bash
git add convex/_ai tests/convex/analysisKindInvoice.test.ts tests/convex/openaiDocumentAnalyzer.test.ts convex/warehouseDeliveries.ts
git commit -m "refactor(ai): extract DocumentTransport + AnalysisKind; invoice becomes first kind (no behavior change)"
```

---

### Task 2: Kind `form_template` + rejestr

**Files:**
- Create: `convex/_ai/kinds/formTemplate.ts`
- Create: `convex/_ai/registry.ts`
- Test: `tests/convex/analysisKindFormTemplate.test.ts`

**Interfaces:**
- Consumes: `AnalysisKind` z Task 1.
- Produces:
  ```ts
  // convex/_ai/kinds/formTemplate.ts
  export type ParsedSegment =
    | { type: "text"; text: string }
    | { type: "field"; label: string;
        fieldType: "text"|"textarea"|"select"|"button_select"|"date"|"checkbox";
        options?: string[]; required?: boolean; patientFieldHint?: string | null };
  export type ParsedBlock =
    | { type: "heading"; level: 1|2|3; text: string }
    | { type: "paragraph"; segments: ParsedSegment[] }
    | { type: "bulletList" | "orderedList"; items: ParsedSegment[][] };
  export interface ParsedFormTemplate {
    title: string | null;
    blocks: ParsedBlock[];
    confidence: number | null;
  }
  export const formTemplateKind: AnalysisKind<ParsedFormTemplate>; // id: "form_template", maxTokens: 8192
  // context: { patientFields?: Array<{ key: string; label: string }> }
  //   → prompt listuje "builtin:<key> — <label>"; map odrzuca hinty spoza "builtin:<key>" zbioru
  ```
  ```ts
  // convex/_ai/registry.ts
  export function getAnalysisKind(id: string): AnalysisKind<unknown> | null; // "invoice" | "form_template"
  ```

- [ ] **Step 1: Failing test**

`tests/convex/analysisKindFormTemplate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { formTemplateKind, type ParsedFormTemplate } from "../../convex/_ai/kinds/formTemplate";
import { getAnalysisKind } from "../../convex/_ai/registry";

const CTX = { patientFields: [{ key: "pesel", label: "PESEL" }, { key: "phone", label: "Telefon" }] };

const VALID = {
  title: "Zgoda na zabieg",
  blocks: [
    { type: "heading", level: 1, text: "Zgoda na zabieg" },
    { type: "paragraph", segments: [
      { type: "text", text: "Ja, " },
      { type: "field", label: "Imię i nazwisko", fieldType: "text", required: true, patientFieldHint: null },
      { type: "text", text: ", PESEL: " },
      { type: "field", label: "PESEL", fieldType: "text", patientFieldHint: "builtin:pesel" },
    ]},
    { type: "bulletList", items: [
      [{ type: "text", text: "Zapoznałem się z przeciwwskazaniami" }],
    ]},
  ],
  confidence: 0.8,
};

describe("formTemplateKind", () => {
  test("registry resolves both kinds", () => {
    expect(getAnalysisKind("invoice")?.id).toBe("invoice");
    expect(getAnalysisKind("form_template")?.id).toBe("form_template");
    expect(getAnalysisKind("nope")).toBeNull();
  });

  test("prompt includes allowed patient targets from context", () => {
    const p = formTemplateKind.buildPrompt(CTX);
    expect(p).toContain("builtin:pesel");
    expect(p).toContain("PESEL");
    expect(formTemplateKind.maxTokens).toBe(8192);
  });

  test("validate: accepts valid, rejects malformed", () => {
    expect(formTemplateKind.validate(VALID)).toBe(true);
    expect(formTemplateKind.validate(null)).toBe(false);
    expect(formTemplateKind.validate({ blocks: "x" })).toBe(false);
    expect(formTemplateKind.validate({ blocks: [{ type: "widget" }] })).toBe(false);
    expect(formTemplateKind.validate({ blocks: [{ type: "paragraph", segments: [{ type: "field" }] }] })).toBe(false); // field bez label
  });

  test("map: keeps allowed hint, drops hint outside allowlist, coerces fieldType", () => {
    const messy = { ...VALID, blocks: [
      { type: "paragraph", segments: [
        { type: "field", label: "PESEL", fieldType: "text", patientFieldHint: "builtin:pesel" },
        { type: "field", label: "Hasło", fieldType: "text", patientFieldHint: "builtin:password" }, // spoza listy
        { type: "field", label: "Coś", fieldType: "fancy" }, // nieznany typ → "text"
      ]},
    ]};
    const out = formTemplateKind.map(messy, { rawJson: "{}", context: CTX }) as ParsedFormTemplate;
    const seg = out.blocks[0] as Extract<typeof out.blocks[0], { type: "paragraph" }>;
    const fields = seg.segments.filter((s) => s.type === "field") as Array<Extract<ParsedSegment, {type:"field"}>>;
    expect(fields[0].patientFieldHint).toBe("builtin:pesel");
    expect(fields[1].patientFieldHint).toBeNull();
    expect(fields[2].fieldType).toBe("text");
  });

  test("map without context drops all hints", () => {
    const out = formTemplateKind.map(VALID, { rawJson: "{}" }) as ParsedFormTemplate;
    const para = out.blocks[1] as Extract<typeof out.blocks[1], { type: "paragraph" }>;
    const pesel = para.segments.find((s) => s.type === "field" && s.label === "PESEL");
    expect((pesel as Extract<ParsedSegment, {type:"field"}>).patientFieldHint).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL** (`Cannot find module .../kinds/formTemplate`)

Run: `npm run test:unit -- ../tests/convex/analysisKindFormTemplate.test.ts`

- [ ] **Step 3: Implementacja `convex/_ai/kinds/formTemplate.ts`**

```ts
import type { AnalysisKind } from "../documentAnalyzer";

export type ParsedSegment = /* jak w Interfaces */;
export type ParsedBlock = /* jak w Interfaces */;
export interface ParsedFormTemplate { title: string | null; blocks: ParsedBlock[]; confidence: number | null }

const FIELD_TYPES = new Set(["text", "textarea", "select", "button_select", "date", "checkbox"]);
const BLOCK_TYPES = new Set(["heading", "paragraph", "bulletList", "orderedList"]);

function buildPrompt(context?: Record<string, unknown>): string {
  const patientFields = Array.isArray((context as { patientFields?: unknown })?.patientFields)
    ? ((context as { patientFields: Array<{ key: string; label: string }> }).patientFields)
    : [];
  const targets = patientFields.map((f) => `- "builtin:${f.key}" — ${f.label}`).join("\n");
  return `You are reconstructing a scanned paper form (typically Polish: consent forms, medical intake, GDPR) into a structured template. Return ONE JSON object:

{
  "title": string | null,
  "blocks": [
    { "type": "heading", "level": 1|2|3, "text": string }
    | { "type": "paragraph", "segments": Segment[] }
    | { "type": "bulletList" | "orderedList", "items": Segment[][] }
  ],
  "confidence": number
}

Segment = { "type": "text", "text": string }
        | { "type": "field", "label": string,
            "fieldType": "text"|"textarea"|"select"|"button_select"|"date"|"checkbox",
            "options"?: string[], "required"?: boolean, "patientFieldHint"?: string | null }

Rules:
- Reproduce ALL static text of the document verbatim (Polish stays Polish).
- Blank lines, dotted lines, underscores, empty boxes to be filled in → a "field" segment (NOT text).
- A group of mutually exclusive checkboxes/options → one "select" field with "options".
- A single yes/no checkbox → "checkbox". Larger empty areas for free writing → "textarea". Date slots (e.g. next to signature) → "date".
- "label" = the caption printed next to the blank (e.g. "Imię i nazwisko").
- patientFieldHint: ONLY when the blank clearly corresponds to one of these client-record targets, use EXACTLY one of the values below; otherwise null. Never invent other values.
${targets || "- (no targets available — always use null)"}
- Do NOT guess content that is not on the document. "confidence" is a 0-1 overall score.`;
}

function isSegment(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (s.type === "text") return typeof s.text === "string";
  if (s.type === "field") return typeof s.label === "string" && s.label.length > 0;
  return false;
}

function validate(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.blocks)) return false;
  for (const b of o.blocks as unknown[]) {
    if (!b || typeof b !== "object") return false;
    const blk = b as Record<string, unknown>;
    if (!BLOCK_TYPES.has(String(blk.type))) return false;
    if (blk.type === "heading" && typeof blk.text !== "string") return false;
    if (blk.type === "paragraph") {
      if (!Array.isArray(blk.segments) || !(blk.segments as unknown[]).every(isSegment)) return false;
    }
    if (blk.type === "bulletList" || blk.type === "orderedList") {
      if (!Array.isArray(blk.items)) return false;
      for (const item of blk.items as unknown[]) {
        if (!Array.isArray(item) || !(item as unknown[]).every(isSegment)) return false;
      }
    }
  }
  return true;
}

function mapSegment(s: Record<string, unknown>, allowed: Set<string>): ParsedSegment {
  if (s.type === "text") return { type: "text", text: String(s.text ?? "") };
  const rawHint = typeof s.patientFieldHint === "string" ? s.patientFieldHint : null;
  return {
    type: "field",
    label: String(s.label ?? ""),
    fieldType: FIELD_TYPES.has(String(s.fieldType)) ? (String(s.fieldType) as never) : "text",
    options: Array.isArray(s.options) ? (s.options as unknown[]).map(String) : undefined,
    required: s.required === true ? true : undefined,
    patientFieldHint: rawHint && allowed.has(rawHint) ? rawHint : null,
  };
}

function map(raw: unknown, opts: { rawJson: string; context?: Record<string, unknown> }): ParsedFormTemplate {
  const o = raw as Record<string, unknown>;
  const patientFields = Array.isArray((opts.context as { patientFields?: unknown })?.patientFields)
    ? ((opts.context as { patientFields: Array<{ key: string }> }).patientFields)
    : [];
  const allowed = new Set(patientFields.map((f) => `builtin:${f.key}`));
  const blocks: ParsedBlock[] = [];
  for (const b of (o.blocks as Array<Record<string, unknown>>)) {
    if (b.type === "heading") {
      const lvl = Number(b.level);
      blocks.push({ type: "heading", level: (lvl === 2 || lvl === 3 ? lvl : 1) as 1|2|3, text: String(b.text ?? "") });
    } else if (b.type === "paragraph") {
      blocks.push({ type: "paragraph", segments: (b.segments as Array<Record<string, unknown>>).map((s) => mapSegment(s, allowed)) });
    } else {
      blocks.push({
        type: b.type as "bulletList" | "orderedList",
        items: (b.items as Array<Array<Record<string, unknown>>>).map((item) => item.map((s) => mapSegment(s, allowed))),
      });
    }
  }
  const conf = Number(o.confidence);
  return {
    title: typeof o.title === "string" && o.title ? o.title : null,
    blocks,
    confidence: Number.isFinite(conf) ? conf : null,
  };
}

export const formTemplateKind: AnalysisKind<ParsedFormTemplate> = {
  id: "form_template",
  maxTokens: 8192,
  buildPrompt,
  validate,
  map,
};
```

- [ ] **Step 4: Implementacja `convex/_ai/registry.ts`**

```ts
import type { AnalysisKind } from "./documentAnalyzer";
import { invoiceKind } from "./kinds/invoice";
import { formTemplateKind } from "./kinds/formTemplate";

const KINDS: Record<string, AnalysisKind<unknown>> = {
  [invoiceKind.id]: invoiceKind as AnalysisKind<unknown>,
  [formTemplateKind.id]: formTemplateKind as AnalysisKind<unknown>,
};

export function getAnalysisKind(id: string): AnalysisKind<unknown> | null {
  return KINDS[id] ?? null;
}
```

- [ ] **Step 5: Run — PASS + typecheck**

Run: `npm run test:unit -- ../tests/convex/analysisKindFormTemplate.test.ts` — Expected: PASS.
Run: `npx tsc -p convex/tsconfig.json --pretty false` — bez nowych błędów.

- [ ] **Step 6: Commit**

```bash
git add convex/_ai/kinds/formTemplate.ts convex/_ai/registry.ts tests/convex/analysisKindFormTemplate.test.ts
git commit -m "feat(ai): form_template analysis kind + kind registry"
```

---

### Task 3: Warstwa danych — tabela `document_analysis_jobs`

**Files:**
- Modify: `convex/schema/documents.ts` (po `formDocuments`, ~linia 163)
- Modify: `convex/_helpers/supabaseDb.ts` (TABLE_MAP, obok `formTemplates`/`formDocuments`, linie 47-48)
- Modify: `convex/_helpers/supabaseRows.ts` (obok `FormTemplateRow`, linia 10)
- Create: `supabase/migrations/00063_document_analysis_jobs.sql` (SPRAWDŹ najwyższy numer na main; przenumeruj w razie kolizji)
- Modify (generowane): `src/lib/supabase/database.types.ts`, `src/lib/supabase/database.columns.ts`

**Interfaces:**
- Produces: tabela Convex `documentAnalysisJobs` (indeksy `by_org`, `by_orgAndKind`), typ `DocumentAnalysisJobRow`, mapowanie `documentAnalysisJobs → document_analysis_jobs`.

- [ ] **Step 1: Convex schema — dodaj tabelę**

W `convex/schema/documents.ts`, po zamknięciu `formDocuments` (linia ~163), wewnątrz tego samego obiektu tabel:

```ts
  // Generic AI document-analysis jobs (spec 2026-07-16). One row per analysis
  // request for kinds that have no natural host row (e.g. a template that does
  // not exist yet). Deliveries keep their own inline analysis fields.
  documentAnalysisJobs: defineTable({
    organizationId: v.id("organizations"),
    kind: v.string(), // registry id: "form_template" | ...
    pages: v.array(v.object({
      storageId: v.string(),
      mimeType: v.string(),
      position: v.number(),
    })),
    context: v.optional(v.union(v.string(), v.null())), // JSON string, kind-specific
    status: v.union(v.literal("pending"), v.literal("running"), v.literal("ok"), v.literal("error")),
    resultJson: v.optional(v.union(v.string(), v.null())),
    errorMessage: v.optional(v.union(v.string(), v.null())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndKind", ["organizationId", "kind"]),
```

- [ ] **Step 2: Row type + TABLE_MAP**

`convex/_helpers/supabaseRows.ts` (po linii 10): `export type DocumentAnalysisJobRow = SupabaseRow<"documentAnalysisJobs">;`
`convex/_helpers/supabaseDb.ts` TABLE_MAP (po `formDocuments`): `documentAnalysisJobs: "document_analysis_jobs",`

- [ ] **Step 3: Migracja SQL**

`supabase/migrations/00063_document_analysis_jobs.sql` (wzorzec RLS jak `00028_gabinet_payment_methods.sql`):

```sql
-- Generic AI document-analysis jobs (spec 2026-07-16). Stores request pages,
-- status and result for analysis kinds without a natural host row.
-- Timestamps are BIGINT ms-epoch, PK is TEXT (project convention).

CREATE TABLE IF NOT EXISTS document_analysis_jobs (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  pages           JSONB NOT NULL,
  context         TEXT,
  status          TEXT NOT NULL CHECK (status IN ('pending','running','ok','error')),
  result_json     TEXT,
  error_message   TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  completed_at    BIGINT
);

CREATE INDEX IF NOT EXISTS document_analysis_jobs_org_idx
  ON document_analysis_jobs (organization_id);
CREATE INDEX IF NOT EXISTS document_analysis_jobs_org_kind_idx
  ON document_analysis_jobs (organization_id, kind);

ALTER TABLE document_analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_analysis_jobs_select ON document_analysis_jobs
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY document_analysis_jobs_insert ON document_analysis_jobs
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_analysis_jobs_update ON document_analysis_jobs
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_analysis_jobs_delete ON document_analysis_jobs
  FOR DELETE USING (current_org_id() = organization_id);
```

- [ ] **Step 4: Regeneracja typów + weryfikacja**

Run: `node scripts/gen-db-types.mjs` — Expected: `Migrations: 63` (lub wyższa po przenumerowaniu), tabela w obu plikach.
Run: `npx tsc -p convex/tsconfig.json --pretty false && npx tsc -p tsconfig.app.json --pretty false` — bez nowych błędów.
Run: `npm run test:unit` — Expected: PASS (stub in-memory czyta TABLE_MAP — nowa tabela dostępna w testach automatycznie).

- [ ] **Step 5: Commit**

```bash
git add convex/schema/documents.ts convex/_helpers/supabaseRows.ts convex/_helpers/supabaseDb.ts supabase/migrations/00063_document_analysis_jobs.sql src/lib/supabase/database.types.ts src/lib/supabase/database.columns.ts
git commit -m "feat(ai): document_analysis_jobs data layer (schema, TABLE_MAP, migration)"
```

---

### Task 4: Akcje `createJob` / `runJob` / `getJob`

**Files:**
- Create: `convex/documentAnalysisJobs.ts`
- Test: `tests/convex/documentAnalysisJobs.test.ts`

**Interfaces:**
- Consumes: `getAnalysisKind` (Task 2), `getDocumentTransport`/`analyzeDocument` (Task 1), tabela (Task 3), wzorzec auth z `convex/documents/templates.ts:create`.
- Produces (dla frontendu, Task 6-7):
  ```ts
  api.documentAnalysisJobs.createJob({ organizationId, kind, pages, context? }) → string (jobId)
  api.documentAnalysisJobs.runJob({ organizationId, jobId }) →
    { status: "ok"; resultJson: string } | { status: "error"; errorMessage: string }
  api.documentAnalysisJobs.getJob({ organizationId, jobId }) →
    { _id, kind, status, resultJson, errorMessage, createdAt, completedAt } | null
  ```

- [ ] **Step 1: Failing testy integracyjne**

`tests/convex/documentAnalysisJobs.test.ts` (harness jak `tests/convex/productsCreate.test.ts`; w testach NIE ma `OPENAI_API_KEY`, więc `runJob` deterministycznie kończy się błędem konfiguracji — to jest testowana ścieżka):

```ts
import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

const PAGES = [{ storageId: "st-1", mimeType: "application/pdf", position: 1 }];

describe("documentAnalysisJobs", () => {
  test("createJob persists a pending job scoped to the org", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const jobId = await t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
      organizationId, kind: "form_template", pages: PAGES,
      context: JSON.stringify({ patientFields: [{ key: "pesel", label: "PESEL" }] }),
    });
    const row = (await createSupabaseDb().get("documentAnalysisJobs", String(jobId))) as Record<string, unknown>;
    expect(row?.status).toBe("pending");
    expect(row?.kind).toBe("form_template");
    expect(row?.organizationId).toBe(String(organizationId));
    expect(row?.createdBy).toBe(String(userId));
  });

  test("createJob rejects unknown kind", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    await expect(
      t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
        organizationId, kind: "nope", pages: PAGES,
      }),
    ).rejects.toThrow(/unknown analysis kind/i);
  });

  test("runJob without provider records error status on the job (retryable)", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const jobId = await t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
      organizationId, kind: "form_template", pages: PAGES,
    });
    const res = await t.withIdentity(identity).action(api.documentAnalysisJobs.runJob, {
      organizationId, jobId: String(jobId),
    });
    expect(res.status).toBe("error");
    const row = (await createSupabaseDb().get("documentAnalysisJobs", String(jobId))) as Record<string, unknown>;
    expect(row?.status).toBe("error");
    expect(String(row?.errorMessage)).toMatch(/not configured/i);
    expect(typeof row?.completedAt).toBe("number");
    // retry = to samo wywołanie, bez wyjątku
    const res2 = await t.withIdentity(identity).action(api.documentAnalysisJobs.runJob, {
      organizationId, jobId: String(jobId),
    });
    expect(res2.status).toBe("error");
  });

  test("getJob returns the row and hides other orgs' jobs", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);
    const jobId = await t.withIdentity(identity).action(api.documentAnalysisJobs.createJob, {
      organizationId, kind: "form_template", pages: PAGES,
    });
    const job = await t.withIdentity(identity).action(api.documentAnalysisJobs.getJob, {
      organizationId, jobId: String(jobId),
    });
    expect(job?.kind).toBe("form_template");

    const other = await seedTestUser(t); // druga organizacja
    await expect(
      t.withIdentity(other.identity).action(api.documentAnalysisJobs.getJob, {
        organizationId: other.organizationId, jobId: String(jobId),
      }),
    ).resolves.toBeNull();
  });
});
```

(Jeśli `seedTestUser` w tym repo nie tworzy za każdym razem nowej organizacji — sprawdź `convex/_test_helpers.ts` i użyj istniejącego helpera do drugiej organizacji; asercja izolacji musi zostać.)

- [ ] **Step 2: Run — FAIL** (`documentAnalysisJobs` nie istnieje w api)

Run: `npm run test:unit -- ../tests/convex/documentAnalysisJobs.test.ts`

- [ ] **Step 3: Implementacja `convex/documentAnalysisJobs.ts`**

```ts
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { getAnalysisKind } from "./_ai/registry";
import { analyzeDocument, getDocumentTransport, type DocumentPage } from "./_ai/documentAnalyzer";

const pagesValidator = v.array(v.object({
  storageId: v.string(),
  mimeType: v.string(),
  position: v.number(),
}));

// Auth: identyczny wzorzec jak convex/documents/templates.ts:create —
// verifyOrgAccess zwraca użytkownika; jobs nie mają dodatkowego checkPermission
// (tworzenie szablonu ze skanu = tworzenie szablonu).
async function requireUser(ctx: { runQuery: Function }, organizationId: string) {
  const auth = (await (ctx as any).runQuery(internal._helpers.authAction.verifyOrgAccess, {
    organizationId,
  })) as { user: { _id: string } };
  return auth.user;
}
// UWAGA implementacyjna: dopasuj kształt zwrotki do faktycznego użycia w
// templates.ts:create (createdBy) — skopiuj stamtąd 1:1, łącznie z typami,
// zamiast polegać na powyższym szkicu.

export const createJob = action({
  args: {
    organizationId: v.id("organizations"),
    kind: v.string(),
    pages: pagesValidator,
    context: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const user = await requireUser(ctx, String(args.organizationId));
    if (!getAnalysisKind(args.kind)) throw new Error(`Unknown analysis kind: ${args.kind}`);
    if (args.pages.length === 0) throw new Error("No pages to analyze");
    const db = createSupabaseDb();
    const now = Date.now();
    const jobId = await db.insert("documentAnalysisJobs", {
      organizationId: String(args.organizationId),
      kind: args.kind,
      pages: args.pages,
      context: args.context ?? null,
      status: "pending",
      resultJson: null,
      errorMessage: null,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });
    return String(jobId);
  },
});

export const runJob = action({
  args: { organizationId: v.id("organizations"), jobId: v.string() },
  handler: async (ctx, args): Promise<
    { status: "ok"; resultJson: string } | { status: "error"; errorMessage: string }
  > => {
    await requireUser(ctx, String(args.organizationId));
    const db = createSupabaseDb();
    const job = await db.get("documentAnalysisJobs", args.jobId);
    if (!job || String(job.organizationId) !== String(args.organizationId)) {
      throw new Error("Analysis job not found");
    }
    const kind = getAnalysisKind(String(job.kind));
    if (!kind) throw new Error(`Unknown analysis kind: ${job.kind}`);

    await db.patch("documentAnalysisJobs", args.jobId, { status: "running", updatedAt: Date.now() });

    const pages = (job.pages as DocumentPage[]).slice().sort((a, b) => a.position - b.position);
    let context: Record<string, unknown> | undefined;
    if (typeof job.context === "string" && job.context) {
      try { context = JSON.parse(job.context) as Record<string, unknown>; } catch { context = undefined; }
    }

    const transport = getDocumentTransport((id) => ctx.storage.get(id as unknown as Id<"_storage">));
    const res = await analyzeDocument(transport, kind, pages, context);
    const now = Date.now();

    if (res.status === "ok") {
      const resultJson = JSON.stringify(res.data);
      await db.patch("documentAnalysisJobs", args.jobId, {
        status: "ok", resultJson, errorMessage: null, completedAt: now, updatedAt: now,
      });
      return { status: "ok", resultJson };
    }

    let errorMessage: string;
    switch (res.status) {
      case "not_implemented": errorMessage = "AI analysis provider is not configured"; break;
      case "no_pages": errorMessage = "No pages to analyze"; break;
      case "unsupported_format": errorMessage = `Unsupported file format: ${res.mimeType}`; break;
      default: errorMessage = res.message;
    }
    await db.patch("documentAnalysisJobs", args.jobId, {
      status: "error", errorMessage, completedAt: now, updatedAt: now,
    });
    return { status: "error", errorMessage };
  },
});

export const getJob = action({
  args: { organizationId: v.id("organizations"), jobId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, String(args.organizationId));
    const db = createSupabaseDb();
    const job = await db.get("documentAnalysisJobs", args.jobId);
    if (!job || String(job.organizationId) !== String(args.organizationId)) return null;
    return {
      _id: String(job._id),
      kind: String(job.kind),
      status: String(job.status),
      resultJson: (job.resultJson as string | null) ?? null,
      errorMessage: (job.errorMessage as string | null) ?? null,
      createdAt: Number(job.createdAt),
      completedAt: (job.completedAt as number | null) ?? null,
    };
  },
});
```

- [ ] **Step 4: Run — PASS + typecheck + pełny suite**

Run: `npm run test:unit -- ../tests/convex/documentAnalysisJobs.test.ts` — PASS.
Run: `npx tsc -p convex/tsconfig.json --pretty false` — bez nowych błędów.
Run: `npm run test:unit` — PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/documentAnalysisJobs.ts tests/convex/documentAnalysisJobs.test.ts
git commit -m "feat(ai): generic document analysis job actions (create/run/get)"
```

---

### Task 5: Mapper `parsedTemplateToTipTap`

**Files:**
- Create: `src/lib/documents/analysis-to-template.ts`
- Test: `tests/convex/analysisToTemplate.test.ts`

**Interfaces:**
- Consumes: `ParsedFormTemplate`/`ParsedBlock`/`ParsedSegment` (kształt z Task 2 — zduplikowany lokalnie jako typ wejścia, żeby frontend nie importował z `convex/_ai`; patrz komentarz w kodzie), `slugifyFieldKey` z `./patient-mappable-fields` (istnieje).
- Produces: `parsedTemplateToTipTap(parsed: ParsedFormTemplateInput): string` — string `content_json` TipTap gotowy do `setContentJson` w edytorze.

- [ ] **Step 1: Failing test**

`tests/convex/analysisToTemplate.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { parsedTemplateToTipTap } from "../../src/lib/documents/analysis-to-template";

const PARSED = {
  title: "Zgoda",
  confidence: 0.9,
  blocks: [
    { type: "heading" as const, level: 1 as const, text: "Zgoda na zabieg" },
    { type: "paragraph" as const, segments: [
      { type: "text" as const, text: "PESEL: " },
      { type: "field" as const, label: "PESEL", fieldType: "text" as const, required: true, patientFieldHint: "builtin:pesel" },
      { type: "field" as const, label: "PESEL", fieldType: "text" as const }, // duplikat labela → inny fieldId
    ]},
    { type: "bulletList" as const, items: [
      [{ type: "text" as const, text: "Punkt pierwszy" }],
    ]},
    { type: "paragraph" as const, segments: [
      { type: "field" as const, label: "Zgody marketingowe", fieldType: "select" as const, options: ["Tak", "Nie"] },
    ]},
  ],
};

describe("parsedTemplateToTipTap", () => {
  const doc = JSON.parse(parsedTemplateToTipTap(PARSED));

  test("builds a TipTap doc with heading, paragraphs and list", () => {
    expect(doc.type).toBe("doc");
    expect(doc.content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(doc.content[0].content[0].text).toBe("Zgoda na zabieg");
    expect(doc.content[2].type).toBe("bulletList");
    expect(doc.content[2].content[0].type).toBe("listItem");
  });

  test("field segments become formField nodes with client filledBy and mapping", () => {
    const para = doc.content[1];
    const fields = para.content.filter((n: { type: string }) => n.type === "formField");
    expect(fields).toHaveLength(2);
    expect(fields[0].attrs).toMatchObject({
      label: "PESEL", fieldType: "text", required: true,
      filledBy: "client", patientField: "builtin:pesel",
    });
    expect(fields[0].attrs.fieldId).toBeTruthy();
    expect(fields[1].attrs.fieldId).not.toBe(fields[0].attrs.fieldId); // kolizja labela rozwiązana
    expect(fields[1].attrs.patientField).toBe("");
  });

  test("select options serialize comma-separated (editor convention)", () => {
    const sel = doc.content[3].content.find((n: { type: string }) => n.type === "formField");
    expect(sel.attrs.options).toBe("Tak, Nie");
    expect(sel.attrs.fieldType).toBe("select");
  });

  test("empty blocks produce an empty doc, not a crash", () => {
    const empty = JSON.parse(parsedTemplateToTipTap({ title: null, confidence: null, blocks: [] }));
    expect(empty).toEqual({ type: "doc", content: [] });
  });
});
```

- [ ] **Step 2: Run — FAIL** (`Cannot find module .../analysis-to-template`)

Run: `npm run test:unit -- ../tests/convex/analysisToTemplate.test.ts`

- [ ] **Step 3: Implementacja `src/lib/documents/analysis-to-template.ts`**

```ts
/**
 * Maps a ParsedFormTemplate (AI analysis result, kind "form_template") to a
 * TipTap content_json string using the existing formField inline nodes.
 *
 * Input types are declared locally (structurally identical to
 * convex/_ai/kinds/formTemplate.ts) so the frontend bundle does not import
 * backend modules; the shape is validated server-side by the kind anyway.
 */
import { slugifyFieldKey } from "./patient-mappable-fields";

export interface ParsedTemplateFieldSegment {
  type: "field";
  label: string;
  fieldType: "text" | "textarea" | "select" | "button_select" | "date" | "checkbox";
  options?: string[];
  required?: boolean;
  patientFieldHint?: string | null;
}
export type ParsedTemplateSegment = { type: "text"; text: string } | ParsedTemplateFieldSegment;
export type ParsedTemplateBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; segments: ParsedTemplateSegment[] }
  | { type: "bulletList" | "orderedList"; items: ParsedTemplateSegment[][] };
export interface ParsedFormTemplateInput {
  title: string | null;
  blocks: ParsedTemplateBlock[];
  confidence: number | null;
}

type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[]; text?: string };

function segmentsToInline(segments: ParsedTemplateSegment[], usedIds: Set<string>): TipTapNode[] {
  const out: TipTapNode[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      if (seg.text) out.push({ type: "text", text: seg.text });
      continue;
    }
    let fieldId = slugifyFieldKey(seg.label) || "pole";
    let n = 2;
    while (usedIds.has(fieldId)) fieldId = `${slugifyFieldKey(seg.label) || "pole"}_${n++}`;
    usedIds.add(fieldId);
    out.push({
      type: "formField",
      attrs: {
        fieldId,
        fieldType: seg.fieldType,
        label: seg.label,
        options: (seg.options ?? []).join(", "),
        required: seg.required === true,
        placeholder: "",
        filledBy: "client",
        patientField: seg.patientFieldHint ?? "",
      },
    });
  }
  return out;
}

export function parsedTemplateToTipTap(parsed: ParsedFormTemplateInput): string {
  const usedIds = new Set<string>();
  const content: TipTapNode[] = [];
  for (const block of parsed.blocks) {
    if (block.type === "heading") {
      content.push({
        type: "heading",
        attrs: { level: block.level },
        content: block.text ? [{ type: "text", text: block.text }] : [],
      });
    } else if (block.type === "paragraph") {
      content.push({ type: "paragraph", content: segmentsToInline(block.segments, usedIds) });
    } else {
      content.push({
        type: block.type,
        content: block.items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: segmentsToInline(item, usedIds) }],
        })),
      });
    }
  }
  return JSON.stringify({ type: "doc", content });
}
```

- [ ] **Step 4: Run — PASS**

Run: `npm run test:unit -- ../tests/convex/analysisToTemplate.test.ts` — PASS.
Run: `npx tsc -p tsconfig.app.json --pretty false` — bez nowych błędów.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/analysis-to-template.ts tests/convex/analysisToTemplate.test.ts
git commit -m "feat(documents): ParsedFormTemplate -> TipTap content mapper"
```

---

### Task 6: UI — dialog „Nowy ze skanu" na liście szablonów

**Files:**
- Create: `src/components/documents/template-scan-dialog.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx` (przycisk obok istniejących akcji nagłówka, okolice linii 855)
- Modify: `public/locales/pl/translation.json`, `public/locales/en/translation.json` (blok `settings.formTemplates.*`)

**Interfaces:**
- Consumes: `api.app.generateUploadUrl` (istniejący wzorzec uploadu z `deliveries.tsx:1720-1761`), `api.documentAnalysisJobs.createJob/runJob` (Task 4), `PATIENT_BUILTIN_FIELDS` (istnieje).
- Produces: `<TemplateScanDialog open onOpenChange />` — po sukcesie nawiguje na `/dashboard/settings/form-templates/new?analysisJobId=<id>`.

- [ ] **Step 1: Komponent dialogu**

`src/components/documents/template-scan-dialog.tsx` — pełny komponent:

```tsx
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PATIENT_BUILTIN_FIELDS } from "@/lib/documents/patient-mappable-fields";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

interface PendingFile { file: File; storageId: string | null; uploading: boolean; error: boolean }

export function TemplateScanDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  const createJob = useAction(api.documentAnalysisJobs.createJob);
  const runJob = useAction(api.documentAnalysisJobs.runJob);

  const [files, setFiles] = useState<PendingFile[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => ACCEPTED.includes(f.type));
    if (accepted.length !== (list?.length ?? 0)) {
      toast.error(t("settings.formTemplates.scanUnsupportedType", "Obsługiwane formaty: PDF, JPG, PNG"));
    }
    for (const file of accepted) {
      setFiles((prev) => [...prev, { file, storageId: null, uploading: true, error: false }]);
      try {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = (await res.json()) as { storageId: string };
        setFiles((prev) => prev.map((p) => (p.file === file ? { ...p, storageId, uploading: false } : p)));
      } catch {
        setFiles((prev) => prev.map((p) => (p.file === file ? { ...p, uploading: false, error: true } : p)));
      }
    }
  }, [generateUploadUrl, t]);

  const ready = files.filter((f) => f.storageId && !f.error);

  const handleAnalyze = async () => {
    if (ready.length === 0) return;
    setAnalyzing(true);
    try {
      const pages = ready.map((f, i) => ({ storageId: f.storageId!, mimeType: f.file.type, position: i + 1 }));
      const jobId = await createJob({
        organizationId,
        kind: "form_template",
        pages,
        context: JSON.stringify({ patientFields: PATIENT_BUILTIN_FIELDS.map((f) => ({ key: f.key, label: f.label })) }),
      });
      const res = await runJob({ organizationId, jobId });
      if (res.status === "error") {
        toast.error(t("settings.formTemplates.scanFailed", "Analiza nie powiodła się: {{error}}", { error: res.errorMessage }));
        return; // dialog zostaje otwarty — ponowienie = ponowny klik "Analizuj" (tworzy nowy job; runJob jest idempotentny, test w Task 4)
      }
      onOpenChange(false);
      void navigate({
        to: "/dashboard/settings/form-templates/new",
        search: { analysisJobId: jobId },
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!analyzing) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.formTemplates.scanTitle", "Nowy szablon ze skanu")}</DialogTitle>
          <DialogDescription>
            {t("settings.formTemplates.scanDescription", "Wgraj skan lub PDF istniejącego formularza. AI odtworzy treść i wykryje pola do wypełnienia — wynik zweryfikujesz w edytorze.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input type="file" multiple accept={ACCEPTED.join(",")} onChange={(e) => void addFiles(e.target.files)} />
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate">{f.file.name}</span>
              <span className="text-muted-foreground">
                {f.uploading
                  ? t("settings.formTemplates.scanUploading", "Wgrywanie…")
                  : f.error
                    ? t("settings.formTemplates.scanUploadError", "Błąd")
                    : "✓"}
              </span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={analyzing}>
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button onClick={() => void handleAnalyze()} disabled={analyzing || ready.length === 0}>
            {analyzing
              ? t("settings.formTemplates.scanAnalyzing", "Analizuję…")
              : t("settings.formTemplates.scanAnalyze", "Analizuj ({{count}})", { count: ready.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Przycisk na stronie listy**

W `_layout.settings.form-templates.index.tsx`: import `TemplateScanDialog` + ikona (np. `ScanText` lub inna dostępna w `@/lib/ez-icons` — sprawdź eksporty i wybierz istniejącą, np. `FileText`), stan `const [scanOpen, setScanOpen] = useState(false)`, obok istniejącego przycisku „Nowy szablon"/edytora (okolice linii 855):

```tsx
<Button size="sm" variant="outline" onClick={() => setScanOpen(true)}>
  {t("settings.formTemplates.scanNew", "Nowy ze skanu")}
</Button>
<TemplateScanDialog open={scanOpen} onOpenChange={setScanOpen} />
```

- [ ] **Step 3: i18n — dodaj klucze w OBU plikach locale**

Do bloku `settings.formTemplates` (PL / EN):

| klucz | PL | EN |
|---|---|---|
| `scanNew` | Nowy ze skanu | New from scan |
| `scanTitle` | Nowy szablon ze skanu | New template from scan |
| `scanDescription` | Wgraj skan lub PDF istniejącego formularza. AI odtworzy treść i wykryje pola do wypełnienia — wynik zweryfikujesz w edytorze. | Upload a scan or PDF of an existing form. AI reconstructs the content and detects fillable fields — you verify the result in the editor. |
| `scanUploading` | Wgrywanie… | Uploading… |
| `scanUploadError` | Błąd | Error |
| `scanUnsupportedType` | Obsługiwane formaty: PDF, JPG, PNG | Supported formats: PDF, JPG, PNG |
| `scanAnalyze` | Analizuj ({{count}}) | Analyze ({{count}}) |
| `scanAnalyzing` | Analizuję… | Analyzing… |
| `scanFailed` | Analiza nie powiodła się: {{error}} | Analysis failed: {{error}} |
| `scanBanner` | Szablon wygenerowany ze skanu — zweryfikuj wykryte pola przed zapisem. Pewność analizy: {{confidence}}% | Template generated from a scan — verify detected fields before saving. Analysis confidence: {{confidence}}% |
| `scanLoadFailed` | Nie udało się wczytać wyniku analizy | Failed to load the analysis result |

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc -p tsconfig.app.json --pretty false` — bez nowych błędów.
Run: `node -e "JSON.parse(require('fs').readFileSync('public/locales/pl/translation.json')); JSON.parse(require('fs').readFileSync('public/locales/en/translation.json')); console.log('locales OK')"`

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/template-scan-dialog.tsx src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx public/locales/pl/translation.json public/locales/en/translation.json
git commit -m "feat(documents): 'New from scan' dialog on template list (upload -> analysis job)"
```

---

### Task 7: `new.tsx` — start edytora z wyniku analizy

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.new.tsx`

**Interfaces:**
- Consumes: `api.documentAnalysisJobs.getJob` (Task 4), `parsedTemplateToTipTap` (Task 5), i18n `scanBanner`/`scanLoadFailed` (Task 6).

- [ ] **Step 1: validateSearch + ładowanie joba**

W definicji Route (linia ~26-30) dodaj `validateSearch` (wzorzec jak `_layout.products.index.tsx:78`):

```ts
export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/form-templates/new",
)({
  validateSearch: (search: Record<string, unknown>): { analysisJobId?: string } => ({
    analysisJobId: typeof search.analysisJobId === "string" ? search.analysisJobId : undefined,
  }),
  component: NewFormTemplatePage,
});
```

W komponencie (obok istniejących stanów, ~linia 110): 

```ts
const { analysisJobId } = Route.useSearch();
const getJob = useAction(api.documentAnalysisJobs.getJob);
const [scanConfidence, setScanConfidence] = useState<number | null>(null);
const [scanLoaded, setScanLoaded] = useState(false);

useEffect(() => {
  if (!analysisJobId || scanLoaded) return;
  setScanLoaded(true);
  void (async () => {
    try {
      const job = await getJob({ organizationId, jobId: analysisJobId });
      if (!job || job.status !== "ok" || !job.resultJson) {
        toast.error(t("settings.formTemplates.scanLoadFailed", "Nie udało się wczytać wyniku analizy"));
        return;
      }
      const parsed = JSON.parse(job.resultJson) as ParsedFormTemplateInput;
      setContentJson(parsedTemplateToTipTap(parsed));
      if (parsed.title) setName(parsed.title);
      setScanConfidence(parsed.confidence);
    } catch {
      toast.error(t("settings.formTemplates.scanLoadFailed", "Nie udało się wczytać wyniku analizy"));
    }
  })();
}, [analysisJobId, scanLoaded, getJob, organizationId, t]);
```

Importy do dodania: `useEffect` (rozszerzyć istniejący import z react), `parsedTemplateToTipTap, type ParsedFormTemplateInput` z `@/lib/documents/analysis-to-template`.

- [ ] **Step 2: Baner nad edytorem**

Bezpośrednio nad `<DocumentTemplateEditor ...>` (linia ~392):

```tsx
{analysisJobId && scanConfidence !== null && (
  <div className="mb-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
    {t("settings.formTemplates.scanBanner",
      "Szablon wygenerowany ze skanu — zweryfikuj wykryte pola przed zapisem. Pewność analizy: {{confidence}}%",
      { confidence: Math.round(scanConfidence * 100) })}
  </div>
)}
```

- [ ] **Step 3: Weryfikacja**

Run: `npx tsc -p tsconfig.app.json --pretty false` — bez nowych błędów.
Ręcznie (dev server, wymaga `OPENAI_API_KEY` w env Convex dev): przejdź pełny flow — Ustawienia → Szablony → „Nowy ze skanu" → wgraj PDF przykładowej zgody → Analizuj → edytor z treścią i polami → ustaw brakujące mapowania → Zapisz → szablon widoczny na liście; wejście na `/new?analysisJobId=...` po odświeżeniu odtwarza treść. Bez klucza API: oczekiwany czytelny toast „Analiza nie powiodła się: AI analysis provider is not configured".

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.settings.form-templates.new.tsx
git commit -m "feat(documents): open template editor prefilled from scan analysis job"
```

---

### Task 8: Weryfikacja końcowa + PR

**Files:** brak nowych.

- [ ] **Step 1: Pełna weryfikacja**

Run (wszystkie muszą przejść):
```bash
npm run test:unit
npx tsc -p convex/tsconfig.json --pretty false   # porównaj z main — zero NOWYCH błędów
npx tsc -p tsconfig.app.json --pretty false      # jw.
```

- [ ] **Step 2: Sprawdź numer migracji vs aktualny main**

```bash
git fetch origin && git ls-tree -r --name-only origin/main supabase/migrations/ | sort | tail -3
```
Jeśli main ma już `00063_*` — przenumeruj plik + `node scripts/gen-db-types.mjs` + commit poprawki.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/ocr-template-generation
gh pr create --base main --head feat/ocr-template-generation \
  --title "feat(ai): generic AnalysisKind pipeline + template generation from scans" \
  --body "Implements docs/superpowers/specs/2026-07-16-ocr-template-generation-design.md.

- Provider OCR refactored to pure transport; analysis kinds are plugins (invoice = first kind, no behavior change — existing analyzer tests adapted, same assertions).
- New kind form_template: scan/PDF -> structured template with detected fillable fields + patient-record mapping hints (allowlist-restricted).
- Generic document_analysis_jobs table (migration via CI auto-apply) + create/run/get actions.
- 'New from scan' dialog on template list; editor opens prefilled for verification; save path unchanged (variableBindings derived automatically).

Adding a future analysis kind = one file in convex/_ai/kinds/ + registry entry (spec success criterion #3)."
```

- [ ] **Step 4: Checklist manualny (wpisz wyniki do PR)**

1. Przepływ faktur w dostawach działa bez zmian (analiza faktury na quera-dev).
2. Skan zgody → szablon → zapis → szablon działa w wypełnianiu/podpisie.
3. Po podpisie dokument z polem zmapowanym `builtin:*` uzupełnia pustą kartotekę (feature z 2026-07-09 działa na szablonie ze skanu).
