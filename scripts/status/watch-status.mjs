#!/usr/bin/env node

/**
 * watch-status.mjs
 *
 * Polls project status every INTERVAL seconds, writes status files,
 * and pushes change events when state transitions are detected.
 */

import { resolve, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { update } from "./update-status.mjs";
import { pushIfChanged } from "./push-event.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const STATUS_JSON = resolve(ROOT, "status.json");

const INTERVAL_MS = parseInt(process.env.STATUS_INTERVAL || "60", 10) * 1000;

let previous = null;

function readCurrent() {
  try {
    return JSON.parse(readFileSync(STATUS_JSON, "utf-8"));
  } catch {
    return null;
  }
}

function tick() {
  try {
    const before = readCurrent();
    const current = update();
    pushIfChanged(before, current);
    previous = current;
  } catch (err) {
    console.error("[watch] Error during tick:", err.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`[watch] Starting status watcher — polling every ${INTERVAL_MS / 1000}s`);
console.log(`[watch] Project root: ${ROOT}`);
console.log(`[watch] Press Ctrl+C to stop.\n`);

// Initial tick
tick();

// Recurring
const timer = setInterval(tick, INTERVAL_MS);

process.on("SIGINT", () => {
  clearInterval(timer);
  console.log("\n[watch] Stopped.");
  process.exit(0);
});

process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});
