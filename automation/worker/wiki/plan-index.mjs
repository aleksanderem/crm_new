import { BASE_TOKEN, TABLE_ID } from "../triage/plan.mjs";

function cell(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? (x.text || x.name || "") : String(x))).join(", ");
  if (v && typeof v === "object") return v.text || v.name || "";
  return v === null || v === undefined ? "" : String(v);
}

// Like triage/plan.mjs fetchPlanRecords, but keeps record_id (needed to target a
// status update). +record-list returns data.data (value arrays), data.fields
// (names) and data.record_id_list (ids) in parallel.
export function fetchPlanRecordsWithIds({ exec }) {
  const args = ["base", "+record-list", "--base-token", BASE_TOKEN,
                "--table-id", TABLE_ID, "--limit", "200", "--format", "json"];
  const { stdout } = exec("lark-cli", args);
  const parsed = JSON.parse(stdout);
  const names = (parsed.data?.fields || []).map((f) => (typeof f === "object" ? f.name : f));
  const rows = parsed.data?.data || [];
  const ids = parsed.data?.record_id_list || [];
  return rows.map((row, i) => {
    const fields = {};
    names.forEach((n, j) => { fields[n] = row[j]; });
    return { record_id: ids[i], fields };
  });
}

// PK-grouped digest with a [record_id] tag per line, so the assessment can name
// exactly which plan record a completion refers to.
export function buildDeltaDigest(records) {
  const byPk = new Map();
  for (const r of records) {
    const f = r.fields || {};
    const pk = cell(f["Pakiet"]) || "(brak)";
    if (!byPk.has(pk)) byPk.set(pk, []);
    byPk.get(pk).push({
      id: r.record_id,
      ord: cell(f["Kolejność"]),
      status: cell(f["Status realizacji"]),
      task: cell(f["Zadanie"]),
    });
  }
  const parts = [];
  for (const [pk, list] of [...byPk.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`### ${pk}`);
    for (const r of list) {
      parts.push(`- [${r.id}] (kol ${r.ord}, ${r.status}) ${r.task}`);
    }
  }
  return parts.join("\n");
}

export function resolveRecordId(records, delta) {
  if (!delta || !delta.recordId) return null;
  return records.find((r) => r.record_id === delta.recordId) || null;
}
