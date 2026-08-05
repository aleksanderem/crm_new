import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanDigest, fetchPlanRecords, BASE_TOKEN, TABLE_ID } from "./plan.mjs";

const RECS = [
  { fields: { Pakiet: [{ text: "PK1 · Zielona bramka i jedno źródło terminów" }], Priorytet: [{ text: "P0 – blokuje start" }], "Moduł": [{ text: "DevOps" }], "Kolejność": 1, Zadanie: "Przywrócić sekret SUPABASE_DB_URL" } },
  { fields: { Pakiet: [{ text: "PK4 · Domknięty CRUD i przepływ danych" }], Priorytet: [{ text: "P1 – przed pierwszym klientem" }], "Moduł": [{ text: "Gabinet" }], "Kolejność": 2, Zadanie: "Zweryfikować pełny CRUD" } },
];

test("buildPlanDigest produces compact PK-grouped text with tasks", () => {
  const d = buildPlanDigest(RECS);
  assert.match(d, /PK1/);
  assert.match(d, /SUPABASE_DB_URL/);
  assert.match(d, /PK4/);
  assert.match(d, /CRUD/);
  // zwięzłość: nie dłuższe niż ~6k znaków dla 2 rekordów
  assert.ok(d.length < 6000);
});

test("buildPlanDigest tolerates missing/plain fields", () => {
  const d = buildPlanDigest([{ fields: { Zadanie: "Bez pakietu" } }]);
  assert.match(d, /Bez pakietu/);
});

test("fetchPlanRecords builds the correct lark-cli command and parses data.data", () => {
  const calls = [];
  const fakeExec = (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: JSON.stringify({ ok: true, data: {
      fields: [{ name: "Zadanie" }],
      data: [["Rekord A"]],
    } }) };
  };
  const recs = fetchPlanRecords({ exec: fakeExec });
  assert.equal(calls[0].cmd, "lark-cli");
  assert.ok(calls[0].args.includes("+record-list"));
  assert.ok(calls[0].args.includes(BASE_TOKEN));
  assert.ok(calls[0].args.includes(TABLE_ID));
  assert.equal(recs[0].fields.Zadanie, "Rekord A");
});
