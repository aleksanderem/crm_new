import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectPressure, detectMultiAccount, similarity, normalizeTokens,
  relatedLoginsOf, isHarshLogin,
} from "./detect.mjs";

test("detectPressure fires when a pressure phrase is present", () => {
  assert.equal(detectPressure({ title: "PILNE", body: "zrób to teraz!!!" }).hit, true);
  assert.equal(detectPressure({ title: "Pilne: kalendarz gubi terminy", body: "Przy zmianie strefy znikają wizyty, odtworzenie: ..." }).hit, true);
});

test("detectPressure does not fire without a pressure phrase", () => {
  assert.equal(detectPressure({ title: "Literówka w nagłówku", body: "Drobna literówka na stronie ustawień." }).hit, false);
});

test("similarity is ~1 for identical text and low for different", () => {
  const a = "kalendarz gubi terminy przy zmianie strefy czasowej";
  assert.ok(similarity(a, a) > 0.99);
  assert.ok(similarity(a, "zupełnie inny problem dotyczący faktur vat") < 0.2);
});

test("normalizeTokens drops short tokens and punctuation", () => {
  assert.deepEqual(normalizeTokens("Ala ma 2 koty!!!"), ["ala", "koty"]);
});

test("detectMultiAccount flags a near-duplicate from a related account", () => {
  const issue = { title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" };
  const priorIssues = [
    { login: "aslocka2026", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" },
  ];
  const r = detectMultiAccount(issue, { priorIssues });
  assert.equal(r.hit, true);
  assert.equal(r.relatedLogin, "aslocka2026");
});

test("detectMultiAccount ignores unrelated prior issues", () => {
  const issue = { title: "Kalendarz gubi terminy", body: "przy zmianie strefy" };
  const priorIssues = [{ login: "aslocka2026", title: "Faktury VAT", body: "błędna stawka" }];
  assert.equal(detectMultiAccount(issue, { priorIssues }).hit, false);
});

test("relatedLoginsOf and isHarshLogin know the known alt pair", () => {
  assert.deepEqual(relatedLoginsOf("aslocka"), ["aslocka2026"]);
  assert.deepEqual(relatedLoginsOf("ASlocka2026"), ["aslocka"]);
  assert.deepEqual(relatedLoginsOf("randomdev"), []);
  assert.equal(isHarshLogin("aslocka"), true);
  assert.equal(isHarshLogin("randomdev"), false);
});
