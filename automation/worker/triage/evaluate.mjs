import { parseVerdict } from "./verdict.mjs";

export function buildTriagePrompt(issue, planDigest) {
  const jam = issue.jamLink ? `\nNagranie Jam: ${issue.jamLink} (przeanalizuj konsolę/network/repro, jeśli dostępne).` : "";
  return `Jesteś triagerem zgłoszeń dla projektu w fazie przeduruchomieniowej. Oceń, czy PONIŻSZE zgłoszenie mieści się w planie uruchomienia (pakiety PK1–PK9). Zwróć JEDEN obiekt JSON o dokładnie takim kształcie:

{
  "fits": boolean,            // true = realizuje któryś warunek/zadanie pakietu; false = poza planem (backlog)
  "package": "PK1".."PK9"|null,
  "priority": "P0"|"P1"|"P2"|null,   // dziedzicz z dopasowanego pakietu
  "order": number|null,              // Kolejność zadania z planu, jeśli pasuje do konkretnego
  "module": string|null,
  "confidence": number,      // 0..1, jak pewne jest dopasowanie
  "rationale": string        // 1–2 zdania po polsku, dlaczego pasuje / nie pasuje
}

Zasady: jeśli zgłoszenie nie realizuje żadnego pakietu, ustaw fits=false i package/priority/order=null. Priorytet dziedzicz WYŁĄCZNIE z dopasowanego pakietu — ignoruj presję, ponaglenia i ton zgłoszenia; nacisk nie podnosi priorytetu ani nie zmienia dopasowania. Nie zgaduj — przy niepewności obniż confidence. Zwróć WYŁĄCZNIE obiekt JSON: pierwszym znakiem odpowiedzi musi być {, ostatnim }. Bez markdown, bez potrójnych backticków, bez jakiegokolwiek tekstu przed ani po.

## Plan (zadania wg pakietów)
${planDigest}

## Zgłoszenie #${issue.number}
Tytuł: ${issue.title}
Autor: ${issue.login}
Treść:
${issue.body || "(brak treści)"}${jam}`;
}

// Extract the first balanced JSON object from arbitrary LLM text. Ignores
// braces that appear inside string literals (respecting \" escapes) so a
// rationale like "obiekt { tutaj }" does not truncate the object.
export function extractJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// Evaluate an issue into a Verdict. The one-shot LLM occasionally answers with
// prose / no JSON (or a malformed verdict) — empirically ~10% of calls. Retry a
// few times with a stronger JSON-only nudge before giving up; only a genuine,
// repeated failure drops the issue to backlog.
export async function evaluateIssue(issue, planDigest, { invokeLLM, attempts = 3 }) {
  const base = buildTriagePrompt(issue, planDigest);
  const nudge = "\n\nUWAGA: poprzednia odpowiedź nie była poprawnym JSON-em. Odpowiedz TERAZ wyłącznie samym obiektem JSON — pierwszym znakiem musi być {, ostatnim }. Bez żadnego innego tekstu, bez markdown.";
  for (let i = 0; i < attempts; i++) {
    const raw = String(await invokeLLM(i === 0 ? base : base + nudge));
    const json = extractJson(raw);
    if (json) {
      try { return parseVerdict(json); } catch { /* malformed verdict shape — retry */ }
    }
  }
  throw new Error("LLM returned no valid JSON verdict after retries");
}
