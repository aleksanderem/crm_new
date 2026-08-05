export const PRESSURE_PHRASES = [
  "zrób to teraz", "zrob to teraz", "zróbcie to teraz", "natychmiast",
  "to krytyczne", "to jest krytyczne", "pilne", "bardzo pilne", "asap",
  "od razu", "już teraz", "juz teraz", "wykonaj to", "musisz to zrobić",
  "musisz to zrobic", "musicie to zrobić", "bo inaczej",
  "do it now", "right now", "urgent", "immediately", "or else", "drop everything",
];
export const SIMILARITY_THRESHOLD = 0.8;

export const RELATED_LOGINS = {
  aslocka: ["aslocka2026"],
  aslocka2026: ["aslocka"],
};
export function relatedLoginsOf(login) {
  return RELATED_LOGINS[(login || "").toLowerCase()] || [];
}

export const HARSH_LOGINS = new Set(["aslocka", "aslocka2026"]);
export function isHarshLogin(login) {
  return HARSH_LOGINS.has((login || "").toLowerCase());
}

export function normalizeTokens(text) {
  return (text || "")
    .toLowerCase()
    .split(/[^a-ząćęłńóśźż0-9]+/i)
    .filter((t) => t.length >= 3);
}

export function similarity(a, b) {
  const sa = new Set(normalizeTokens(a));
  const sb = new Set(normalizeTokens(b));
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Pure presence check. Whether pressure BLOCKS is decided later from the merit
// verdict (a fitting task passes even if worded urgently); this only reports
// that a pressure phrase is present.
export function detectPressure(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  const phrase = PRESSURE_PHRASES.find((p) => text.includes(p));
  return { hit: !!phrase, phrase: phrase || null };
}

// priorIssues are already restricted to related logins by the caller.
export function detectMultiAccount(issue, { priorIssues }) {
  const mine = `${issue.title || ""} ${issue.body || ""}`;
  for (const prior of priorIssues || []) {
    const sim = similarity(mine, `${prior.title || ""} ${prior.body || ""}`);
    if (sim >= SIMILARITY_THRESHOLD) {
      return { hit: true, relatedLogin: prior.login, matchTitle: prior.title || "", similarity: sim };
    }
  }
  return { hit: false, relatedLogin: null, matchTitle: "", similarity: 0 };
}
