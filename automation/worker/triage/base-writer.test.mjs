import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecordFields, createTriageRecord } from "./base-writer.mjs";

const ISSUE = { number: 42, title: "Sekret pusty", url: "https://github.com/o/r/issues/42" };
const FITS = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "PK1." };
const BACKLOG = { fits: false, package: null, priority: null, order: null, module: null, confidence: 0.3, rationale: "Poza planem." };

test("buildRecordFields maps a fitting verdict to Base labels", () => {
  const f = buildRecordFields(FITS, ISSUE);
  assert.match(f["Pakiet"], /^PK1 ·/);
  assert.match(f["Priorytet"], /^P0 –/);
  assert.equal(f["Kolejność"], 1);
  assert.equal(f["Moduł"], "DevOps");
  assert.match(f["Źródło"], /issues\/42/);
  assert.equal(f["Status realizacji"], "Do zrobienia");
  assert.equal(f["Triage"], true);
});

test("buildRecordFields maps a backlog verdict with no package", () => {
  const f = buildRecordFields(BACKLOG, ISSUE);
  assert.equal(f["Pakiet"], undefined);
  assert.equal(f["Priorytet"], undefined);
  assert.match(f["Źródło"], /issues\/42/);
});

test("createTriageRecord builds a record-create command and returns the new id", () => {
  const calls = [];
  // lark-cli uses +record-batch-create --json; response: data.records[0].record_id
  const exec = (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: JSON.stringify({ ok: true, data: { records: [{ record_id: "recNEW123" }] } }) };
  };
  const id = createTriageRecord(FITS, ISSUE, { exec });
  assert.equal(calls[0].cmd, "lark-cli");
  assert.ok(calls[0].args.includes("+record-batch-create"));
  assert.ok(calls[0].args.includes("--base-token"));
  assert.equal(id, "recNEW123");
});
