import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikePlanImpact } from "./detect.mjs";

test("fires on completion language", () => {
  assert.equal(looksLikePlanImpact({ title: "To już zrobione", body: "" }), true);
  assert.equal(looksLikePlanImpact({ title: "", body: "This is already done" }), true);
});

test("fires on bug / blocker language (a regression to readiness)", () => {
  assert.equal(looksLikePlanImpact({ title: "Błąd w kalendarzu gabinetu", body: "kalendarz nie działa i blokuje wizyty" }), true);
  assert.equal(looksLikePlanImpact({ title: "Crash on save", body: "this breaks the flow" }), true);
});

test("does not fire on a neutral feature ask", () => {
  assert.equal(looksLikePlanImpact({ title: "Dodać eksport CSV", body: "Przydałby się przycisk eksportu" }), false);
});
