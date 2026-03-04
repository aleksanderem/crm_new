#!/usr/bin/env node

/**
 * update-status.mjs
 *
 * Collects live project status (git, processes, last build/test/lint results)
 * and writes STATUS.md + status.json to the project root.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectOpenclawSessions } from "./agent-sessions.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const STATUS_JSON = resolve(ROOT, "status.json");
const STATUS_MD = resolve(ROOT, "STATUS.md");
const EVENT_LOG = resolve(ROOT, "scripts/status/events.log");
const SPRINT0_PROGRESS_JSON = resolve(ROOT, ".runtime/sprint0-progress.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf-8", timeout: 10_000, ...opts }).trim();
  } catch {
    return null;
  }
}

function readPrevious() {
  try {
    return JSON.parse(readFileSync(STATUS_JSON, "utf-8"));
  } catch {
    return null;
  }
}

function readLastNonEmptyLine(path) {
  try {
    const txt = readFileSync(path, "utf-8");
    const lines = txt.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1].slice(0, 220) : null;
  } catch {
    return null;
  }
}

function readJsonIfExists(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function getRuntimeAgentMeta() {
  const dir = resolve(ROOT, ".runtime/agents");
  const byPid = new Map();
  const runs = [];
  if (!existsSync(dir)) return { byPid, runs };
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const metaPath = resolve(dir, file);
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
        const last_output = meta?.last_output ?? (meta?.log_file ? readLastNonEmptyLine(meta.log_file) : null);
        const row = {
          agent: meta?.agent ?? 'unknown',
          pid: meta?.pid ?? null,
          state: meta?.state ?? 'unknown',
          started_at: meta?.started_at ?? null,
          finished_at: meta?.finished_at ?? null,
          exit_code: meta?.exit_code ?? null,
          log_file: meta?.log_file ?? null,
          last_output,
          meta_file: metaPath,
        };
        runs.push(row);
        if (meta?.pid) {
          byPid.set(Number(meta.pid), {
            log_file: row.log_file,
            last_output: row.last_output,
          });
        }
      } catch {
        // ignore malformed meta files
      }
    }
  } catch {
    // ignore runtime meta read failures
  }
  runs.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  return { byPid, runs: runs.slice(0, 20) };
}

// ---------------------------------------------------------------------------
// Collectors
// ---------------------------------------------------------------------------

function detectActiveProcesses() {
  const procs = [];
  const ps = run("ps aux") || "";
  if (/vite/.test(ps)) procs.push("vite-dev-server");
  if (/convex\s+dev/.test(ps)) procs.push("convex-dev");
  if (/vitest/.test(ps)) procs.push("vitest");
  if (/eslint/.test(ps)) procs.push("eslint");
  if (/tsc\b/.test(ps)) procs.push("tsc");
  return procs;
}

/** Detect running coding-agent processes via `ps`. */
function detectAgents(runtimeMetaByPid) {
  const agents = [];
  // Use simple ps format for robustness across macOS / Linux
  const raw = run("ps -eo pid,etime,command") || run("ps -eo pid,command") || "";
  const lines = raw.split("\n");

  // Patterns: agent name + regex to match the command
  const patterns = [
    { agent: "claude", re: /claude\s+-p\b/ },
    { agent: "claude-tui", re: /openclaw-tui\b/ },
    { agent: "claude-onboard", re: /openclaw-onboard\b/ },
    { agent: "codex", re: /\bcodex\b/ },
    { agent: "opencode", re: /\bopencode\b/ },
    { agent: "copaw", re: /\bcopaw\b/ },
    { agent: "pi", re: /\bpi\s/ },
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^\s*PID/.test(trimmed)) continue; // skip header

    for (const { agent, re } of patterns) {
      if (!re.test(trimmed)) continue;

      // Parse PID (first numeric token)
      const pidMatch = trimmed.match(/^(\d+)/);
      const pid = pidMatch ? Number(pidMatch[1]) : null;

      // Try to extract elapsed time (second column if present, format DD-HH:MM:SS or HH:MM:SS or MM:SS)
      const parts = trimmed.split(/\s+/);
      let started_at = null;
      if (parts.length >= 3) {
        const etime = parts[1];
        // etime format: [[DD-]HH:]MM:SS
        if (/^(\d+-)?(\d+:)?\d+:\d+$/.test(etime)) {
          const elapsedSec = parseEtime(etime);
          if (elapsedSec !== null) {
            started_at = new Date(Date.now() - elapsedSec * 1000).toISOString();
          }
        }
      }

      // Truncate command to something readable
      const cmdStart = trimmed.indexOf(parts[2] || "");
      const command = cmdStart >= 0 ? trimmed.slice(cmdStart).slice(0, 120) : trimmed.slice(0, 120);

      const meta = pid ? runtimeMetaByPid.get(pid) : null;
      agents.push({
        pid,
        agent,
        command,
        started_at,
        state: "running",
        last_output: meta?.last_output ?? null,
        log_file: meta?.log_file ?? null,
      });
      break; // one match per line
    }
  }

  return agents;
}

/** Parse ps elapsed time (etime) string to seconds. */
function parseEtime(etime) {
  try {
    let days = 0;
    let rest = etime;
    if (rest.includes("-")) {
      const [d, r] = rest.split("-");
      days = Number(d);
      rest = r;
    }
    const segments = rest.split(":").map(Number);
    if (segments.length === 3) return days * 86400 + segments[0] * 3600 + segments[1] * 60 + segments[2];
    if (segments.length === 2) return days * 86400 + segments[0] * 60 + segments[1];
    return null;
  } catch {
    return null;
  }
}

function detectGitInfo() {
  const branch = run("git rev-parse --abbrev-ref HEAD");
  const dirty = run("git status --porcelain");
  const lastCommit = run('git log -1 --format="%h %s"');
  return { branch, dirty: dirty ? dirty.split("\n").length : 0, lastCommit };
}

function checkBuildArtifact() {
  // Check if dist/ exists and is recent
  if (existsSync(resolve(ROOT, "dist/index.html"))) {
    const stat = run('stat -f "%m" dist/index.html') || run('stat -c "%Y" dist/index.html');
    if (stat) {
      const age = (Date.now() / 1000) - Number(stat);
      if (age < 3600) return "pass (recent)";
      return "stale";
    }
    return "exists";
  }
  return "unknown";
}

function inferState(procs, prev) {
  if (procs.length > 0) return "RUNNING";
  if (prev && prev.blockers && prev.blockers.length > 0) return "BLOCKED";
  return "IDLE";
}

function computeSprint0(statusLike) {
  const manual = readJsonIfExists(SPRINT0_PROGRESS_JSON) || {};
  const manualDone = new Set(Array.isArray(manual.done) ? manual.done : []);

  const tasks = [
    { id: "convex", title: "Convex configured + codegen works", done: false },
    { id: "typecheck", title: "Typecheck green", done: false },
    { id: "build", title: "Build green", done: false },
    { id: "lint", title: "Lint green", done: false },
    { id: "blast", title: "Blast-radius user validation", done: false },
    { id: "report", title: "Sprint 0 report delivered", done: false },
  ];

  const envLocal = run("cat .env.local") || "";
  if (/CONVEX_DEPLOYMENT\s*=/.test(envLocal)) manualDone.add("convex");

  if (String(statusLike.test_status || "").toLowerCase().includes("pass")) manualDone.add("typecheck");
  if (String(statusLike.build_status || "").toLowerCase().includes("pass")) manualDone.add("build");
  if (String(statusLike.lint_status || "").toLowerCase().includes("pass")) manualDone.add("lint");
  if (String(statusLike.notes || "").includes("BLAST_RADIUS_OK")) manualDone.add("blast");
  if (String(statusLike.notes || "").includes("DONE_SPRINT0")) manualDone.add("report");

  for (const t of tasks) t.done = manualDone.has(t.id);

  const done_count = tasks.filter((t) => t.done).length;
  return {
    current_focus: manual.current_focus || "Typecheck stabilization",
    tasks,
    done_count,
    total_count: tasks.length,
  };
}

// ---------------------------------------------------------------------------
// Build status object
// ---------------------------------------------------------------------------

export function collectStatus() {
  const prev = readPrevious();
  const procs = detectActiveProcesses();
  const git = detectGitInfo();
  const state = inferState(procs, prev);
  const runtimeMeta = getRuntimeAgentMeta();
  const agents = detectAgents(runtimeMeta.byPid);
  const worker_runs = runtimeMeta.runs;
  const openclaw_sessions = collectOpenclawSessions();

  const now = new Date().toISOString();

  const buildStatusNow = checkBuildArtifact();
  const base = {
    current_state: state,
    current_task: prev?.current_task ?? null,
    started_at: state === "RUNNING" ? (prev?.started_at ?? now) : null,
    updated_at: now,
    blockers: prev?.blockers ?? [],
    active_processes: procs.length ? procs : (prev?.active_processes ?? []),
    // Sticky lists: if a collection probe transiently fails, don't wipe dashboard state.
    agents: agents.length ? agents : (prev?.agents ?? []),
    worker_runs: worker_runs.length ? worker_runs : (prev?.worker_runs ?? []),
    openclaw_sessions: openclaw_sessions.length ? openclaw_sessions : (prev?.openclaw_sessions ?? []),
    last_commands: prev?.last_commands ?? [],
    test_status: prev?.test_status ?? "unknown",
    build_status: buildStatusNow !== "unknown" ? buildStatusNow : (prev?.build_status ?? "unknown"),
    lint_status: prev?.lint_status ?? "unknown",
    git: {
      branch: git.branch,
      dirty_files: git.dirty,
      last_commit: git.lastCommit,
    },
    notes: prev?.notes ?? "",
  };

  return {
    ...base,
    sprint0: computeSprint0(base),
  };
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

function writeJson(status) {
  writeFileSync(STATUS_JSON, JSON.stringify(status, null, 2) + "\n", "utf-8");
}

function writeMd(s) {
  const blockers = s.blockers.length > 0
    ? s.blockers.map((b) => `- ${b}`).join("\n")
    : "None.";

  const procs = s.active_processes.length > 0
    ? s.active_processes.map((p) => `- ${p}`).join("\n")
    : "None detected.";

  const cmds = s.last_commands.length > 0
    ? s.last_commands.slice(-10).map((c) => `- \`${c}\``).join("\n")
    : "None recorded.";

  const agentsList = s.agents && s.agents.length > 0
    ? s.agents.map((a) => `- **${a.agent}** (PID ${a.pid}) — \`${a.command.slice(0, 80)}\``).join("\n")
    : "No agents detected.";

  const sprint0List = s.sprint0?.tasks?.length
    ? s.sprint0.tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.title}`).join("\n")
    : "No sprint checklist.";

  const md = `# Project Status

> Auto-generated by \`scripts/status/update-status.mjs\`. Do not edit manually.

| Field           | Value |
|-----------------|-------|
| State           | ${s.current_state} |
| Current Task    | ${s.current_task ?? "—"} |
| Started At      | ${s.started_at ?? "—"} |
| Updated At      | ${s.updated_at ?? "—"} |
| Test Status     | ${s.test_status} |
| Build Status    | ${s.build_status} |
| Lint Status     | ${s.lint_status} |
| Git Branch      | ${s.git?.branch ?? "—"} |
| Dirty Files     | ${s.git?.dirty_files ?? 0} |
| Last Commit     | ${s.git?.last_commit ?? "—"} |

## Blockers

${blockers}

## Active Processes

${procs}

## Agents

${agentsList}

## Sprint 0 Checklist

Progress: ${s.sprint0?.done_count ?? 0}/${s.sprint0?.total_count ?? 0}

${sprint0List}

## Last Commands

${cmds}

## Notes

${s.notes || "—"}
`;
  writeFileSync(STATUS_MD, md, "utf-8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function update() {
  const status = collectStatus();
  writeJson(status);
  writeMd(status);
  return status;
}

// Run directly
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const s = update();
  console.log(`[status] Updated — state=${s.current_state} procs=${s.active_processes.length} @ ${s.updated_at}`);
}
