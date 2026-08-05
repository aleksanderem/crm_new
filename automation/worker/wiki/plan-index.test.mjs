import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPlanRecordsWithIds, buildDeltaDigest, resolveRecordId } from "./plan-index.mjs";

const recordListJson = JSON.stringify({
  data: {
    fields: [{ name: "Pakiet" }, { name: "Zadanie" }, { name: "Kolejność" }, { name: "Status realizacji" }],
    data: [
      [{ text: "PK1" }, "Zielona bramka CI", 1, "Do zrobienia"],
      [{ text: "PK2" }, "Uprawnienia backend", 2, "Do zrobienia"],
    ],
    record_id_list: ["recAAA", "recBBB"],
  },
});

test("fetchPlanRecordsWithIds zips record_id_list with fields", () => {
  const recs = fetchPlanRecordsWithIds({ exec: () => ({ stdout: recordListJson }) });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].record_id, "recAAA");
  assert.equal(recs[0].fields["Zadanie"], "Zielona bramka CI");
  assert.equal(recs[1].record_id, "recBBB");
});

test("buildDeltaDigest tags each line with its record id", () => {
  const recs = fetchPlanRecordsWithIds({ exec: () => ({ stdout: recordListJson }) });
  const digest = buildDeltaDigest(recs);
  assert.match(digest, /\[recAAA\]/);
  assert.match(digest, /Zielona bramka CI/);
  assert.match(digest, /### PK1/);
});

test("resolveRecordId finds a known record and returns null for unknown/none", () => {
  const recs = fetchPlanRecordsWithIds({ exec: () => ({ stdout: recordListJson }) });
  assert.equal(resolveRecordId(recs, { recordId: "recBBB" }).fields["Zadanie"], "Uprawnienia backend");
  assert.equal(resolveRecordId(recs, { recordId: "recZZZ" }), null);
  assert.equal(resolveRecordId(recs, { recordId: null }), null);
});
