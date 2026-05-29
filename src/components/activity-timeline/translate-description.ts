/**
 * Translates known English activity-description templates that are stored
 * in the database (e.g. `Updated appointment`, `Cancelled appointment: <reason>`)
 * into the user's current language.
 *
 * Descriptions are written by Convex mutations at the time of the action and
 * persisted as plain English. The timeline renders them as-is, which leaks
 * English copy into otherwise Polish UI. Rather than back-fill the DB, we
 * pattern-match known templates here and return the translated equivalent.
 *
 * If the input does not match any known template, it is returned unchanged so
 * free-text and not-yet-covered descriptions still render.
 */

// Loose translator shape compatible with i18next's TFunction.
// Returning `any` avoids depending on i18next's generic types while still
// letting callers pass `useTranslation().t` directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Translator = (...args: any[]) => any;

interface Rule {
  pattern: RegExp;
  build: (match: RegExpMatchArray, t: Translator) => string;
}

const rules: Rule[] = [
  {
    pattern: /^Updated appointment$/,
    build: (_m, t) => t("activityTimeline.descriptions.updatedAppointment", "Updated appointment"),
  },
  {
    pattern: /^Created appointment for (.+) at (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdAppointment", {
        defaultValue: "Created appointment for {{date}} at {{time}}",
        date: m[1],
        time: m[2],
      }),
  },
  {
    pattern: /^Cancelled appointment: (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.cancelledAppointmentWithReason", {
        defaultValue: "Cancelled appointment: {{reason}}",
        reason: m[1],
      }),
  },
  {
    pattern: /^Cancelled appointment$/,
    build: (_m, t) => t("activityTimeline.descriptions.cancelledAppointment", "Cancelled appointment"),
  },
  {
    pattern: /^Status changed from (.+) to (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.statusChanged", {
        defaultValue: "Status changed from {{from}} to {{to}}",
        from: m[1],
        to: m[2],
      }),
  },
  {
    pattern: /^Appointment confirmed via SMS reply$/,
    build: (_m, t) =>
      t(
        "activityTimeline.descriptions.appointmentConfirmedViaSms",
        "Appointment confirmed via SMS reply",
      ),
  },
  {
    pattern: /^Appointment cancelled via SMS reply$/,
    build: (_m, t) =>
      t(
        "activityTimeline.descriptions.appointmentCancelledViaSms",
        "Appointment cancelled via SMS reply",
      ),
  },
  {
    pattern: /^Automation run$/,
    build: (_m, t) => t("activityTimeline.descriptions.automationRun", "Automation run"),
  },
  {
    pattern: /^Automation: (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.automationNamed", {
        defaultValue: "Automation: {{name}}",
        name: m[1],
      }),
  },
];

export function translateActivityDescription(
  description: string | undefined,
  t: Translator | undefined,
): string | undefined {
  if (!description || !t) return description;
  for (const rule of rules) {
    const match = description.match(rule.pattern);
    if (match) return rule.build(match, t);
  }
  return description;
}
