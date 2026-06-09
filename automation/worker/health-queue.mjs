import Database from "better-sqlite3";
const db = new Database("/home/claude-bot/worker/queue.db", { readonly: true });
const rows = db.prepare(
  "SELECT id,issue_number,status,event_type,trigger_login,created_at,started_at,finished_at FROM jobs ORDER BY id DESC LIMIT 10"
).all();
const fmt = (t) => t ? new Date(t).toISOString().slice(11, 19) : "—";
const dur = (a, b) => (a && b) ? ((b - a) / 1000).toFixed(0) + "s" : "—";

const C = { done: "\x1b[32m", failed: "\x1b[31m", running: "\x1b[36m", pending: "\x1b[33m", rst: "\x1b[0m" };

console.log("ID    Issue   Status     Trigger             Created   Duration  Event");
console.log("─".repeat(82));
for (const r of rows) {
  const c = C[r.status] || "";
  const status = c + r.status.padEnd(8) + C.rst;
  const trig = String(r.trigger_login || "").padEnd(18).slice(0, 18);
  const issue = ("#" + r.issue_number).padEnd(7);
  console.log(`${String(r.id).padStart(3)}   ${issue} ${status}  ${trig}  ${fmt(r.created_at)}  ${dur(r.started_at, r.finished_at).padEnd(8)}  ${r.event_type}`);
}
const counts = db.prepare("SELECT status,COUNT(*) as n FROM jobs GROUP BY status").all();
console.log("\ntotals: " + counts.map((c) => `${c.status}=${c.n}`).join(" "));
