// automation/worker/policy/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureStrikeSchema, isBanned, getStrike } from "./strikes.mjs";
import { evaluatePolicyPre, pressureOverride } from "./engine.mjs";

function db0() {
  const db = new Database(":memory:");
  ensureStrikeSchema(db);
  return db;
}
const clock = () => 1000;
const dup = { login: "aslocka", repo: "aleksanderem/crm_new", url: "u", title: "Dup", body: "identyczna treść zgłoszenia do porównania" };
const priorDup = [{ login: "aslocka2026", title: "Dup", body: "identyczna treść zgłoszenia do porównania" }];

test("evaluatePolicyPre passes a clean issue (no abuse signal)", () => {
  const db = db0();
  const issue = { login: "dev", repo: "o/r", url: "u", title: "Realne zadanie", body: "opis konkretnego zadania z planu, sporo szczegółów technicznych." };
  const r = evaluatePolicyPre(db, issue, { priorIssues: [], now: clock });
  assert.equal(r.blocked, false);
  assert.equal(r.recordedStrike, false);
});

test("evaluatePolicyPre strikes and blocks a multi-account duplicate", () => {
  const db = db0();
  const r = evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.flags, ["multi-account"]);
  assert.equal(r.recordedStrike, true);
  assert.equal(getStrike(db, "aslocka").count, 1);
  assert.match(r.comment, /Strike 1\/5/);
});

test("evaluatePolicyPre bans on the fifth duplicate and includes the ban notice", () => {
  const db = db0();
  let r;
  for (let i = 0; i < 5; i++) r = evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  assert.equal(r.banned, true);
  assert.equal(isBanned(db, "aslocka"), true);
  assert.match(r.comment, /Permanentny ban/);
});

test("evaluatePolicyPre appends the collaborator-removal recommendation on the sixth offense", () => {
  const db = db0();
  let r;
  for (let i = 0; i < 6; i++) r = evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  assert.match(r.comment, /gh api -X DELETE repos\/aleksanderem\/crm_new\/collaborators\/aslocka/);
});

test("evaluatePolicyPre blocks an already-banned user without a new strike", () => {
  const db = db0();
  for (let i = 0; i < 5; i++) evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  const before = getStrike(db, "aslocka").count;
  const clean = { login: "aslocka", repo: "o/r", url: "u", title: "Coś nowego", body: "całkiem inny, merytoryczny opis problemu z detalami" };
  const r = evaluatePolicyPre(db, clean, { priorIssues: [], now: clock });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.flags, ["banned"]);
  assert.equal(r.recordedStrike, false);
  assert.equal(getStrike(db, "aslocka").count, before);
});

test("pressureOverride rejects a non-fitting issue that carries pressure", () => {
  const verdict = { fits: false };
  const issue = { login: "dev", title: "PILNE", body: "zrób to teraz!!!" };
  const r = pressureOverride(verdict, issue);
  assert.equal(r.reject, true);
  assert.match(r.comment, /Presja|presja/);
});

test("pressureOverride never rejects a FITTING issue, even worded urgently", () => {
  const verdict = { fits: true, package: "PK1", priority: "P0" };
  const issue = { login: "dev", title: "PILNE: realny bug", body: "natychmiast, ale to konkretne zadanie z planu" };
  assert.deepEqual(pressureOverride(verdict, issue), { reject: false, comment: null });
});

test("pressureOverride does not reject a non-fitting issue WITHOUT pressure", () => {
  const verdict = { fits: false };
  const issue = { login: "dev", title: "Drobiazg", body: "kosmetyczna zmiana koloru" };
  assert.deepEqual(pressureOverride(verdict, issue), { reject: false, comment: null });
});
