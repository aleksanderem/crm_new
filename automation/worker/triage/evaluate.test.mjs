import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTriagePrompt, evaluateIssue } from "./evaluate.mjs";

const ISSUE = { number: 42, title: "Sekret SUPABASE_DB_URL pusty", body: "CI pada na migracjach", login: "someone" };
const DIGEST = "### PK1\n- [P0|DevOps|kol 1] Przywrócić sekret SUPABASE_DB_URL";

test("buildTriagePrompt includes the issue and the plan digest and demands JSON", () => {
  const p = buildTriagePrompt(ISSUE, DIGEST);
  assert.match(p, /SUPABASE_DB_URL/);
  assert.match(p, /PK1/);
  assert.match(p, /JSON/i);
  assert.match(p, /fits/);
});

test("evaluateIssue returns a parsed verdict from the LLM output", async () => {
  const fakeLLM = async () => JSON.stringify({
    fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps",
    confidence: 0.95, rationale: "Dokładnie zadanie PK1.",
  });
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.package, "PK1");
  assert.equal(v.fits, true);
});

test("evaluateIssue extracts JSON when the LLM wraps it in prose/fences", async () => {
  const fakeLLM = async () => "Oto werdykt:\n```json\n{\"fits\":false,\"confidence\":0.3,\"rationale\":\"Poza planem\"}\n```\nkoniec";
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.fits, false);
  assert.equal(v.package, null);
});

test("evaluateIssue throws when the LLM output has no JSON object", async () => {
  const fakeLLM = async () => "nie wiem";
  await assert.rejects(() => evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM }), /verdict/i);
});

test("evaluateIssue retries and recovers when the first LLM answer has no JSON", async () => {
  let n = 0;
  const fakeLLM = async () => (n++ === 0
    ? "Przepraszam, nie mogę teraz odpowiedzieć."
    : JSON.stringify({ fits: true, package: "PK1", priority: "P0", order: 1, confidence: 0.9, rationale: "ok" }));
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.package, "PK1");
  assert.equal(n, 2); // retried once after the junk answer
});

test("evaluateIssue retries when the first JSON is a malformed verdict", async () => {
  let n = 0;
  const fakeLLM = async () => (n++ === 0
    ? '{"fits":true,"package":"PK99","priority":"P0"}' // unknown package -> parseVerdict throws
    : JSON.stringify({ fits: false, confidence: 0.2, rationale: "backlog" }));
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.fits, false);
  assert.equal(n, 2);
});

test("evaluateIssue gives up after the configured attempts", async () => {
  let n = 0;
  const fakeLLM = async () => { n++; return "wciąż nie JSON"; };
  await assert.rejects(() => evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM, attempts: 2 }), /verdict/i);
  assert.equal(n, 2); // exactly `attempts` calls
});

test("evaluateIssue handles JSON whose string values contain braces", async () => {
  const fakeLLM = async () => '{"fits":true,"package":"PK1","priority":"P0","order":1,"module":"DevOps","confidence":0.9,"rationale":"Dotyczy { bramki } CI"}';
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.package, "PK1");
  assert.match(v.rationale, /bramki/);
});
