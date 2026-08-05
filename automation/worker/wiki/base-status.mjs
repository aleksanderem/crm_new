import { BASE_TOKEN, TABLE_ID } from "../triage/plan.mjs";

// Flip a plan record's status to Zrobione. Single-select value is an ARRAY per
// +record-batch-update's contract ({"Status":["Done"]}). NOTE: verify live with
// `lark-cli base +record-batch-update ... --dry-run` before enabling writes.
export function markRecordDone(recordId, { exec }) {
  const json = JSON.stringify({ update_records: { [recordId]: { "Status realizacji": ["Zrobione"] } } });
  exec("lark-cli", ["base", "+record-batch-update", "--base-token", BASE_TOKEN,
                    "--table-id", TABLE_ID, "--json", json, "--format", "json"]);
}
