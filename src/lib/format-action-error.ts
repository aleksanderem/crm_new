import type { TFunction } from "i18next";

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
    test: (m) =>
      /argumentvalidationerror|value does not match validator|invalid input syntax|violates .* constraint|column .* does not exist|null value in column/i.test(
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
      return t(entry.key, { defaultValue: entry.fallback });
    }
  }
  return t(fallback.key, { defaultValue: fallback.defaultValue });
}
