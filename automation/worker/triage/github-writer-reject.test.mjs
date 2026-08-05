// automation/worker/triage/github-writer-reject.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { postRejection } from "./github-writer.mjs";

test("postRejection comments and adds the triage:rejected label", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "" }; };
  const issue = { number: 42, repo: "o/r" };
  postRejection(issue, "⛔ Odrzucone.", { exec });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["gh", ["issue", "comment", "42", "--repo", "o/r", "--body", "⛔ Odrzucone."]]);
  assert.deepEqual(calls[1], ["gh", ["issue", "edit", "42", "--repo", "o/r", "--add-label", "triage:rejected"]]);
});
