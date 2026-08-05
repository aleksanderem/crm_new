export const PACKAGES = ["PK1", "PK2", "PK3", "PK4", "PK5", "PK6", "PK7", "PK8", "PK9"];
const PRIORITIES = ["P0", "P1", "P2"];

export function priorityRank(priority) {
  const i = PRIORITIES.indexOf(priority);
  return i === -1 ? 9 : i;
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse + validate an LLM triage verdict into the canonical Verdict shape.
// Accepts a JSON string or a plain object. A backlog verdict (fits=false)
// always nulls package/priority/order so downstream code never mixes signals.
export function parseVerdict(raw) {
  let o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); }
    catch { throw new Error("Verdict is not valid JSON"); }
  }
  if (!o || typeof o !== "object") throw new Error("Verdict must be an object");

  const fits = o.fits === true;
  if (fits) {
    if (!PACKAGES.includes(o.package)) throw new Error(`Unknown package: ${o.package}`);
    if (!PRIORITIES.includes(o.priority)) throw new Error(`Unknown priority: ${o.priority}`);
  }
  const confidence = num(o.confidence);
  return {
    fits,
    package: fits ? o.package : null,
    priority: fits ? o.priority : null,
    order: fits ? num(o.order) : null,
    module: fits && typeof o.module === "string" && o.module ? o.module : null,
    confidence: confidence === null ? 0 : Math.max(0, Math.min(1, confidence)),
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 1000) : "",
  };
}
