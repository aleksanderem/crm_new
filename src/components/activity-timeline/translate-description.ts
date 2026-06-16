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

// Maps the raw English entity tokens written by `convex/automation.ts`
// (`patient`, `appointment`, `employee`, `lead`) to a localized label so the
// rendered "Updated <entity> field … via automation" line does not leak
// English nouns into Polish UI. Falls back to the original token for
// unknown entity types.
function translateAutomationEntityToken(token: string, t: Translator): string {
  const key = `activityTimeline.entityLabels.${token}`;
  const translated = t(key, { defaultValue: token });
  return typeof translated === "string" ? translated : token;
}

const rules: Rule[] = [
  // ----- Appointments (existing) -----
  {
    pattern: /^Updated appointment$/,
    build: (_m, t) => t("activityTimeline.descriptions.updatedAppointment", "Updated appointment"),
  },
  {
    pattern: /^Rescheduled appointment from (\S+) (\S+) to (\S+) (\S+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.rescheduledAppointment", {
        defaultValue:
          "Rescheduled appointment from {{fromDate}} {{fromTime}} to {{toDate}} {{toTime}}",
        fromDate: m[1],
        fromTime: m[2],
        toDate: m[3],
        toTime: m[4],
      }),
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

  // ----- Contacts -----
  {
    pattern: /^Created contact "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdContact", {
        defaultValue: 'Created contact "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated contact "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedContact", {
        defaultValue: 'Updated contact "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Deleted contact "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedContact", {
        defaultValue: 'Deleted contact "{{name}}"',
        name: m[1],
      }),
  },

  // ----- Companies -----
  {
    pattern: /^Created company "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdCompany", {
        defaultValue: 'Created company "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated company "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedCompany", {
        defaultValue: 'Updated company "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Deleted company "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedCompany", {
        defaultValue: 'Deleted company "{{name}}"',
        name: m[1],
      }),
  },

  // ----- Leads -----
  {
    pattern: /^Created lead "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdLead", {
        defaultValue: 'Created lead "{{title}}"',
        title: m[1],
      }),
  },
  {
    pattern: /^Updated lead "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedLead", {
        defaultValue: 'Updated lead "{{title}}"',
        title: m[1],
      }),
  },
  {
    pattern: /^Deleted lead "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedLead", {
        defaultValue: 'Deleted lead "{{title}}"',
        title: m[1],
      }),
  },
  {
    pattern: /^Changed lead status from "(.+)" to "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.changedLeadStatus", {
        defaultValue: 'Changed lead status from "{{from}}" to "{{to}}"',
        from: m[1],
        to: m[2],
      }),
  },
  {
    pattern: /^Moved lead "(.+)" to stage "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.movedLeadToStage", {
        defaultValue: 'Moved lead "{{title}}" to stage "{{stage}}"',
        title: m[1],
        stage: m[2],
      }),
  },

  // ----- Calls -----
  {
    pattern: /^Logged a call with outcome "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.loggedCall", {
        defaultValue: 'Logged a call with outcome "{{outcome}}"',
        outcome: m[1],
      }),
  },
  {
    pattern: /^Updated call$/,
    build: (_m, t) => t("activityTimeline.descriptions.updatedCall", "Updated call"),
  },
  {
    pattern: /^Deleted call$/,
    build: (_m, t) => t("activityTimeline.descriptions.deletedCall", "Deleted call"),
  },

  // ----- Documents -----
  {
    pattern: /^Uploaded document "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.uploadedDocument", {
        defaultValue: 'Uploaded document "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated document "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedDocument", {
        defaultValue: 'Updated document "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Deleted document "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedDocument", {
        defaultValue: 'Deleted document "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Changed document "(.+)" status to "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.changedDocumentStatus", {
        defaultValue: 'Changed document "{{name}}" status to "{{status}}"',
        name: m[1],
        status: m[2],
      }),
  },

  // ----- Products -----
  {
    pattern: /^Created product "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdProduct", {
        defaultValue: 'Created product "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated product "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedProduct", {
        defaultValue: 'Updated product "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Deleted product "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedProduct", {
        defaultValue: 'Deleted product "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Activated product "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.activatedProduct", {
        defaultValue: 'Activated product "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Deactivated product "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deactivatedProduct", {
        defaultValue: 'Deactivated product "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Added product "(.+)" to deal$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.addedProductToDeal", {
        defaultValue: 'Added product "{{name}}" to deal',
        name: m[1],
      }),
  },
  {
    pattern: /^Removed product "(.+)" from deal$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.removedProductFromDeal", {
        defaultValue: 'Removed product "{{name}}" from deal',
        name: m[1],
      }),
  },

  // ----- Organization / membership -----
  {
    pattern: /^Created organization "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdOrganization", {
        defaultValue: 'Created organization "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated organization settings$/,
    build: (_m, t) =>
      t("activityTimeline.descriptions.updatedOrganizationSettings", "Updated organization settings"),
  },
  {
    pattern: /^Invited new member with role "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.invitedMemberWithRole", {
        defaultValue: 'Invited new member with role "{{role}}"',
        role: m[1],
      }),
  },
  {
    pattern: /^Updated member role to "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedMemberRole", {
        defaultValue: 'Updated member role to "{{role}}"',
        role: m[1],
      }),
  },
  {
    pattern: /^Removed a member from the organization$/,
    build: (_m, t) =>
      t("activityTimeline.descriptions.removedMember", "Removed a member from the organization"),
  },
  {
    pattern: /^Invited (\S+) with role "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.invitedEmailWithRole", {
        defaultValue: 'Invited {{email}} with role "{{role}}"',
        email: m[1],
        role: m[2],
      }),
  },
  {
    pattern: /^(\S+) accepted invitation and joined as "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.acceptedInvitation", {
        defaultValue: '{{email}} accepted invitation and joined as "{{role}}"',
        email: m[1],
        role: m[2],
      }),
  },

  // ----- Pipelines / stages -----
  {
    pattern: /^Created pipeline "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdPipeline", {
        defaultValue: 'Created pipeline "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated pipeline "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedPipeline", {
        defaultValue: 'Updated pipeline "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Deleted pipeline "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedPipeline", {
        defaultValue: 'Deleted pipeline "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Added stage "(.+)" to pipeline$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.addedStage", {
        defaultValue: 'Added stage "{{name}}" to pipeline',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated stage "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedStage", {
        defaultValue: 'Updated stage "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Removed stage "(.+)" \(leads migrated\)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.removedStageMigrated", {
        defaultValue: 'Removed stage "{{name}}" (leads migrated)',
        name: m[1],
      }),
  },
  {
    pattern: /^Removed stage "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.removedStage", {
        defaultValue: 'Removed stage "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Reordered pipeline stages$/,
    build: (_m, t) =>
      t("activityTimeline.descriptions.reorderedPipelineStages", "Reordered pipeline stages"),
  },

  // ----- Relationships -----
  {
    pattern: /^Added relationship to (.+) entity$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.addedRelationship", {
        defaultValue: "Added relationship to {{target}} entity",
        target: m[1],
      }),
  },
  {
    pattern: /^Removed relationship to (.+) entity$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.removedRelationship", {
        defaultValue: "Removed relationship to {{target}} entity",
        target: m[1],
      }),
  },

  // ----- Payments -----
  {
    pattern: /^Payment of (.+) (\S+) marked as paid$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.paymentMarkedPaid", {
        defaultValue: "Payment of {{amount}} {{currency}} marked as paid",
        amount: m[1],
        currency: m[2],
      }),
  },

  // ----- Automation -----
  {
    pattern: /^Sent email "(.+)" to (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.sentEmail", {
        defaultValue: 'Sent email "{{subject}}" to {{recipient}}',
        subject: m[1],
        recipient: m[2],
      }),
  },
  {
    pattern: /^Updated (.+) field (.+) via automation$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedFieldViaAutomation", {
        defaultValue: "Updated {{entity}} field {{field}} via automation",
        entity: translateAutomationEntityToken(m[1], t),
        field: m[2],
      }),
  },

  // ----- Gabinet: treatments -----
  {
    pattern: /^Created treatment "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdTreatment", {
        defaultValue: 'Created treatment "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Updated treatment "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedTreatment", {
        defaultValue: 'Updated treatment "{{name}}"',
        name: m[1],
      }),
  },
  {
    pattern: /^Deleted treatment "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedTreatment", {
        defaultValue: 'Deleted treatment "{{name}}"',
        name: m[1],
      }),
  },

  // ----- Gabinet: employees -----
  {
    pattern: /^Created employee profile$/,
    build: (_m, t) =>
      t("activityTimeline.descriptions.createdEmployeeProfile", "Created employee profile"),
  },
  {
    pattern: /^Updated employee profile$/,
    build: (_m, t) =>
      t("activityTimeline.descriptions.updatedEmployeeProfile", "Updated employee profile"),
  },
  {
    pattern: /^Deactivated employee profile$/,
    build: (_m, t) =>
      t("activityTimeline.descriptions.deactivatedEmployeeProfile", "Deactivated employee profile"),
  },
  {
    pattern: /^Updated treatment qualifications \((\d+) treatments?\)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedTreatmentQualifications", {
        defaultValue: "Updated treatment qualifications ({{count}} treatments)",
        count: Number(m[1]),
      }),
  },

  // ----- Gabinet: patients -----
  {
    pattern: /^Created patient (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdPatient", {
        defaultValue: "Created patient {{name}}",
        name: m[1],
      }),
  },
  {
    pattern: /^Updated patient (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.updatedPatient", {
        defaultValue: "Updated patient {{name}}",
        name: m[1],
      }),
  },
  {
    pattern: /^Deleted patient (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedPatient", {
        defaultValue: "Deleted patient {{name}}",
        name: m[1],
      }),
  },

  // ----- Gabinet: packages -----
  {
    pattern: /^Created package (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdPackage", {
        defaultValue: "Created package {{name}}",
        name: m[1],
      }),
  },
  {
    pattern: /^Used (\d+) treatment\(s\) from package (.*)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.usedPackageTreatments", {
        defaultValue: "Used {{count}} treatment(s) from package {{name}}",
        count: Number(m[1]),
        name: m[2],
      }),
  },

  // ----- Gabinet: appointment SMS -----
  {
    pattern: /^Sent automated SMS for (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.sentAutomatedSms", {
        defaultValue: "Sent automated SMS for {{eventType}}",
        eventType: m[1],
      }),
  },
  {
    pattern: /^Sent appointment confirmation SMS for (.+) at (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.sentAppointmentConfirmationSms", {
        defaultValue: "Sent appointment confirmation SMS for {{date}} at {{time}}",
        date: m[1],
        time: m[2],
      }),
  },
  {
    pattern: /^Received appointment confirmation reply: (.+)$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.receivedConfirmationReply", {
        defaultValue: "Received appointment confirmation reply: {{body}}",
        body: m[1],
      }),
  },

  // ----- Scheduled activities (tasks/meetings/etc.) -----
  // These generic patterns must come last so entity-specific rules above
  // (e.g. `Created lead "..."`, `Created treatment "..."`) take precedence.
  {
    pattern: /^Created (.+) "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.createdScheduledActivity", {
        defaultValue: 'Created {{type}} "{{title}}"',
        type: m[1],
        title: m[2],
      }),
  },
  {
    pattern: /^Deleted (.+) "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.deletedScheduledActivity", {
        defaultValue: 'Deleted {{type}} "{{title}}"',
        type: m[1],
        title: m[2],
      }),
  },
  {
    pattern: /^Completed (.+) "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.completedScheduledActivity", {
        defaultValue: 'Completed {{type}} "{{title}}"',
        type: m[1],
        title: m[2],
      }),
  },
  {
    pattern: /^Reopened (.+) "(.+)"$/,
    build: (m, t) =>
      t("activityTimeline.descriptions.reopenedScheduledActivity", {
        defaultValue: 'Reopened {{type}} "{{title}}"',
        type: m[1],
        title: m[2],
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
