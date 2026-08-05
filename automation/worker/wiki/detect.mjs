// Cheap gate: only spend an LLM assessment on issues whose text plausibly
// changes launch readiness — a completion OR a bug/blocker. Presence-only, like
// the pressure detector; the actual launch-relevance judgment is the assessment's.
export const COMPLETION_PHRASES = [
  "zrobione", "zrobiono", "gotowe", "ukończone", "ukonczone", "wdrożone", "wdrozone",
  "naprawione", "naprawiony", "naprawiłem", "naprawilem", "naprawili",
  "już działa", "juz dziala", "działa już", "dziala juz", "rozwiązane", "rozwiazane",
  "already done", "already fixed", "is fixed", "is done", "resolved",
];
export const BLOCKER_PHRASES = [
  "błąd", "blad", "bug", "nie działa", "nie dziala", "psuje", "blokuje", "blokad",
  "uniemożliwia", "uniemozliwia", "krytyczn", "regres", "cofa", "awaria",
  "broken", "breaks", "blocks", "blocker", "regression", "crash", "fails",
];

export function looksLikePlanImpact(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  return [...COMPLETION_PHRASES, ...BLOCKER_PHRASES].some((p) => text.includes(p));
}
