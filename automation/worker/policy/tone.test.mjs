import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pressureComment, strikeComment, banComment, collaboratorRemovalRecommendation,
} from "./tone.mjs";

test("pressureComment is stern, rejects, and warns about the repeatedly-established rule", () => {
  const c = pressureComment({ login: "randomdev" });
  assert.match(c, /Odrzucone/);
  assert.match(c, /[Pp]resja/);
  // warns this rule has been established repeatedly / it is a violation
  assert.match(c, /wielokrotnie|nie po raz pierwszy|ustaleń|zasad/);
});

test("a harsh login gets an even harsher pressure comment than a neutral one", () => {
  const harsh = pressureComment({ login: "aslocka" });
  const neutral = pressureComment({ login: "randomdev" });
  assert.notEqual(harsh, neutral);
  assert.ok(harsh.length >= neutral.length);
});

test("strikeComment shows the counter and threshold", () => {
  const c = strikeComment({ login: "aslocka", count: 3, threshold: 5, reason: "duplikat" });
  assert.match(c, /Strike 3\/5/);
  assert.match(c, /duplikat/);
});

test("banComment names the login and the permanent ban", () => {
  const c = banComment({ login: "aslocka", reason: "5 strike'ów", threshold: 5 });
  assert.match(c, /aslocka/);
  assert.match(c, /[Bb]an/);
});

test("collaboratorRemovalRecommendation prints the exact gh command, human-only", () => {
  const c = collaboratorRemovalRecommendation({ login: "aslocka", repo: "aleksanderem/crm_new" });
  assert.match(c, /gh api -X DELETE repos\/aleksanderem\/crm_new\/collaborators\/aslocka/);
  assert.match(c, /człowieka/);
});
