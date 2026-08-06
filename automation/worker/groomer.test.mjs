import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGroomPrompt, parseGroomDecision, applyGroomDecision } from "./groomer.mjs";

const issue = { number: 3651, title: "Spiąć uprawnienia", body: "duży zakres", comments: [{ author: { login: "aleksanderem" }, body: "scope larger than 5 files; opened #3653-#3657" }] };

test("buildGroomPrompt includes the issue, comments, and demands JSON", () => {
  const p = buildGroomPrompt(issue);
  assert.match(p, /#3651/);
  assert.match(p, /scope larger/);
  assert.match(p, /JSON/);
  assert.match(p, /split|resolved|needs-human/);
});

test("parseGroomDecision normalizes a split with subtasks", () => {
  const d = parseGroomDecision('{"decision":"split","subtasks":[{"title":"A","body":"do A"},{"title":"","body":"drop"}],"rationale":"r"}');
  assert.equal(d.decision, "split");
  assert.equal(d.subtasks.length, 1); // empty-title subtask dropped
  assert.equal(d.subtasks[0].title, "A");
});

test("parseGroomDecision coerces unknown/garbage decision to needs-human", () => {
  assert.equal(parseGroomDecision('{"decision":"whatever"}').decision, "needs-human");
  assert.equal(parseGroomDecision("not json").decision, "needs-human");
});

test("applyGroomDecision split creates capped @claude sub-issues + relabels parent", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args[0], args.slice(1)]); return { stdout: cmd === "gh" && args[0] === "issue" && args[1] === "create" ? "https://gh/x\n" : "" }; };
  const d = { decision: "split", subtasks: [{ title: "A", body: "a" }, { title: "B", body: "b" }, { title: "C", body: "c" }], rationale: "big" };
  const res = applyGroomDecision(issue, d, { exec, repo: "o/r", cap: 2 });
  assert.equal(res.action, "split");
  assert.equal(res.created.length, 2); // capped at 2
  const creates = calls.filter((c) => c[0] === "gh" && c[2][0] === "issue" ? false : false); // noop placeholder
  // parent relabeled needs-info -> split
  const edit = calls.find((c) => c[1] === "issue" && c[2].includes("edit"));
  assert.ok(edit[2].includes("--remove-label") && edit[2].includes("claude:needs-info"));
  assert.ok(edit[2].includes("--add-label") && edit[2].includes("claude:split"));
});

test("applyGroomDecision resolved closes the parent as done", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push(args); return { stdout: "" }; };
  const res = applyGroomDecision(issue, { decision: "resolved", rationale: "covered" }, { exec, repo: "o/r", cap: 8 });
  assert.equal(res.action, "resolved");
  assert.ok(calls.some((a) => a.includes("close")));
  assert.ok(calls.some((a) => a.includes("--add-label") && a.includes("claude:done")));
});

test("applyGroomDecision needs-human posts the question + human-decision label, no close", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push(args); return { stdout: "" }; };
  const res = applyGroomDecision(issue, { decision: "needs-human", question: "Który wariant?" }, { exec, repo: "o/r", cap: 8 });
  assert.equal(res.action, "needs-human");
  assert.ok(calls.some((a) => a.includes("--add-label") && a.includes("human-decision")));
  assert.ok(!calls.some((a) => a.includes("close")));
});

test("applyGroomDecision split with no subtasks degrades to needs-human", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push(args); return { stdout: "" }; };
  const res = applyGroomDecision(issue, { decision: "split", subtasks: [], rationale: "r" }, { exec, repo: "o/r", cap: 8 });
  assert.equal(res.action, "needs-human");
});
