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

test("evaluateIssue handles JSON whose string values contain braces", async () => {
  const fakeLLM = async () => '{"fits":true,"package":"PK1","priority":"P0","order":1,"module":"DevOps","confidence":0.9,"rationale":"Dotyczy { bramki } CI"}';
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.package, "PK1");
  assert.match(v.rationale, /bramki/);
});
