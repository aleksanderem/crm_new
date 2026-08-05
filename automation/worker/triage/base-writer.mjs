import { BASE_TOKEN, TABLE_ID } from "./plan.mjs";

const PK_LABEL = {
  PK1: "PK1 · Zielona bramka i jedno źródło terminów",
  PK2: "PK2 · Uprawnienia spięte backend i UI",
  PK3: "PK3 · Ustawienia z realnym efektem",
  PK4: "PK4 · Domknięty CRUD i przepływ danych",
  PK5: "PK5 · Rozliczenia do zamknięcia dnia",
  PK6: "PK6 · Dane bezpieczne i odtwarzalne",
  PK7: "PK7 · Widoczność produkcji",
  PK8: "PK8 · Wdrożenie u pierwszej placówki",
  PK9: "PK9 · Sprzedaż i rozliczenia platformy",
};
const PR_LABEL = {
  P0: "P0 – blokuje start",
  P1: "P1 – przed pierwszym klientem",
  P2: "P2 – po starcie",
};

// Map a Verdict + issue into a Base "Team OKR Tasks" fields object. Fitting
// verdicts get package/priority/order/module; backlog verdicts carry only the
// source + description so nothing is lost. `Triage: true` distinguishes these
// records from native plan rows.
export function buildRecordFields(verdict, issue) {
  const fields = {
    "Zadanie": issue.title,
    "Opis": (verdict.rationale || "") + `\n\nŹródło: ${issue.url}`,
    "Źródło": issue.url,
    "Status realizacji": "Do zrobienia",
    "Triage": true,
  };
  if (verdict.fits) {
    fields["Pakiet"] = PK_LABEL[verdict.package];
    fields["Priorytet"] = PR_LABEL[verdict.priority];
    if (verdict.order !== null) fields["Kolejność"] = verdict.order;
    if (verdict.module) fields["Moduł"] = verdict.module;
  }
  return fields;
}

// Create a single triage record in Base via lark-cli +record-batch-create.
// NOTE: lark-cli has no +record-create command; the batch variant (with a
// one-element create_records array) is the canonical single-record create path.
// Response shape: { data: { records: [{ record_id: "recXXX" }] } }
export function createTriageRecord(verdict, issue, { exec }) {
  const fields = buildRecordFields(verdict, issue);
  const json = JSON.stringify({ create_records: [fields] });
  const args = ["base", "+record-batch-create", "--base-token", BASE_TOKEN,
                "--table-id", TABLE_ID, "--json", json,
                "--format", "json"];
  const { stdout } = exec("lark-cli", args);
  const parsed = JSON.parse(stdout);
  return parsed.data?.records?.[0]?.record_id ?? null;
}
