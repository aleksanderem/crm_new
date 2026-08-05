export const BASE_TOKEN = "BEm9bfWsFa0dHasHlu6j5ynkpSd";
export const TABLE_ID = "tbl61BNGL8JLsUpF";

function cell(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? (x.text || x.name || "") : String(x))).join(", ");
  if (v && typeof v === "object") return v.text || v.name || "";
  return v === null || v === undefined ? "" : String(v);
}

// Compact, PK-grouped digest of the plan for the triage prompt. Keeps only the
// fields the classifier needs (package, priority, module, order, task title).
export function buildPlanDigest(records) {
  const rows = records.map((r) => {
    const f = r.fields || {};
    return {
      pk: cell(f["Pakiet"]) || "(brak)",
      pr: cell(f["Priorytet"]),
      mod: cell(f["Moduł"]),
      ord: cell(f["Kolejność"]),
      task: cell(f["Zadanie"]),
    };
  });
  const byPk = new Map();
  for (const r of rows) {
    if (!byPk.has(r.pk)) byPk.set(r.pk, []);
    byPk.get(r.pk).push(r);
  }
  const parts = [];
  for (const [pk, list] of [...byPk.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`### ${pk}`);
    for (const r of list) {
      parts.push(`- [${r.pr}|${r.mod}|kol ${r.ord}] ${r.task}`);
    }
  }
  return parts.join("\n");
}

// Fetch the plan records via lark-cli. `exec(cmd, args) -> { stdout }` is
// injected so callers/tests control process execution. Base returns rows as
// `data.data` (arrays aligned with `data.fields`); we zip them into {fields}.
export function fetchPlanRecords({ exec }) {
  const args = ["base", "+record-list", "--base-token", BASE_TOKEN,
                "--table-id", TABLE_ID, "--limit", "200", "--format", "json"];
  const { stdout } = exec("lark-cli", args);
  const parsed = JSON.parse(stdout);
  const names = (parsed.data?.fields || []).map((f) => (typeof f === "object" ? f.name : f));
  const rows = parsed.data?.data || [];
  return rows.map((row) => {
    const fields = {};
    names.forEach((n, i) => { fields[n] = row[i]; });
    return { fields };
  });
}
