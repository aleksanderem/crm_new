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

Zasady: jeśli zgłoszenie nie realizuje żadnego pakietu, ustaw fits=false i package/priority/order=null. Nie zgaduj — przy niepewności obniż confidence. Zwróć wyłącznie JSON, bez dodatkowego tekstu.

## Plan (zadania wg pakietów)
${planDigest}

## Zgłoszenie #${issue.number}
Tytuł: ${issue.title}
Autor: ${issue.login}
Treść:
${issue.body || "(brak treści)"}${jam}`;
}

// Extract the first balanced JSON object from arbitrary LLM text.
function extractJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

export async function evaluateIssue(issue, planDigest, { invokeLLM }) {
  const raw = await invokeLLM(buildTriagePrompt(issue, planDigest));
  const json = extractJson(String(raw));
  if (!json) throw new Error("LLM returned no JSON verdict");
  return parseVerdict(json);
}
