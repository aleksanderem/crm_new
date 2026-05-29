/**
 * Translates known English notification title/message templates that are
 * stored in the database (written by Convex mutations such as the
 * appointment status-change handlers in `convex/gabinet/appointments.ts`)
 * into the user's current language at render time.
 *
 * Mirrors the approach used for activity descriptions in
 * `src/components/activity-timeline/translate-description.ts`: we keep the
 * stored payload in English so existing rows render correctly after a
 * language switch, and pattern-match here on a small set of known templates.
 * Unrecognised strings are returned unchanged.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Translator = (...args: any[]) => any;

interface Rule {
  pattern: RegExp;
  build: (match: RegExpMatchArray, t: Translator) => string;
}

const APPOINTMENT_STATUS_KEYS = new Set([
  "scheduled",
  "pending_confirmation",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

function translateAppointmentStatus(status: string, t: Translator): string {
  if (APPOINTMENT_STATUS_KEYS.has(status)) {
    return t(`gabinet.appointments.statuses.${status}`, status);
  }
  return status;
}

const titleRules: Rule[] = [
  {
    pattern: /^Appointment status changed$/,
    build: (_m, t) =>
      t(
        "notifications.descriptions.appointmentStatusChangedTitle",
        "Appointment status changed",
      ),
  },
  {
    pattern: /^Appointment confirmed via SMS$/,
    build: (_m, t) =>
      t(
        "notifications.descriptions.appointmentConfirmedViaSmsTitle",
        "Appointment confirmed via SMS",
      ),
  },
  {
    pattern: /^Appointment cancelled via SMS$/,
    build: (_m, t) =>
      t(
        "notifications.descriptions.appointmentCancelledViaSmsTitle",
        "Appointment cancelled via SMS",
      ),
  },
  {
    pattern: /^Appointment cancelled$/,
    build: (_m, t) =>
      t(
        "notifications.descriptions.appointmentCancelledTitle",
        "Appointment cancelled",
      ),
  },
];

const messageRules: Rule[] = [
  {
    pattern: /^Appointment status changed to "(.+)" from patient SMS reply$/,
    build: (m, t) =>
      t("notifications.descriptions.appointmentStatusChangedViaSmsMessage", {
        defaultValue:
          'Appointment status changed to "{{status}}" from patient SMS reply',
        status: translateAppointmentStatus(m[1], t),
      }),
  },
  {
    pattern: /^Appointment status changed to "(.+)"$/,
    build: (m, t) =>
      t("notifications.descriptions.appointmentStatusChangedMessage", {
        defaultValue: 'Appointment status changed to "{{status}}"',
        status: translateAppointmentStatus(m[1], t),
      }),
  },
  {
    pattern: /^An appointment has been cancelled: (.+)$/,
    build: (m, t) =>
      t("notifications.descriptions.appointmentCancelledMessageWithReason", {
        defaultValue: "An appointment has been cancelled: {{reason}}",
        reason: m[1],
      }),
  },
  {
    pattern: /^An appointment has been cancelled$/,
    build: (_m, t) =>
      t(
        "notifications.descriptions.appointmentCancelledMessage",
        "An appointment has been cancelled",
      ),
  },
];

function applyRules(
  input: string | undefined,
  rules: Rule[],
  t: Translator | undefined,
): string | undefined {
  if (!input || !t) return input;
  for (const rule of rules) {
    const match = input.match(rule.pattern);
    if (match) return rule.build(match, t);
  }
  return input;
}

export function translateNotificationTitle(
  title: string | undefined,
  t: Translator | undefined,
): string | undefined {
  return applyRules(title, titleRules, t);
}

export function translateNotificationMessage(
  message: string | undefined,
  t: Translator | undefined,
): string | undefined {
  return applyRules(message, messageRules, t);
}
