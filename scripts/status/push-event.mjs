#!/usr/bin/env node

/**
 * push-event.mjs
 *
 * Compares current and previous status, logs state transitions to events.log.
 * Can be extended to send webhooks, desktop notifications, etc.
 */

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const STATUS_JSON = resolve(ROOT, "status.json");
const EVENT_LOG = resolve(ROOT, "scripts/status/events.log");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStatus() {
  try {
    return JSON.parse(readFileSync(STATUS_JSON, "utf-8"));
  } catch {
    return null;
  }
}

function notifyOpenClaw(event) {
  const text = `Status event: ${event.type} | ${event.message}`;
  try {
    execSync(`openclaw system event --text ${JSON.stringify(text)} --mode now`, {
      cwd: ROOT,
      stdio: "ignore",
      timeout: 5000,
    });
  } catch {
    // Non-fatal: event logging still works even if OpenClaw CLI is unavailable.
  }
}

function logEvent(event) {
  const line = `${new Date().toISOString()} | ${event.type} | ${event.message}\n`;
  appendFileSync(EVENT_LOG, line, "utf-8");
  console.log(`[event] ${line.trim()}`);
  notifyOpenClaw(event);
}

// ---------------------------------------------------------------------------
// Diff detection
// ---------------------------------------------------------------------------

export function pushIfChanged(prev, curr) {
  if (!prev || !curr) return;

  const events = [];

  // State transition
  if (prev.current_state !== curr.current_state) {
    events.push({
      type: "STATE_CHANGE",
      message: `${prev.current_state} → ${curr.current_state}`,
    });
  }

  // Task changed
  if (prev.current_task !== curr.current_task) {
    events.push({
      type: "TASK_CHANGE",
      message: `Task: ${prev.current_task ?? "(none)"} → ${curr.current_task ?? "(none)"}`,
    });
  }

  // Blocker added
  const newBlockers = (curr.blockers || []).filter(
    (b) => !(prev.blockers || []).includes(b)
  );
  for (const b of newBlockers) {
    events.push({ type: "BLOCKER_ADDED", message: b });
  }

  // Blocker resolved
  const resolvedBlockers = (prev.blockers || []).filter(
    (b) => !(curr.blockers || []).includes(b)
  );
  for (const b of resolvedBlockers) {
    events.push({ type: "BLOCKER_RESOLVED", message: b });
  }

  // Test status changed
  if (prev.test_status !== curr.test_status) {
    events.push({
      type: "TEST_STATUS",
      message: `${prev.test_status} → ${curr.test_status}`,
    });
  }

  // Build status changed
  if (prev.build_status !== curr.build_status) {
    events.push({
      type: "BUILD_STATUS",
      message: `${prev.build_status} → ${curr.build_status}`,
    });
  }

  // Process changes
  const newProcs = (curr.active_processes || []).filter(
    (p) => !(prev.active_processes || []).includes(p)
  );
  const stoppedProcs = (prev.active_processes || []).filter(
    (p) => !(curr.active_processes || []).includes(p)
  );
  for (const p of newProcs) {
    events.push({ type: "PROCESS_STARTED", message: p });
  }
  for (const p of stoppedProcs) {
    events.push({ type: "PROCESS_STOPPED", message: p });
  }

  for (const e of events) logEvent(e);
  return events;
}

// ---------------------------------------------------------------------------
// CLI: compare saved snapshot with current status.json
// ---------------------------------------------------------------------------

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const snapshotPath = resolve(__dirname, ".last-snapshot.json");
  const current = readStatus();

  let prev = null;
  if (existsSync(snapshotPath)) {
    try {
      prev = JSON.parse(readFileSync(snapshotPath, "utf-8"));
    } catch { /* ignore */ }
  }

  if (current) {
    const events = pushIfChanged(prev, current);
    if (!events || events.length === 0) {
      console.log("[event] No state changes detected.");
    }
    // Save current as snapshot for next comparison
    const { writeFileSync } = await import("node:fs");
    writeFileSync(snapshotPath, JSON.stringify(current, null, 2) + "\n", "utf-8");
  } else {
    console.error("[event] Could not read status.json");
    process.exit(1);
  }
}
