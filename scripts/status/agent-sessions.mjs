#!/usr/bin/env node

/**
 * agent-sessions.mjs
 *
 * Reads openclaw agent sessions from the local sessions file and returns
 * a summary of recent active sessions. Integrated into status.json as
 * `openclaw_sessions`. Returns an empty array if the file is unavailable.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";

const SESSIONS_PATH = resolve(
  homedir(),
  ".openclaw/agents/main/sessions/sessions.json"
);

/** Try `openclaw sessions --json` CLI first, fall back to reading the file. */
function loadRawSessions() {
  // Prefer CLI output if available
  try {
    const out = execSync("openclaw sessions --json", {
      encoding: "utf-8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) {
      const data = JSON.parse(out);
      const arr = Array.isArray(data) ? data : data?.sessions;
      if (Array.isArray(arr)) return arr;
    }
  } catch {
    // CLI unavailable or failed — fall through to file
  }

  // Fallback: read sessions file directly
  const raw = readFileSync(SESSIONS_PATH, "utf-8");
  const data = JSON.parse(raw);
  const arr = Array.isArray(data) ? data : data?.sessions;
  return Array.isArray(arr) ? arr : [];
}

/**
 * Collect openclaw sessions summary.
 * Returns an array of session objects with key fields, or [] on failure.
 */
export function collectOpenclawSessions() {
  try {
    const sessions = loadRawSessions();

    // Return summary of each session (most recent first, cap at 20)
    return sessions
      .slice(0, 20)
      .map((s) => ({
        key: s.key ?? null,
        sessionId: s.sessionId ?? null,
        updatedAt: s.updatedAt
          ? new Date(s.updatedAt).toISOString()
          : null,
        ageMs: s.ageMs ?? null,
        model: s.model ?? null,
        modelProvider: s.modelProvider ?? null,
        agentId: s.agentId ?? null,
        kind: s.kind ?? null,
        totalTokens: s.totalTokens ?? null,
        inputTokens: s.inputTokens ?? null,
        outputTokens: s.outputTokens ?? null,
      }));
  } catch {
    // File not found or unparseable — not an error, just unavailable
    return [];
  }
}

// If run directly, print the sessions
if (
  process.argv[1] &&
  resolve(process.argv[1]) ===
    resolve(new URL(import.meta.url).pathname)
) {
  const sessions = collectOpenclawSessions();
  console.log(JSON.stringify(sessions, null, 2));
  console.log(`[agent-sessions] Found ${sessions.length} session(s).`);
}
