import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictComment, verdictLabel, postVerdict } from "./github-writer.mjs";

const FITS = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "Zadanie PK1." };
const LOWCONF = { ...FITS, confidence: 0.4 };
const BACKLOG = { fits: false, package: null, priority: null, order: null, module: null, confidence: 0.6, rationale: "Poza planem uruchomienia." };

test("verdictComment for a fitting verdict names the package and priority in Polish", () => {
  const c = verdictComment(FITS);
  assert.match(c, /Przyjęte do planu/);
  assert.match(c, /PK1/);
  assert.match(c, /P0/);
});

test("verdictComment for backlog explains it goes to backlog", () => {
  const c = verdictComment(BACKLOG);
  assert.match(c, /backlog/i);
  assert.match(c, /Poza planem/);
});

test("verdictComment appends a 'wstępny' notice below confidence threshold", () => {
  assert.match(verdictComment(LOWCONF), /wstępny/i);
  assert.doesNotMatch(verdictComment(FITS), /wstępny/i);
});

test("verdictLabel maps package or backlog", () => {
  assert.equal(verdictLabel(FITS), "triage:PK1");
  assert.equal(verdictLabel(BACKLOG), "triage:backlog");
});

test("postVerdict runs a gh comment and a gh label command against the issue", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push(args.join(" ")); return { stdout: "" }; };
  postVerdict({ number: 42, repo: "o/r" }, FITS, { exec });
  const joined = calls.join("\n");
  assert.match(joined, /issue comment 42/);
  assert.match(joined, /--repo o\/r/);
  assert.match(joined, /issue edit 42/);
  assert.match(joined, /--add-label triage:PK1/);
});
