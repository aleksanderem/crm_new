// Plan bridge: turn native "Do zrobienia" plan tasks into @claude GitHub issues,
// one per tick, in plan order (Priorytet P0→P1→P2, then Kolejność). The normal
// pipeline (webhook → triage → worker) then executes them, and the worker's
// claimNextPlanned orders the whole queue by triage priority — so an imported
// task takes its correct place relative to everything else already queued
// (no idle-gating: the queue itself is the sequencer). Idempotency:
//   - skips Triage=true rows (triage-created records — never re-imported)
//   - skips Zaimportowane=true rows (native tasks already sent to GitHub)
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { fetchPlanRecordsWithIds } from "./wiki/plan-index.mjs";
import { BASE_TOKEN, TABLE_ID } from "./triage/plan.mjs";

function cell(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? (x.text || x.name || "") : String(x))).join(", ");
  if (v && typeof v === "object") return v.text || v.name || "";
  return v === null || v === undefined ? "" : String(v);
}
function priorityRank(prLabel) {
  const m = /P([012])/.exec(prLabel || "");
  return m ? Number(m[1]) : 9;
}
function orderNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

// Next native, actionable, not-yet-imported plan task in plan order, or null.
export function selectNextTask(records) {
  const cands = (records || []).filter((r) => {
    const f = r.fields || {};
    return cell(f["Status realizacji"]) === "Do zrobienia"
      && cell(f["Zadanie"]).trim() !== ""
      && f["Triage"] !== true
      && f["Zaimportowane"] !== true;
  });
  cands.sort((a, b) =>
    (priorityRank(cell(a.fields["Priorytet"])) - priorityRank(cell(b.fields["Priorytet"]))) ||
    (orderNum(cell(a.fields["Kolejność"])) - orderNum(cell(b.fields["Kolejność"]))),
  );
  return cands[0] || null;
}

// Build the @claude issue title + body from a plan record.
export function buildIssue(record) {
  const f = record.fields || {};
  const zadanie = cell(f["Zadanie"]);
  const opis = cell(f["Opis"]);
  const pk = cell(f["Pakiet"]);
  const pr = cell(f["Priorytet"]);
  const mod = cell(f["Moduł"]);
  const dep = cell(f["Zależności"]);
  const title = (zadanie || "Zadanie z planu").slice(0, 120);
  const body = `@claude\n\n**Zadanie z planu uruchomienia produkcyjnego — zaimplementuj.**\n\n${opis || zadanie}\n\n---\n- Pakiet: ${pk || "—"}\n- Priorytet: ${pr || "—"}\n- Moduł: ${mod || "—"}${dep ? `\n- Zależności: ${dep}` : ""}\n- Źródło: rekord planu \`${record.record_id}\``;
  return { title, body };
}

// One bridge tick. deps: { exec, repo, dry, pendingCount, cap }. Returns an
// outcome. The cap limits how many bridge-imported plan jobs may sit PENDING at
// once — a small buffer so the queue isn't filled on spec. It counts only plan
// jobs (bridge author), NOT the whole queue, so it never lets unrelated jobs
// block a plan import (that was the earlier idle-gate bug).
export function runBridge(records, deps) {
  const pending = deps.pendingCount();
  if (pending >= deps.cap) return { action: "skip", reason: "cap-reached", pending, cap: deps.cap };
  const task = selectNextTask(records);
  if (!task) return { action: "skip", reason: "no-task" };
  const { title, body } = buildIssue(task);
  if (deps.dry) return { action: "dry", record: task.record_id, title };
  const out = deps.exec("gh", ["issue", "create", "--repo", deps.repo, "--title", title, "--body", body, "--label", "plan-task"]);
  const url = (out.stdout || "").trim();
  const json = JSON.stringify({ update_records: { [task.record_id]: { "Zaimportowane": true } } });
  deps.exec("lark-cli", ["base", "+record-batch-update", "--base-token", BASE_TOKEN, "--table-id", TABLE_ID, "--json", json, "--format", "json"]);
  return { action: "imported", record: task.record_id, title, url };
}

// --- entry point (systemd timer runs `node plan-bridge.mjs`) ---
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const DRY = process.env.BRIDGE_DRY === "1";
  const REPO = process.env.PLAN_BRIDGE_REPO || "aleksanderem/crm_new";
  const DB_PATH = process.env.DB_PATH || "/home/claude-bot/worker/queue.db";
  const CAP = parseInt(process.env.PLAN_BRIDGE_MAX_PENDING ?? "3", 10);
  // bridge-imported issues are authored by the bot's gh identity
  const AUTHOR = process.env.PLAN_BRIDGE_AUTHOR || process.env.BOT_GH_LOGIN || "aleksanderem";
  function exec(cmd, args) {
    const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${(r.stderr || "").slice(0, 300)}`);
    return { stdout: r.stdout || "" };
  }
  function pendingCount() {
    const db = new Database(DB_PATH, { readonly: true });
    const c = db.prepare("SELECT count(*) c FROM jobs WHERE status='pending' AND trigger_login=?").get(AUTHOR).c;
    db.close();
    return c;
  }
  try {
    const records = fetchPlanRecordsWithIds({ exec });
    let res;
    if (DRY) {
      // preview: next task selection + current plan-job buffer vs cap, no writes
      const task = selectNextTask(records);
      res = { action: "dry", pending: pendingCount(), cap: CAP,
        ...(task ? { record: task.record_id, title: buildIssue(task).title } : { reason: "no-task" }) };
    } else {
      res = runBridge(records, { exec, repo: REPO, dry: false, pendingCount, cap: CAP });
    }
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...res }));
  } catch (e) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), action: "error", err: String(e).slice(0, 400) }));
    process.exit(1);
  }
}
