/**
 * Supabase Entity Mappers — Barrel Export
 *
 * Re-exports all entity mappers from a single entry point.
 */

// Generic utilities
export {
  snakeToCamel,
  camelToSnake,
  snakeToCamelKey,
  camelToSnakeKey,
  createEntityMapper,
} from "./generic";
export type { EntityMapperConfig, EntityMapper } from "./generic";

// Entity mappers
export {
  mapContactFromSupabase,
  mapContactToSupabase,
  type MappedContact,
  type ContactWriteInput,
} from "./contacts";

export {
  mapCompanyFromSupabase,
  mapCompanyToSupabase,
  type MappedCompany,
} from "./companies";

export {
  mapProductFromSupabase,
  mapProductToSupabase,
  type MappedProduct,
} from "./products";

export {
  mapNoteFromSupabase,
  mapNoteToSupabase,
  type MappedNote,
} from "./notes";

export {
  mapActivityFromSupabase,
  mapActivityToSupabase,
  type MappedActivity,
} from "./activities";

export {
  mapCallFromSupabase,
  mapCallToSupabase,
  type MappedCall,
} from "./calls";

export {
  mapDocumentFromSupabase,
  mapDocumentToSupabase,
  type MappedDocument,
} from "./documents";

export {
  mapSourceFromSupabase,
  mapSourceToSupabase,
  type MappedSource,
} from "./sources";

export {
  mapSavedViewFromSupabase,
  mapSavedViewToSupabase,
  type MappedSavedView,
} from "./saved-views";

export {
  mapLostReasonFromSupabase,
  mapLostReasonToSupabase,
  type MappedLostReason,
} from "./lost-reasons";

export {
  mapLeadFromSupabase,
  mapLeadToSupabase,
  type MappedLead,
} from "./leads";

export {
  mapPipelineFromSupabase,
  mapPipelineToSupabase,
  mapPipelineStageFromSupabase,
  mapPipelineStageToSupabase,
  type MappedPipeline,
  type MappedPipelineStage,
} from "./pipelines";

export {
  mapPipelineStageActionFromSupabase,
  mapPipelineStageActionToSupabase,
  type MappedPipelineStageAction,
} from "./pipeline-stage-actions";

// ── Email System Entities ─────────────────────────────────────────────────

export {
  mapEmailFromSupabase,
  mapEmailToSupabase,
  type MappedEmail,
} from "./emails";

export {
  mapEmailAccountFromSupabase,
  mapEmailAccountToSupabase,
  type MappedEmailAccount,
} from "./email-accounts";

export {
  mapMailProviderFromSupabase,
  mapMailProviderToSupabase,
  type MappedMailProvider,
} from "./mail-providers";

export {
  mapEmailTemplateFromSupabase,
  mapEmailTemplateToSupabase,
  type MappedEmailTemplate,
} from "./email-templates";

export {
  mapEmailLayoutFromSupabase,
  mapEmailLayoutToSupabase,
  type MappedEmailLayout,
} from "./email-layouts";

export {
  mapEmailBrandConfigFromSupabase,
  mapEmailBrandConfigToSupabase,
  type MappedEmailBrandConfig,
} from "./email-brand-config";

export {
  mapEmailEventTypeFromSupabase,
  mapEmailEventTypeToSupabase,
  type MappedEmailEventType,
} from "./email-event-types";

export {
  mapEmailEventBindingFromSupabase,
  mapEmailEventBindingToSupabase,
  type MappedEmailEventBinding,
} from "./email-event-bindings";

export {
  mapEmailEventLogFromSupabase,
  mapEmailEventLogToSupabase,
  type MappedEmailEventLog,
} from "./email-event-log";

export {
  mapEmailSequenceFromSupabase,
  mapEmailSequenceToSupabase,
  type MappedEmailSequence,
} from "./email-sequences";

export {
  mapEmailSequenceStepFromSupabase,
  mapEmailSequenceStepToSupabase,
  type MappedEmailSequenceStep,
} from "./email-sequence-steps";

export {
  mapEmailSequenceEnrollmentFromSupabase,
  mapEmailSequenceEnrollmentToSupabase,
  type MappedEmailSequenceEnrollment,
} from "./email-sequence-enrollments";

// ── Platform Entities ─────────────────────────────────────────────────────────

export {
  mapOrganizationFromSupabase,
  mapOrganizationToSupabase,
  type MappedOrganization,
} from "./organizations";

export {
  mapTeamMembershipFromSupabase,
  mapTeamMembershipToSupabase,
  type MappedTeamMembership,
} from "./team-memberships";

export {
  mapInvitationFromSupabase,
  mapInvitationToSupabase,
  type MappedInvitation,
} from "./invitations";

export {
  mapNotificationFromSupabase,
  mapNotificationToSupabase,
  type MappedNotification,
} from "./notifications";

export {
  mapRecentlyViewedFromSupabase,
  mapRecentlyViewedToSupabase,
  type MappedRecentlyViewed,
} from "./recently-viewed";

export {
  mapOrgSettingsFromSupabase,
  mapOrgSettingsToSupabase,
  type MappedOrgSettings,
} from "./org-settings";

export {
  mapAuditLogFromSupabase,
  mapAuditLogToSupabase,
  type MappedAuditLogEntry,
} from "./audit-log";

export {
  mapActivityTypeFromSupabase,
  mapActivityTypeToSupabase,
  type MappedActivityType,
} from "./activity-types";

export {
  mapScheduledActivityFromSupabase,
  mapScheduledActivityToSupabase,
  type MappedScheduledActivity,
} from "./scheduled-activities";

// ── Automation Engine Entities ────────────────────────────────────────────────

export {
  mapAutomationRuleFromSupabase,
  mapAutomationRuleToSupabase,
  type MappedAutomationRule,
} from "./automation-rules";

export {
  mapAutomationRunFromSupabase,
  mapAutomationRunToSupabase,
  type MappedAutomationRun,
} from "./automation-runs";

export {
  mapAutomationRunStepFromSupabase,
  mapAutomationRunStepToSupabase,
  type MappedAutomationRunStep,
} from "./automation-run-steps";
