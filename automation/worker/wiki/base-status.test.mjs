import { test } from "node:test";
import assert from "node:assert/strict";
import { markRecordDone } from "./base-status.mjs";
import { BASE_TOKEN, TABLE_ID } from "../triage/plan.mjs";

test("markRecordDone issues a record-batch-update with the Zrobione status as an array", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "{}" }; };
  markRecordDone("recABC", { exec });
  assert.equal(calls.length, 1);
  const [cmd, args] = calls[0];
  assert.equal(cmd, "lark-cli");
  assert.ok(args.includes("+record-batch-update"));
  assert.ok(args.includes("--base-token") && args.includes(BASE_TOKEN));
  assert.ok(args.includes("--table-id") && args.includes(TABLE_ID));
  const json = JSON.parse(args[args.indexOf("--json") + 1]);
  assert.deepEqual(json, { update_records: { recABC: { "Status realizacji": ["Zrobione"] } } });
});
