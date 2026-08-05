import { extractJson } from "../triage/evaluate.mjs";

const PACKAGES = ["PK1", "PK2", "PK3", "PK4", "PK5", "PK6", "PK7", "PK8", "PK9"];
const KINDS = ["completed", "regression", "structural", "none"];

export function buildDeltaPrompt(issue, deltaDigest) {
  return `Cel projektu: doprowadzić produkt do URUCHOMIENIA produkcyjnego. Poniżej plan startu (pakiety PK1–PK9) — to jest ZAKRES startu. Oceń, jak PONIŻSZE zgłoszenie wpływa na GOTOWOŚĆ do startu. Zwróć JEDEN obiekt JSON:

{
  "kind": "completed" | "regression" | "structural" | "none",
  // completed = zgłoszenie potwierdza, że KONKRETNE zadanie z planu jest już zrobione
  // regression = w zakresie startu znaleziono błąd/bloker, który COFA gotowość i trzeba go zrobić przed startem (podstawa do P0)
  // structural = plan wymaga zmiany struktury/kierunku (nowy pakiet, unieważniony warunek zamknięcia) — decyzja człowieka
  // none = brak wpływu na plan startu, w tym cokolwiek POZA zakresem startu (np. magazyn) — to zostaje w backlogu
  "recordId": "rec..."|null,   // tylko dla completed: id rekordu planu z tagów [recXXX] poniżej; inaczej null
  "package": "PK1".."PK9"|null,
  "note": string,              // 1 zdanie po polsku: co się zmienia w gotowości/planie
  "confidence": number,        // 0..1
  "rationale": string
}

Zasady kierunku (WAŻNE): NIGDY nie proponuj usunięcia zadania ani obniżenia priorytetu rzeczy krytycznych dla startu — możesz tylko oznaczyć jako zrobione, odnotować nowy bloker (regression) albo zaproponować zmianę strukturalną (structural). Jeśli zgłoszenie dotyczy obszaru POZA zakresem startu (nie mieści się w żadnym PK), ustaw kind="none". Przy niepewności obniż confidence. Zwróć wyłącznie JSON.

## Plan startu (zadania z identyfikatorami rekordów)
${deltaDigest}

## Zgłoszenie #${issue.number}
Tytuł: ${issue.title}
Treść:
${issue.body || "(brak treści)"}`;
}

export function parsePlanDelta(raw) {
  const empty = { kind: "none", recordId: null, package: null, note: "", confidence: 0, rationale: "" };
  let o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch { return { ...empty }; }
  }
  if (!o || typeof o !== "object") return { ...empty };
  const kind = KINDS.includes(o.kind) ? o.kind : "none";
  const recordId = typeof o.recordId === "string" && o.recordId.startsWith("rec") ? o.recordId : null;
  const pkg = PACKAGES.includes(o.package) ? o.package : null;
  let confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    kind,
    recordId,
    package: pkg,
    note: typeof o.note === "string" ? o.note.slice(0, 500) : "",
    confidence,
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 500) : "",
  };
}

export async function assessPlanDelta(issue, deltaDigest, { invokeLLM }) {
  const raw = await invokeLLM(buildDeltaPrompt(issue, deltaDigest));
  const json = extractJson(String(raw));
  if (!json) return { kind: "none", recordId: null, package: null, note: "", confidence: 0, rationale: "" };
  return parsePlanDelta(json);
}
