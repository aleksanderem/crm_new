import type { TFunction } from "i18next";

// Snake_case Postgres column name → Polish form label. Used to turn raw
// backend errors like `null value in column "duration"` into something the
// end-user can act on (#1647 — generic "nieprawidłowe dane" toast hid which
// field was wrong). Treatment-specific entries are listed first; the map is
// shared across domains since column names rarely collide.
const COLUMN_LABEL_MAP: Record<string, string> = {
  name: "Nazwa",
  duration: "Czas trwania",
  price: "Cena",
  currency: "Waluta",
  tax_rate: "Stawka VAT",
  tax_exempt: "Zwolnienie z VAT",
  color: "Kolor",
  category: "Kategoria",
  category_id: "Kategoria",
  tag_ids: "Tagi",
  description: "Opis",
  contraindications: "Przeciwwskazania",
  preparation_instructions: "Instrukcje przygotowania",
  aftercare_instructions: "Zalecenia po zabiegu",
  required_equipment: "Wymagany sprzęt",
  required_equipment_ids: "Wymagany sprzęt",
  requires_approval: "Wymaga zatwierdzenia",
  treatment_count: "Liczba zabiegów w pakiecie",
  package_id: "Powiązany pakiet",
  organization_id: "Organizacja",
  created_by: "Utworzone przez",
};

function humanFieldLabel(rawField: string): string {
  const snake = rawField
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
  return COLUMN_LABEL_MAP[snake] ?? COLUMN_LABEL_MAP[rawField] ?? rawField;
}

// Best-effort extraction of "which field" and "why" from raw Postgres /
// Convex validator error messages. Returns `null` when we cannot identify a
// specific field — callers fall back to the generic invalidArguments toast.
export interface FieldValidationDetail {
  /** Human-readable Polish label for the offending field. */
  fieldLabel: string;
  /** Raw column or argument name as it appeared in the backend message. */
  rawField: string;
  /** Short Polish reason suitable for inclusion in a toast. */
  reason: string;
}

export function extractFieldValidationDetail(
  msg: string,
): FieldValidationDetail | null {
  // Postgres: null value in column "X" of relation "..." violates not-null
  const nullCol = msg.match(/null value in column "([^"]+)"/i);
  if (nullCol) {
    return {
      rawField: nullCol[1],
      fieldLabel: humanFieldLabel(nullCol[1]),
      reason: "to pole jest wymagane",
    };
  }

  // Postgres: column "X" of relation "..." does not exist (also raw column
  // missing — PGRST204 is caught separately by the schemaCache matcher).
  const missingCol = msg.match(/column "([^"]+)" (?:of relation [^ ]+ )?does not exist/i);
  if (missingCol) {
    return {
      rawField: missingCol[1],
      fieldLabel: humanFieldLabel(missingCol[1]),
      reason: "kolumna nie istnieje w bazie",
    };
  }

  // Postgres: invalid input syntax for type X: "Y"  (no column in message,
  // so we can only report the type).
  const invalidSyntax = msg.match(/invalid input syntax for type (\w+)(?:: "([^"]*)")?/i);
  if (invalidSyntax) {
    return {
      rawField: invalidSyntax[1],
      fieldLabel: invalidSyntax[2]
        ? `wartość "${invalidSyntax[2]}"`
        : invalidSyntax[1],
      reason: `nieprawidłowy format (oczekiwano: ${invalidSyntax[1]})`,
    };
  }

  // Postgres: numeric field overflow
  const overflow = msg.match(/numeric field overflow/i);
  if (overflow) {
    return {
      rawField: "numeric",
      fieldLabel: "Wartość liczbowa",
      reason: "liczba jest za duża",
    };
  }

  // Postgres: value too long for type character varying(N)
  const tooLong = msg.match(/value too long for type [^,]+/i);
  if (tooLong) {
    return {
      rawField: "string",
      fieldLabel: "Tekst",
      reason: "wartość jest za długa",
    };
  }

  // Postgres: violates check constraint "X" — extract constraint name.
  const checkCon = msg.match(/violates check constraint "([^"]+)"/i);
  if (checkCon) {
    return {
      rawField: checkCon[1],
      fieldLabel: humanFieldLabel(checkCon[1]),
      reason: "wartość nie spełnia ograniczenia",
    };
  }

  // Postgres: violates foreign key constraint "X" — happens when a referenced
  // row (e.g. selected package, category) no longer exists.
  const fkCon = msg.match(/violates foreign key constraint "([^"]+)"/i);
  if (fkCon) {
    return {
      rawField: fkCon[1],
      fieldLabel: humanFieldLabel(fkCon[1]),
      reason: "powiązany rekord nie istnieje",
    };
  }

  // Convex: Value '...' for argument 'X' is not a valid value
  // (also matches "Value ... does not match validator").
  const convexArg = msg.match(/(?:for argument|argument) ['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/i);
  if (convexArg) {
    const rawField = convexArg[1];
    return {
      rawField,
      fieldLabel: humanFieldLabel(rawField),
      reason: "nieprawidłowa wartość",
    };
  }

  // Convex validator (server-side) errors carry no "for argument 'X'" prefix —
  // their shape is `Validator error: <reason>` with optional path info like
  // `at path '<arg>.<field>[<idx>].<subfield>'`. Without this branch the
  // broad `Validator error` pattern still matches in TREATMENT_ERROR_MAP /
  // GENERIC_ERROR_MAP, but no field detail is extracted, so the user sees
  // the generic "nieprawidłowe dane" fallback (issue #1941).
  const validatorAtPath = msg.match(
    /Validator error:[^]*?at path ['"`]?([A-Za-z_][A-Za-z0-9_]*)(?:[.[][^'"`]*)?['"`]?/i,
  );
  if (validatorAtPath) {
    const rawField = validatorAtPath[1];
    return {
      rawField,
      fieldLabel: humanFieldLabel(rawField),
      reason: "nieprawidłowa wartość",
    };
  }

  const validatorMissing = msg.match(
    /Validator error: Missing required field ['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/i,
  );
  if (validatorMissing) {
    const rawField = validatorMissing[1];
    return {
      rawField,
      fieldLabel: humanFieldLabel(rawField),
      reason: "to pole jest wymagane",
    };
  }

  const validatorUnexpected = msg.match(
    /Validator error: Unexpected field ['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/i,
  );
  if (validatorUnexpected) {
    const rawField = validatorUnexpected[1];
    return {
      rawField,
      fieldLabel: humanFieldLabel(rawField),
      reason: "nieoczekiwane pole",
    };
  }

  // Generic `Validator error: Expected X, got Y` — no field name available,
  // so report the type mismatch.
  const validatorExpected = msg.match(
    /Validator error: Expected ['"`]?([A-Za-z_][A-Za-z0-9_]*)['"`]?,? got ['"`]?([^'"`,\n]+?)['"`]?(?:\s|$|,)/i,
  );
  if (validatorExpected) {
    return {
      rawField: "validator",
      fieldLabel: `oczekiwano: ${validatorExpected[1]}`,
      reason: `otrzymano: ${validatorExpected[2]}`,
    };
  }

  return null;
}

// Convex Action errors arrive on the client as plain `Error` instances whose
// `.message` is wrapped with the framework's diagnostic prefix, e.g.:
//
//   [CONVEX A(gabinet/appointments:update)] [Request ID: xxxx] Server Error
//   Uncaught Error: Conflicts with existing appointment
//       at handler (../convex/gabinet/appointments.ts:1286:13)
//       ...
//   Called by client
//
// `extractActionErrorMessage` peels off this wrapping and returns the inner
// thrown message so it can be shown to end users.
export function extractActionErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return cleanConvexMessage(err.message);
  }
  if (typeof err === "string") return cleanConvexMessage(err);
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function cleanConvexMessage(raw: string): string {
  let msg = raw;

  // Drop the leading "[CONVEX ...] [Request ID: ...] Server Error" banner.
  msg = msg.replace(/^\s*\[CONVEX[^\]]*\][^\n]*\n?/i, "");
  msg = msg.replace(/^\s*\[Request ID:[^\]]*\][^\n]*\n?/i, "");
  msg = msg.replace(/^\s*Server Error\s*\n?/i, "");

  // Convex wraps the thrown reason as "Uncaught Error: <msg>" (or similar).
  const uncaught = msg.match(
    /Uncaught\s+(?:Error|ConvexError|ArgumentValidationError|TypeError)\s*:\s*([^\n]+)/i,
  );
  if (uncaught) {
    return uncaught[1].trim();
  }

  // Strip stack trace lines and any "Called by client" suffix.
  const firstLine = msg.split(/\r?\n/).find((line) => line.trim().length > 0);
  return (firstLine ?? msg).trim();
}

const APPOINTMENT_ERROR_MAP: Array<{
  test: (msg: string) => boolean;
  key: string;
  fallback: string;
}> = [
  {
    test: (m) => /conflicts with existing appointment|time slot conflict/i.test(m),
    key: "gabinet.appointments.errors.conflict",
    fallback: "Termin koliduje z inną wizytą.",
  },
  {
    test: (m) => /room is occupied/i.test(m),
    key: "gabinet.appointments.errors.roomConflict",
    fallback: "Gabinet jest zajęty w tym terminie.",
  },
  {
    test: (m) => /employee is on leave|conflicts with employee leave/i.test(m),
    key: "gabinet.appointments.errors.employeeLeave",
    fallback: "Pracownik jest na urlopie w tym terminie.",
  },
  {
    test: (m) => /employee is not working on this day/i.test(m),
    key: "gabinet.appointments.errors.employeeNotWorking",
    fallback: "Pracownik nie pracuje w tym dniu.",
  },
  {
    test: (m) => /outside employee working hours/i.test(m),
    key: "gabinet.appointments.errors.outsideEmployeeHours",
    fallback: "Termin poza godzinami pracy pracownika.",
  },
  {
    test: (m) => /clinic is closed on this day/i.test(m),
    key: "gabinet.appointments.errors.clinicClosed",
    fallback: "Gabinet jest zamknięty w tym dniu.",
  },
  {
    test: (m) => /outside clinic working hours/i.test(m),
    key: "gabinet.appointments.errors.outsideClinicHours",
    fallback: "Termin poza godzinami pracy gabinetu.",
  },
  {
    test: (m) => /^conflicts with:/i.test(m),
    key: "gabinet.appointments.errors.conflictNamed",
    fallback: "Termin koliduje z innym wydarzeniem w kalendarzu.",
  },
  {
    test: (m) => /appointment start time is in the past/i.test(m),
    key: "gabinet.appointments.errors.startInPast",
    fallback: "Nie można utworzyć wizyty z czasem w przeszłości.",
  },
  {
    test: (m) => /appointment not found/i.test(m),
    key: "gabinet.appointments.errors.notFound",
    fallback: "Nie znaleziono wizyty. Odśwież kalendarz i spróbuj ponownie.",
  },
  {
    test: (m) => /permission denied/i.test(m),
    key: "gabinet.appointments.errors.permissionDenied",
    fallback: "Brak uprawnień do edycji tej wizyty.",
  },
  {
    test: (m) => /cannot transition from/i.test(m),
    key: "gabinet.appointments.errors.invalidStatusTransition",
    fallback: "Nie można zmienić statusu wizyty z bieżącej wartości.",
  },
  {
    test: (m) => /argumentvalidationerror|value does not match validator/i.test(m),
    key: "gabinet.appointments.errors.invalidArguments",
    fallback: "Nie udało się zapisać zmian — nieprawidłowe dane wizyty.",
  },
];

// Convert a Convex action error into a user-friendly toast message.
// Falls back to a provided generic message when nothing matches.
export function formatAppointmentError(
  err: unknown,
  t: TFunction,
  fallback: { key: string; defaultValue: string },
): string {
  const inner = extractActionErrorMessage(err);
  for (const entry of APPOINTMENT_ERROR_MAP) {
    if (entry.test(inner)) {
      return t(entry.key, { defaultValue: entry.fallback });
    }
  }
  return t(fallback.key, { defaultValue: fallback.defaultValue });
}

const TREATMENT_ERROR_MAP: Array<{
  test: (msg: string) => boolean;
  key: string;
  fallback: string;
}> = [
  {
    test: (m) => /treatment not found/i.test(m),
    key: "gabinet.treatments.errors.notFound",
    fallback: "Nie znaleziono zabiegu. Odśwież listę i spróbuj ponownie.",
  },
  {
    test: (m) => /variant not found|parent treatment not found/i.test(m),
    key: "gabinet.treatments.errors.variantNotFound",
    fallback: "Nie znaleziono wariantu zabiegu.",
  },
  {
    test: (m) => /permission denied/i.test(m),
    key: "gabinet.treatments.errors.permissionDenied",
    fallback: "Brak uprawnień do tej operacji na zabiegu.",
  },
  {
    test: (m) => /pgrst204|schema cache/i.test(m),
    key: "gabinet.treatments.errors.schemaCache",
    fallback:
      "Brak kolumny w schemacie bazy — najpewniej nie zastosowano migracji. Uruchom `npm run migrations:apply` i odśwież stronę.",
  },
  {
    test: (m) =>
      /argumentvalidationerror|value does not match validator|validator error|invalid input syntax|violates .* constraint|column .* does not exist|null value in column/i.test(
        m,
      ),
    key: "gabinet.treatments.errors.invalidArguments",
    fallback: "Nie udało się zapisać zabiegu — nieprawidłowe dane.",
  },
  {
    test: (m) => /supabasedb\.(get|getmany|patch|delete|insert|query)/i.test(m),
    key: "gabinet.treatments.errors.storage",
    fallback: "Nie udało się zapisać zabiegu — błąd magazynu danych. Spróbuj ponownie.",
  },
];

// Convert a Convex action error from the treatments domain into a
// user-friendly toast message. Falls back to a provided generic message when
// nothing matches so raw English Supabase/validator output never reaches end
// users.
export function formatTreatmentError(
  err: unknown,
  t: TFunction,
  fallback: { key: string; defaultValue: string },
): string {
  const inner = extractActionErrorMessage(err);
  for (const entry of TREATMENT_ERROR_MAP) {
    if (entry.test(inner)) {
      if (entry.key === "gabinet.treatments.errors.invalidArguments") {
        const detail = extractFieldValidationDetail(inner);
        if (detail) {
          return t("gabinet.treatments.errors.invalidField", {
            field: detail.fieldLabel,
            reason: detail.reason,
            defaultValue: `Nieprawidłowe dane: ${detail.fieldLabel} — ${detail.reason}.`,
          });
        }
      }
      return t(entry.key, { defaultValue: entry.fallback });
    }
  }
  return t(fallback.key, { defaultValue: fallback.defaultValue });
}

const GENERIC_ERROR_MAP: Array<{
  test: (msg: string) => boolean;
  key: string;
  fallback: string;
}> = [
  {
    test: (m) => /permission denied/i.test(m),
    key: "common.errors.permissionDenied",
    fallback: "Brak uprawnień do tej operacji.",
  },
  {
    test: (m) => /pgrst204|schema cache/i.test(m),
    key: "common.errors.schemaCache",
    fallback:
      "Brak kolumny w schemacie bazy — najpewniej nie zastosowano migracji. Uruchom `npm run migrations:apply` i odśwież stronę.",
  },
  {
    test: (m) =>
      /argumentvalidationerror|value does not match validator|validator error|invalid input syntax|violates .* constraint|column .* does not exist|null value in column/i.test(
        m,
      ),
    key: "common.errors.invalidArguments",
    fallback: "Nieprawidłowe dane. Sprawdź formularz i spróbuj ponownie.",
  },
  {
    test: (m) => /supabasedb\.(get|getmany|patch|delete|insert|query)/i.test(m),
    key: "common.errors.storage",
    fallback: "Błąd magazynu danych. Spróbuj ponownie.",
  },
];

// Generic translator for raw Convex action errors. Recognises universal
// patterns (permission denied, validator errors, raw Supabase storage errors)
// and otherwise returns a caller-provided fallback message, so raw English
// backend output never leaks to end users.
export function formatActionError(
  err: unknown,
  t: TFunction,
  fallback: { key: string; defaultValue: string },
): string {
  const inner = extractActionErrorMessage(err);
  for (const entry of GENERIC_ERROR_MAP) {
    if (entry.test(inner)) {
      if (entry.key === "common.errors.invalidArguments") {
        const detail = extractFieldValidationDetail(inner);
        if (detail) {
          return t("common.errors.invalidField", {
            field: detail.fieldLabel,
            reason: detail.reason,
            defaultValue: `Nieprawidłowe dane: ${detail.fieldLabel} — ${detail.reason}.`,
          });
        }
      }
      return t(entry.key, { defaultValue: entry.fallback });
    }
  }
  return t(fallback.key, { defaultValue: fallback.defaultValue });
}
