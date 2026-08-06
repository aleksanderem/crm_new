// Groomer: processes issues stuck in `claude:needs-info` (flagged by the worker
// when a task is too large / ambiguous). For each, an LLM decides the fate:
//   - split       -> break into concrete @claude sub-tasks (capped), relabel parent claude:split
//   - resolved    -> follow-ups/work already cover it -> comment + claude:done + close
//   - needs-human -> genuinely needs a human call -> post the question, label human-decision, escalate
// Idempotent by label transition: it queries claude:needs-info and always removes
// that label after deciding, so no issue is groomed twice. Sub-tasks flow through
// the normal webhook->triage->worker pipeline.
import { spawnSync } from "node:child_process";
import { extractJson } from "./triage/evaluate.mjs";

const DECISIONS = ["split", "resolved", "needs-human"];

export function buildGroomPrompt(issue) {
  const comments = (issue.comments || [])
    .map((c) => `- @${c.author?.login || c.by || "?"}: ${(c.body || "").slice(0, 800)}`)
    .join("\n");
  return `Jesteś inżynierem-groomerem. PONIŻSZE zgłoszenie zostało oznaczone "needs-info" przez workera (claude) w trakcie pracy — zwykle znaczy to, że zadanie jest zbyt duże, wymaga rozbicia, albo potrzebna jest decyzja człowieka. Na podstawie treści I KOMENTARZY (worker mógł już opisać zakres i pootwierać follow-upy) zdecyduj o dalszym losie. Zwróć JEDEN obiekt JSON o dokładnie takim kształcie:

{
  "decision": "split" | "resolved" | "needs-human",
  "subtasks": [ { "title": string, "body": string } ],
  "question": string,
  "rationale": string
}

Znaczenie: split = realnie zostaje konkretna praca, rozbij na samodzielne pod-zadania (podaj je w subtasks; każde jasne i wykonalne osobno). resolved = follow-upy/komentarze wskazują, że zakres został pokryty i można zamknąć. needs-human = potrzebna decyzja człowieka (podaj jedno zwięzłe pytanie w question). Przy niepewności wybierz "needs-human" — nie zgaduj. Zwróć wyłącznie JSON.

## Zgłoszenie #${issue.number}
Tytuł: ${issue.title}
Treść:
${issue.body || "(brak treści)"}

## Komentarze
${comments || "(brak komentarzy)"}`;
}

export function parseGroomDecision(raw) {
  const empty = { decision: "needs-human", subtasks: [], question: "", rationale: "" };
  let o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch { return { ...empty, question: "Nie udało się przetworzyć decyzji groomera — wymaga ręcznej oceny." }; }
  }
  if (!o || typeof o !== "object") return { ...empty };
  const decision = DECISIONS.includes(o.decision) ? o.decision : "needs-human";
  const subtasks = Array.isArray(o.subtasks)
    ? o.subtasks
        .filter((s) => s && typeof s.title === "string" && s.title.trim())
        .map((s) => ({ title: s.title.slice(0, 120), body: typeof s.body === "string" ? s.body.slice(0, 4000) : "" }))
    : [];
  return {
    decision,
    subtasks,
    question: typeof o.question === "string" ? o.question.slice(0, 1000) : "",
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 1000) : "",
  };
}

// Act on the decision. deps: { exec, repo, cap }. Returns an outcome object.
// A split with no valid subtasks degrades to needs-human (never silently drop).
export function applyGroomDecision(issue, d, deps) {
  const repo = deps.repo;
  const n = String(issue.number);

  if (d.decision === "split" && d.subtasks.length > 0) {
    const created = [];
    for (const st of d.subtasks.slice(0, deps.cap)) {
      const body = `@claude\n\n${st.body || st.title}\n\n---\n- Pod-zadanie z rozbicia #${issue.number} (groomer)\n- Kontekst: ${issue.title}`;
      const out = deps.exec("gh", ["issue", "create", "--repo", repo, "--title", st.title, "--body", body, "--label", "plan-task", "--label", "groomer-subtask"]);
      created.push((out.stdout || "").trim());
    }
    deps.exec("gh", ["issue", "comment", n, "--repo", repo, "--body",
      `🤖 **Rozbito na pod-zadania (groomer).** ${d.rationale}\n\n${created.map((u) => "- " + u).join("\n")}`]);
    deps.exec("gh", ["issue", "edit", n, "--repo", repo, "--remove-label", "claude:needs-info", "--add-label", "claude:split"]);
    return { action: "split", parent: issue.number, created };
  }

  if (d.decision === "resolved") {
    deps.exec("gh", ["issue", "comment", n, "--repo", repo, "--body",
      `✅ **Zamknięte przez groomera.** ${d.rationale || "Zakres pokryty przez wykonaną pracę / follow-upy."}`]);
    deps.exec("gh", ["issue", "edit", n, "--repo", repo, "--remove-label", "claude:needs-info", "--add-label", "claude:done"]);
    deps.exec("gh", ["issue", "close", n, "--repo", repo]);
    return { action: "resolved", parent: issue.number };
  }

  // needs-human (also the fallback for split-without-subtasks)
  const q = d.question || "Groomer nie potrafił jednoznacznie zdecydować — wymaga decyzji człowieka.";
  deps.exec("gh", ["issue", "comment", n, "--repo", repo, "--body",
    `🙋 **Wymaga decyzji człowieka (groomer).** ${q}${d.rationale ? "\n\n_" + d.rationale + "_" : ""}`]);
  deps.exec("gh", ["issue", "edit", n, "--repo", repo, "--remove-label", "claude:needs-info", "--add-label", "human-decision"]);
  return { action: "needs-human", parent: issue.number };
}

// --- entry point (systemd timer runs `node groomer.mjs`) ---
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const REPO = process.env.PLAN_BRIDGE_REPO || "aleksanderem/crm_new";
  const CAP = parseInt(process.env.GROOMER_MAX_SUBTASKS ?? "8", 10);
  const RUN_SCRIPT = process.env.RUN_SCRIPT || "/home/claude-bot/worker/run-claude.sh";
  const ENABLED = (process.env.GROOMER_ENABLED ?? "1") === "1";
  const DRY = process.env.GROOMER_DRY === "1";
  function exec(cmd, args) {
    const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${(r.stderr || "").slice(0, 300)}`);
    return { stdout: r.stdout || "" };
  }
  function invokeLLM(prompt) {
    const r = spawnSync("/bin/bash", [RUN_SCRIPT], {
      encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, TRIAGE_MODE: "1", TRIAGE_PROMPT: prompt },
    });
    if (r.status !== 0) throw new Error(`groomer LLM failed (${r.status}): ${(r.stderr || "").slice(0, 300)}`);
    return r.stdout || "";
  }
  try {
    if (!ENABLED) { console.log(JSON.stringify({ ts: new Date().toISOString(), action: "skip", reason: "disabled" })); process.exit(0); }
    // one needs-info issue per tick (oldest first)
    const list = JSON.parse(exec("gh", ["issue", "list", "--repo", REPO, "--label", "claude:needs-info", "--state", "open", "--limit", "1", "--json", "number"]).stdout || "[]");
    if (list.length === 0) { console.log(JSON.stringify({ ts: new Date().toISOString(), action: "skip", reason: "no-needs-info" })); process.exit(0); }
    const num = list[0].number;
    const issue = JSON.parse(exec("gh", ["issue", "view", String(num), "--repo", REPO, "--json", "number,title,body,comments"]).stdout);
    const decision = parseGroomDecision(extractJson(String(invokeLLM(buildGroomPrompt(issue)))) || "");
    if (DRY) { console.log(JSON.stringify({ ts: new Date().toISOString(), action: "dry", number: num, decision: decision.decision, subtasks: decision.subtasks.length, rationale: decision.rationale })); process.exit(0); }
    const res = applyGroomDecision(issue, decision, { exec, repo: REPO, cap: CAP });
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...res, decision: decision.decision }));
  } catch (e) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), action: "error", err: String(e).slice(0, 400) }));
    process.exit(1);
  }
}
