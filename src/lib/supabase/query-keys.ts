/**
 * React Query Key Factory for Supabase Queries
 *
 * Hierarchical key structure so invalidation can target broad or narrow scopes:
 *   supabaseKeys.all                        → ["supabase"]
 *   supabaseKeys.contacts.all               → ["supabase", "contacts"]
 *   supabaseKeys.contacts.list(orgId)        → ["supabase", "contacts", "list", orgId]
 *   supabaseKeys.contacts.detail(orgId, id)  → ["supabase", "contacts", "detail", orgId, id]
 */

// ─── Helper: create a standard entity key factory ─────────────────────────────
function entityKeys<T extends string>(entity: T) {
  return {
    all: ["supabase", entity] as const,
    list: (orgId: string) => ["supabase", entity, "list", orgId] as const,
    detail: (orgId: string, id: string) =>
      ["supabase", entity, "detail", orgId, id] as const,
  };
}

export const supabaseKeys = {
  /** Root key — invalidate everything from Supabase. */
  all: ["supabase"] as const,

  // ── CRM Core Entities ───────────────────────────────────────────────────
  contacts: entityKeys("contacts"),
  companies: entityKeys("companies"),
  products: entityKeys("products"),
  notes: entityKeys("notes"),
  activities: entityKeys("activities"),
  calls: entityKeys("calls"),
  documents: entityKeys("documents"),
  sources: entityKeys("sources"),
  savedViews: entityKeys("savedViews"),
  lostReasons: entityKeys("lostReasons"),

  // ── Custom Fields & Relationships ───────────────────────────────────────
  customFieldDefinitions: entityKeys("customFieldDefinitions"),
  customFieldValues: entityKeys("customFieldValues"),
  objectRelationships: entityKeys("objectRelationships"),

  // ── Lead Pipeline & Kanban ──────────────────────────────────────────────
  leads: entityKeys("leads"),
  pipelines: entityKeys("pipelines"),
  pipelineStages: entityKeys("pipelineStages"),
  pipelineStageActions: entityKeys("pipelineStageActions"),
  dealProducts: entityKeys("dealProducts"),
  productStockLevels: entityKeys("productStockLevels"),
  productStockMovements: entityKeys("productStockMovements"),
  scheduledActivities: entityKeys("scheduledActivities"),
  formDocuments: entityKeys("formDocuments"),

  // ── Email System ──────────────────────────────────────────────────────────
  emails: entityKeys("emails"),
  emailAccounts: entityKeys("emailAccounts"),
  mailProviders: entityKeys("mailProviders"),
  emailTemplates: entityKeys("emailTemplates"),
  emailLayouts: entityKeys("emailLayouts"),
  emailBrandConfig: entityKeys("emailBrandConfig"),
  emailEventTypes: entityKeys("emailEventTypes"),
  emailEventBindings: entityKeys("emailEventBindings"),
  emailEventLog: entityKeys("emailEventLog"),
  emailSequences: entityKeys("emailSequences"),
  emailSequenceSteps: entityKeys("emailSequenceSteps"),
  emailSequenceEnrollments: entityKeys("emailSequenceEnrollments"),

  // ── Automation Engine ───────────────────────────────────────────────────
  automationRules: entityKeys("automationRules"),
  automationRuns: entityKeys("automationRuns"),
  automationRunSteps: entityKeys("automationRunSteps"),

  // ── Gabinet Entities ─────────────────────────────────────────────────────
  gabinetPatients: entityKeys("gabinetPatients"),
  gabinetTreatments: entityKeys("gabinetTreatments"),
  gabinetTreatmentVariants: entityKeys("gabinetTreatmentVariants"),
  gabinetEmployees: entityKeys("gabinetEmployees"),
  gabinetLocations: entityKeys("gabinetLocations"),
  gabinetRooms: entityKeys("gabinetRooms"),
  gabinetEquipment: entityKeys("gabinetEquipment"),
  gabinetEquipmentTransfers: entityKeys("gabinetEquipmentTransfers"),
  gabinetLeaveTypes: entityKeys("gabinetLeaveTypes"),
  gabinetLeaveBalances: entityKeys("gabinetLeaveBalances"),
  gabinetWorkingHours: entityKeys("gabinetWorkingHours"),
  gabinetEmployeeSchedules: entityKeys("gabinetEmployeeSchedules"),
  gabinetAppointments: entityKeys("gabinetAppointments"),
  gabinetLeaves: entityKeys("gabinetLeaves"),
  gabinetOvertime: entityKeys("gabinetOvertime"),
  gabinetTreatmentPackages: entityKeys("gabinetTreatmentPackages"),
  gabinetPackageUsage: entityKeys("gabinetPackageUsage"),
  gabinetLoyaltyPoints: entityKeys("gabinetLoyaltyPoints"),
  gabinetLoyaltyTransactions: entityKeys("gabinetLoyaltyTransactions"),
  gabinetLoyaltyTiers: entityKeys("gabinetLoyaltyTiers"),
  gabinetReceipts: entityKeys("gabinetReceipts"),
  warehouseDeliveries: entityKeys("warehouseDeliveries"),

  // ── Google Calendar ───────────────────────────────────────────────────────
  googleCalendarSyncConfigs: entityKeys("googleCalendarSyncConfigs"),

  // ── Payments ─────────────────────────────────────────────────────────────
  payments: entityKeys("payments"),

  // ── Platform Entities ───────────────────────────────────────────────────
  organizations: entityKeys("organizations"),
  teamMemberships: entityKeys("teamMemberships"),
  invitations: entityKeys("invitations"),
  notifications: entityKeys("notifications"),
  recentlyViewed: entityKeys("recentlyViewed"),
  orgSettings: entityKeys("orgSettings"),
  orgSmsConfig: entityKeys("orgSmsConfig"),
  auditLog: entityKeys("auditLog"),
  activityTypes: entityKeys("activityTypes"),
} as const;
