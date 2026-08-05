import { test } from "node:test";
import assert from "node:assert/strict";
import { selectNextTask, buildIssue, runBridge } from "./plan-bridge.mjs";

const rec = (id, over) => ({
  record_id: id,
  fields: {
    "Status realizacji": ["Do zrobienia"],
    "Zadanie": "task " + id,
    "Priorytet": ["P1 – przed pierwszym klientem"],
    "Kolejność": 5,
    ...over,
  },
});

test("selectNextTask picks P0 before P1, then by Kolejność", () => {
  const records = [
    rec("r1", { "Priorytet": ["P1 – x"], "Kolejność": 2 }),
    rec("r2", { "Priorytet": ["P0 – blokuje start"], "Kolejność": 9 }),
    rec("r3", { "Priorytet": ["P1 – x"], "Kolejność": 1 }),
  ];
  assert.equal(selectNextTask(records).record_id, "r2"); // P0 wins
});

test("selectNextTask skips triage-created, already-imported, done, and empty-task rows", () => {
  const records = [
    rec("triage", { "Triage": true }),
    rec("imported", { "Zaimportowane": true }),
    rec("done", { "Status realizacji": ["Zrobione"] }),
    rec("empty", { "Zadanie": "" }),
    rec("good", { "Kolejność": 3 }),
  ];
  assert.equal(selectNextTask(records).record_id, "good");
});

test("selectNextTask returns null when nothing is importable", () => {
  assert.equal(selectNextTask([rec("t", { "Triage": true })]), null);
});

test("buildIssue mentions @claude and carries plan context", () => {
  const { title, body } = buildIssue(rec("r9", { "Zadanie": "Zielona bramka CI", "Opis": "opis zadania", "Pakiet": ["PK1 · x"] }));
  assert.equal(title, "Zielona bramka CI");
  assert.match(body, /@claude/);
  assert.match(body, /opis zadania/);
  assert.match(body, /PK1/);
  assert.match(body, /r9/);
});

test("runBridge skips when the queue is busy (backpressure)", () => {
  const res = runBridge([rec("r1")], { queueBusy: () => true, exec: () => { throw new Error("should not run"); }, repo: "o/r" });
  assert.deepEqual(res, { action: "skip", reason: "queue-busy" });
});

test("runBridge dry mode selects a task without side effects", () => {
  const res = runBridge([rec("r1")], { queueBusy: () => false, dry: true, exec: () => { throw new Error("no"); }, repo: "o/r" });
  assert.equal(res.action, "dry");
  assert.equal(res.record, "r1");
});

test("runBridge creates the issue, marks imported, when idle", () => {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, args[0]]);
    return { stdout: cmd === "gh" ? "https://github.com/o/r/issues/123\n" : "{}" };
  };
  const res = runBridge([rec("r1")], { queueBusy: () => false, exec, repo: "o/r" });
  assert.equal(res.action, "imported");
  assert.equal(res.url, "https://github.com/o/r/issues/123");
  assert.deepEqual(calls[0], ["gh", "issue"]);          // create issue
  assert.deepEqual(calls[1], ["lark-cli", "base"]);     // mark Zaimportowane
});
