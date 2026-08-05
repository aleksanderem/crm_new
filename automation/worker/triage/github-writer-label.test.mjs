import { test } from "node:test";
import assert from "node:assert/strict";
import { labelIssue } from "./github-writer.mjs";

test("labelIssue adds the given label to the issue", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "" }; };
  labelIssue({ number: 9, repo: "o/r" }, "triage:plan-change", { exec });
  assert.deepEqual(calls[0], ["gh", ["issue", "edit", "9", "--repo", "o/r", "--add-label", "triage:plan-change"]]);
});
