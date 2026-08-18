import { defineTable } from "convex/server";
import { v } from "convex/values";

interface GabinetSchemaDeps {
  gabinetLeaveTypeValidator: typeof import("../schema").gabinetLeaveTypeValidator;
  gabinetLeaveStatusValidator: typeof import("../schema").gabinetLeaveStatusValidator;
  gabinetEmployeeRoleValidator: typeof import("../schema").gabinetEmployeeRoleValidator;
  gabinetAppointmentStatusValidator: typeof import("../schema").gabinetAppointmentStatusValidator;
  gabinetPackageUsageStatusValidator: typeof import("../schema").gabinetPackageUsageStatusValidator;
  gabinetLoyaltyTierValidator: typeof import("../schema").gabinetLoyaltyTierValidator;
  gabinetLoyaltyTxTypeValidator: typeof import("../schema").gabinetLoyaltyTxTypeValidator;
  gabinetWaitlistStatusValidator: typeof import("../schema").gabinetWaitlistStatusValidator;
  appointmentSmsDirectionValidator: typeof import("../schema").appointmentSmsDirectionValidator;
  appointmentSmsIntentValidator: typeof import("../schema").appointmentSmsIntentValidator;
  appointmentSmsProcessingStatusValidator: typeof import("../schema").appointmentSmsProcessingStatusValidator;
  appointmentWorkflowEventValidator: typeof import("../schema").appointmentWorkflowEventValidator;
  appointmentWorkflowChannelValidator: typeof import("../schema").appointmentWorkflowChannelValidator;
  appointmentWorkflowStatusValidator: typeof import("../schema").appointmentWorkflowStatusValidator;
}

export function createGabinetTables({
  gabinetLeaveTypeValidator,
  gabinetLeaveStatusValidator,
  gabinetEmployeeRoleValidator,
  gabinetAppointmentStatusValidator,
  gabinetPackageUsageStatusValidator,
  gabinetLoyaltyTierValidator,
  gabinetLoyaltyTxTypeValidator,
  gabinetWaitlistStatusValidator,
  appointmentSmsDirectionValidator,
  appointmentSmsIntentValidator,
  appointmentSmsProcessingStatusValidator,
  appointmentWorkflowEventValidator,
  appointmentWorkflowChannelValidator,
  appointmentWorkflowStatusValidator,
}: GabinetSchemaDeps) {
  return {
  // --- Gabinet (Medical Office) ---

  gabinetPatients: defineTable({
    organizationId: v.string(),
    contactId: v.optional(v.id("contacts")),
    firstName: v.string(),
    lastName: v.string(),
    pesel: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()),
    gender: v.optional(
      v.union(v.literal("male"), v.literal("female"), v.literal("other")),
    ),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        postalCode: v.optional(v.string()),
      }),
    ),
    medicalNotes: v.optional(v.string()),
    allergies: v.optional(v.string()),
    bloodType: v.optional(v.string()),
    emergencyContactName: v.optional(v.string()),
    emergencyContactPhone: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    referredByPatientId: v.optional(v.id("gabinetPatients")),
    isActive: v.boolean(),
    smsConsent: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    customFields: v.optional(v.any()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndEmail", ["organizationId", "email"])
    .index("by_orgAndPesel", ["organizationId", "pesel"])
    .index("by_orgAndContact", ["organizationId", "contactId"])
    .index("by_orgAndSmsConsent", ["organizationId", "smsConsent"]),

  gabinetTreatments: defineTable({
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    // Legacy free-text category. Superseded by `categoryId` (see below) which
    // references `categoryDefinitions`. Read-only fallback for records created
    // before structured categories — no longer written by the app. See #471.
    category: v.optional(v.string()),
    duration: v.number(),
    price: v.number(),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    // True when the treatment is VAT-exempt ("zwolniony" / ZW). When set, the
    // numeric taxRate is ignored. Replaces a legacy -1 sentinel in taxRate.
    taxExempt: v.optional(v.boolean()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    isActive: v.boolean(),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
    // When the treatment represents a package, link to an existing
    // `gabinetTreatmentPackages` row so the package's session count and
    // composition drive purchase behaviour. Replaces the standalone
    // `treatmentCount` input on the treatment form (see #1525).
    packageId: v.optional(v.id("gabinetTreatmentPackages")),
    // Treatment detail: typed parameter definitions
    parameters: v.optional(
      v.array(
        v.object({
          name: v.string(),
          type: v.optional(v.union(
            v.literal("text"),
            v.literal("number"),
            v.literal("checkbox"),
            v.literal("radio"),
            v.literal("select"),
          )),
          value: v.optional(v.string()), // legacy field, kept for backward compat
          description: v.optional(v.string()),
          unit: v.optional(v.string()),
          options: v.optional(v.array(v.string())),
          isRequired: v.optional(v.boolean()),
        }),
      ),
    ),
    // Treatment detail: required form templates with timing and frequency rules (D27)
    requiredFormTemplates: v.optional(v.array(v.object({
      templateId: v.id("formTemplates"),
      timing: v.union(
        v.literal("before_start"),
        v.literal("during_visit"),
        v.literal("after_completion"),
      ),
      // Whether the document is required (blocks completion) or optional.
      // Defaults to true when absent (pre-D27 entries are all required).
      isRequired: v.optional(v.boolean()),
      // Frequency rule — replaces the legacy isOneTime boolean.
      // "once"              — signed once per patient lifetime
      // "first_visit_only"  — only at the patient's first appointment for this treatment
      // "before_each_visit" — generated for every appointment (default)
      // "every_n_days"      — generate if no valid signed copy within the last validityDays
      // "on_expiry"         — generate when the last signed copy has expired
      // Absent means "before_each_visit" (backward compat with isOneTime: false / undefined).
      frequency: v.optional(v.union(
        v.literal("once"),
        v.literal("first_visit_only"),
        v.literal("before_each_visit"),
        v.literal("every_n_days"),
        v.literal("on_expiry"),
      )),
      // Number of days a signed copy remains valid. Required when frequency is
      // "every_n_days" or "on_expiry". Ignored for other frequencies.
      validityDays: v.optional(v.number()),
      // Legacy field — kept for backward compat. New entries use frequency="once".
      isOneTime: v.optional(v.boolean()),
    }))),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndActive", ["organizationId", "isActive"]),

  gabinetTreatmentVariants: defineTable({
    organizationId: v.string(),
    treatmentId: v.id("gabinetTreatments"),
    name: v.string(),
    price: v.optional(v.number()),
    duration: v.optional(v.number()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.id("_storage")),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  })
    .index("by_treatment", ["treatmentId"])
    .index("by_org", ["organizationId"]),

  // Junction table: treatment definition → warehouse product (#2318).
  // Records which products (preparations and disposables) are standardly
  // consumed during one visit of this treatment, and in what quantity.
  // product_section mirrors products.productSection: "treatment" | "disposable".
  // unit is a snapshot of products.stockUnit at link time.
  gabinetTreatmentProducts: defineTable({
    organizationId: v.string(),
    treatmentId: v.id("gabinetTreatments"),
    productId: v.id("products"),
    productSection: v.string(), // "treatment" | "disposable"
    quantity: v.number(),
    unit: v.optional(v.string()), // snapshot of products.stockUnit
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_treatment", ["treatmentId"])
    .index("by_product", ["productId"]),

  // --- Gabinet: Employee Scheduling (Phase 2) ---

  gabinetWorkingHours: defineTable({
    organizationId: v.string(),
    dayOfWeek: v.number(), // 0-6
    startTime: v.string(), // "HH:MM"
    endTime: v.string(),
    isOpen: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    locationId: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDay", ["organizationId", "dayOfWeek"])
    .index("by_orgAndLocation", ["organizationId", "locationId"]),

  gabinetEmployeeSchedules: defineTable({
    organizationId: v.string(),
    userId: v.id("users"),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isWorking: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    locationId: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgUserAndDay", ["organizationId", "userId", "dayOfWeek"]),

  gabinetLeaves: defineTable({
    organizationId: v.string(),
    userId: v.id("users"),
    type: gabinetLeaveTypeValidator,
    leaveTypeId: v.optional(v.id("gabinetLeaveTypes")),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    status: gabinetLeaveStatusValidator,
    reason: v.optional(v.string()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndDate", ["organizationId", "startDate"]),

  gabinetOvertime: defineTable({
    organizationId: v.string(),
    userId: v.id("users"),
    date: v.string(),
    hours: v.number(),
    reason: v.optional(v.string()),
    status: gabinetLeaveStatusValidator, // reuse pending/approved/rejected
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"]),

  // --- Gabinet: Employees (HR) ---

  gabinetEmployees: defineTable({
    organizationId: v.string(),
    // Application policy: new employees must always have a linked user account.
    // The DB column is nullable (migration 00042) only to preserve historical rows;
    // the `create` action and CSV import both reject writes with userId = null.
    userId: v.optional(v.id("users")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.array(v.id("gabinetTreatments")),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    isActive: v.boolean(),
    // Explicit block flag — true when an admin has blocked this account.
    // Separate from isActive so that inactive (deactivated) records are not
    // automatically treated as blocked. Old rows default to false.
    isBlocked: v.optional(v.boolean()),
    color: v.optional(v.string()),
    notes: v.optional(v.string()),
    // Detailed employee data (beauty salon context)
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    dateOfBirth: v.optional(v.string()), // YYYY-MM-DD
    pesel: v.optional(v.string()),
    address: v.optional(
      v.object({
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        postalCode: v.optional(v.string()),
      }),
    ),
    employmentType: v.optional(
      v.union(
        v.literal("umowa_o_prace"),
        v.literal("umowa_zlecenie"),
        v.literal("b2b"),
        v.literal("staz"),
      ),
    ),
    endDate: v.optional(v.string()), // YYYY-MM-DD
    position: v.optional(v.string()),
    department: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    yearsOfExperience: v.optional(v.number()),
    certifications: v.optional(
      v.array(
        v.object({
          name: v.string(),
          dateObtained: v.optional(v.string()),
          expiryDate: v.optional(v.string()),
        }),
      ),
    ),
    assignedItems: v.optional(
      v.array(
        v.object({
          name: v.string(),
          quantity: v.optional(v.number()),
          issuedDate: v.optional(v.string()),
          returnedDate: v.optional(v.string()),
          notes: v.optional(v.string()),
        }),
      ),
    ),
    baseSalary: v.optional(v.number()),
    commissionPercent: v.optional(v.number()),
    bankAccount: v.optional(v.string()),
    // Whether this employee should appear as a column in the day-by-employee
    // calendar view. Defaults to true at the DB level; optional here so legacy
    // rows without the field don't fail validation.
    showInCalendar: v.optional(v.boolean()),
    // Whether this employee performs treatments/services. Controls visibility
    // of specialization, licenseNumber, and qualifiedTreatmentIds in the UI.
    // Independent from showInCalendar. Defaults to true for legacy rows.
    performsServices: v.optional(v.boolean()),
    // Describes the employee's work area: clinic only, office/CRM only, or both.
    workScope: v.optional(
      v.union(v.literal("clinic"), v.literal("office"), v.literal("both")),
    ),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    bio: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .index("by_orgAndRole", ["organizationId", "role"]),

  // Many-to-many join between employees and locations.
  // An employee may work across multiple locations (multi-site clinic chains).
  // isPrimary marks the employee's default location for scheduling defaults and
  // calendar filtering.
  // role: optional override — when set, the employee acts in this role at this
  // location instead of their default role from gabinetEmployees.role.
  gabinetEmployeeLocations: defineTable({
    organizationId: v.string(),
    employeeId: v.id("gabinetEmployees"),
    locationId: v.string(),
    isPrimary: v.boolean(),
    role: v.optional(gabinetEmployeeRoleValidator),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_employee", ["employeeId"])
    .index("by_location", ["locationId"])
    .index("by_employeeAndLocation", ["employeeId", "locationId"]),

  // --- Gabinet: Leave Types & Balances (HR) ---

  gabinetLeaveTypes: defineTable({
    organizationId: v.string(),
    name: v.string(),
    color: v.optional(v.string()),
    isPaid: v.boolean(),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.boolean(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndActive", ["organizationId", "isActive"]),

  gabinetPaymentMethods: defineTable({
    organizationId: v.string(),
    key: v.string(),
    name: v.string(),
    isSystem: v.boolean(),
    isActive: v.boolean(),
    order: v.number(),
    availableForSettlement: v.boolean(),
    availableForSales: v.boolean(),
    availableForRefund: v.boolean(),
    locksAmountToTreatmentPrice: v.boolean(),
    isPackageCoverage: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .index("by_orgAndKey", ["organizationId", "key"]),

  gabinetLeaveBalances: defineTable({
    organizationId: v.string(),
    employeeId: v.id("gabinetEmployees"),
    leaveTypeId: v.id("gabinetLeaveTypes"),
    year: v.number(),
    totalDays: v.number(),
    usedDays: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndEmployee", ["organizationId", "employeeId"])
    .index("by_orgEmployeeTypeYear", [
      "organizationId",
      "employeeId",
      "leaveTypeId",
      "year",
    ]),

  // --- Gabinet: Appointments (Phase 3) ---

  gabinetAppointments: defineTable({
    organizationId: v.string(),
    patientId: v.id("gabinetPatients"),
    employeeId: v.id("users"),
    // DEPRECATED (#3399): replaced by gabinetAppointmentTreatments junction
    // rows; the Supabase columns are dropped and no code reads these. They
    // must stay optional here because legacy documents in the Convex dev
    // deployment still carry the fields — removing them entirely makes every
    // `convex deploy` fail schema validation.
    treatmentId: v.optional(v.id("gabinetTreatments")),
    variantId: v.optional(v.id("gabinetTreatmentVariants")),
    priceAtBooking: v.optional(v.float64()),
    date: v.string(), // YYYY-MM-DD
    startTime: v.string(), // HH:MM
    endTime: v.string(),
    status: gabinetAppointmentStatusValidator,
    notes: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    bodyChartData: v.optional(v.string()), // JSON string of BodyRegion[]
    // Clinical documentation
    treatmentParameterValues: v.optional(v.string()), // JSON string of [{name, value, unit}]
    interviewNotes: v.optional(v.string()),
    clinicalRemarks: v.optional(v.string()),
    photos: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          type: v.union(v.literal("before"), v.literal("after")),
          caption: v.optional(v.string()),
          uploadedAt: v.number(),
        }),
      ),
    ),
    color: v.optional(v.string()),
    isRecurring: v.boolean(),
    recurringRule: v.optional(
      v.object({
        frequency: v.string(), // daily, weekly, biweekly, monthly
        count: v.optional(v.number()),
        until: v.optional(v.string()),
      }),
    ),
    recurringGroupId: v.optional(v.string()),
    recurringIndex: v.optional(v.number()),
    prepaymentRequired: v.optional(v.boolean()),
    prepaymentAmount: v.optional(v.number()),
    prepaymentStatus: v.optional(v.string()),
    prepaymentPaidAt: v.optional(v.number()),
    packageUsageId: v.optional(v.id("gabinetPackageUsage")),
    packageTreatmentId: v.optional(v.id("gabinetTreatments")),
    scheduledActivityId: v.optional(v.string()),
    reminderSentAt: v.optional(v.number()),
    sendReminder: v.optional(v.boolean()),
    reminderOverrides: v.optional(v.string()), // JSON: {sms48h?,sms24h?,email48h?,email24h?}
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancellationReason: v.optional(v.string()),
    bookedFromPortal: v.optional(v.boolean()),
    bookedByPatientId: v.optional(v.id("gabinetPatients")),
    locationId: v.optional(v.string()),
    roomId: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    requiresCompletion: v.optional(v.boolean()),
    contraindicationAlertsReviewed: v.optional(v.boolean()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDate", ["organizationId", "date"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndEmployee", ["organizationId", "employeeId"])
    .index("by_orgAndEmployeeAndDate", ["organizationId", "employeeId", "date"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndRecurringGroup", ["organizationId", "recurringGroupId"])
    .index("by_orgAndRoomAndDate", ["organizationId", "roomId", "date"])
    .index("by_requiresCompletion", ["organizationId", "requiresCompletion"]),

  // Junction table: appointment → treatment(s) (#3360).
  // Canonical multi-treatment model introduced in #3356.
  gabinetAppointmentTreatments: defineTable({
    organizationId: v.string(),
    appointmentId: v.id("gabinetAppointments"),
    treatmentId: v.optional(v.id("gabinetTreatments")),
    variantId: v.optional(v.id("gabinetTreatmentVariants")),
    priceAtBooking: v.optional(v.number()),
    sortOrder: v.number(),
    // Per-treatment deduction flags (#3361). Replace the appointment-level
    // stockDeducted / packageDeducted booleans which become ambiguous when an
    // appointment has multiple treatments.
    stockDeducted: v.optional(v.boolean()),
    packageDeducted: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_appointment", ["appointmentId"])
    .index("by_org", ["organizationId"])
    .index("by_orgAndTreatment", ["organizationId", "treatmentId"]),

  // --- Gabinet: Packages & Loyalty (Phase 4) ---

  gabinetTreatmentPackages: defineTable({
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    treatments: v.array(
      v.object({
        treatmentId: v.id("gabinetTreatments"),
        variantId: v.optional(v.id("gabinetTreatmentVariants")),
        quantity: v.number(),
      }),
    ),
    totalPrice: v.number(),
    currency: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    isActive: v.boolean(),
    loyaltyPointsAwarded: v.optional(v.number()),
    autoGeneratedForTreatmentId: v.optional(v.id("gabinetTreatments")),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .index("by_orgAndAutoTreatment", ["organizationId", "autoGeneratedForTreatmentId"]),

  gabinetPackageUsage: defineTable({
    organizationId: v.string(),
    patientId: v.optional(v.id("gabinetPatients")),
    packageId: v.id("gabinetTreatmentPackages"),
    purchasedAt: v.number(),
    expiresAt: v.optional(v.number()),
    status: gabinetPackageUsageStatusValidator,
    treatmentsUsed: v.array(
      v.object({
        treatmentId: v.id("gabinetTreatments"),
        variantId: v.optional(v.id("gabinetTreatmentVariants")),
        usedCount: v.number(),
        totalCount: v.number(),
      }),
    ),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    isGift: v.optional(v.boolean()),
    voucherCode: v.optional(v.string()),
    giftRecipientName: v.optional(v.string()),
    giftRecipientPhone: v.optional(v.string()),
    giftRecipientEmail: v.optional(v.string()),
    soldByEmployeeId: v.optional(v.id("gabinetEmployees")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgPatientAndPackage", ["organizationId", "patientId", "packageId"])
    .index("by_package", ["packageId"]),

  gabinetLoyaltyPoints: defineTable({
    organizationId: v.string(),
    patientId: v.id("gabinetPatients"),
    balance: v.number(),
    lifetimeEarned: v.number(),
    lifetimeSpent: v.number(),
    tier: v.optional(gabinetLoyaltyTierValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"]),

  gabinetLoyaltyTransactions: defineTable({
    organizationId: v.string(),
    patientId: v.id("gabinetPatients"),
    type: gabinetLoyaltyTxTypeValidator,
    points: v.number(),
    reason: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    balanceAfter: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"]),

  gabinetLoyaltyTiers: defineTable({
    organizationId: v.string(),
    tier: gabinetLoyaltyTierValidator,
    name: v.string(),
    threshold: v.number(),
    color: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndTier", ["organizationId", "tier"]),

  // --- Document Signing ---

  signatureRequests: defineTable({
    organizationId: v.string(),
    instanceId: v.string(),
    slotId: v.string(),
    token: v.string(),
    signerEmail: v.optional(v.string()),
    signerName: v.optional(v.string()),
    signerPhone: v.optional(v.string()),
    signerUserId: v.optional(v.id("users")),
    verificationMethod: v.union(
      v.literal("click"),
      v.literal("sms"),
      v.literal("email_otp"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("signed"),
      v.literal("expired"),
    ),
    otpHash: v.optional(v.string()),
    otpSentAt: v.optional(v.number()),
    otpAttempts: v.optional(v.number()),
    expiresAt: v.number(),
    signedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_instance", ["instanceId"])
    .index("by_org", ["organizationId"]),

  orgSmsConfig: defineTable({
    organizationId: v.string(),
    provider: v.union(v.literal("smsapi"), v.literal("twilio")),
    apiToken: v.string(),
    apiSecret: v.optional(v.string()),
    senderId: v.optional(v.string()),
    fromNumber: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_providerAndFromNumber", ["provider", "fromNumber"])
    .index("by_providerAndSenderId", ["provider", "senderId"]),

  appointmentSmsEvents: defineTable({
    organizationId: v.string(),
    appointmentId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    normalizedPhone: v.string(),
    direction: appointmentSmsDirectionValidator,
    provider: v.string(),
    eventType: v.string(),
    providerMessageId: v.optional(v.string()),
    correlationKey: v.optional(v.string()),
    replyToEventId: v.optional(v.id("appointmentSmsEvents")),
    rawBody: v.optional(v.string()),
    normalizedBody: v.optional(v.string()),
    parsedIntent: v.optional(appointmentSmsIntentValidator),
    processingStatus: appointmentSmsProcessingStatusValidator,
    processingError: v.optional(v.string()),
    webhookSignatureVerified: v.optional(v.boolean()),
    metadata: v.optional(v.string()),
    idempotencyKey: v.string(),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_appointment", ["appointmentId", "createdAt"])
    .index("by_orgAndPhone", ["organizationId", "normalizedPhone", "createdAt"])
    .index("by_providerAndMessageId", ["provider", "providerMessageId"])
    .index("by_processingStatus", ["processingStatus", "createdAt"])
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_correlationKey", ["correlationKey", "createdAt"])
    .index("by_replyToEvent", ["replyToEventId", "createdAt"]),

  // --- Gabinet: Patient Portal (Phase 6) ---

  gabinetPortalSessions: defineTable({
    patientId: v.id("gabinetPatients"),
    organizationId: v.string(),
    tokenHash: v.string(),
    otpHash: v.optional(v.string()),
    otpExpiresAt: v.optional(v.number()),
    isActive: v.boolean(),
    lastAccessedAt: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    otpSendCount: v.optional(v.number()),
    otpSendWindowStart: v.optional(v.number()),
    verifyFailCount: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_patient", ["patientId"])
    .index("by_org", ["organizationId"]),

  // (Email Event Bus tables defined below, after appointmentReminders)

  // --- Gabinet: Appointment Reminders ---

  appointmentReminders: defineTable({
    organizationId: v.string(),
    appointmentId: v.string(),
    type: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("notification"),
    ),
    scheduledFor: v.number(),
    sentAt: v.optional(v.number()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    scheduledFunctionId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_appointment", ["appointmentId"])
    .index("by_orgAndStatus", ["organizationId", "status"]),

  appointmentWorkflowHistory: defineTable({
    organizationId: v.string(),
    appointmentId: v.string(),
    workflowEvent: appointmentWorkflowEventValidator,
    channel: appointmentWorkflowChannelValidator,
    direction: v.literal("outbound"),
    source: v.string(),
    recipient: v.string(),
    recipientName: v.optional(v.string()),
    status: appointmentWorkflowStatusValidator,
    renderedSubject: v.optional(v.string()),
    renderedBody: v.optional(v.string()),
    emailEventLogId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    idempotencyKey: v.string(),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId", "createdAt"])
    .index("by_appointment", ["appointmentId", "createdAt"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  // --- Gabinet: Locations, Rooms & Equipment ---

  gabinetLocations: defineTable({
    organizationId: v.string(),
    name: v.string(),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    color: v.optional(v.string()),
    fiscalRegisterId: v.optional(v.string()),
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_org", ["organizationId"]),

  gabinetRooms: defineTable({
    organizationId: v.string(),
    locationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_location", ["locationId"]),

  gabinetEquipment: defineTable({
    organizationId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    currentLocationId: v.optional(v.string()),
    currentRoomId: v.optional(v.string()),
    status: v.union(
      v.literal("available"),
      v.literal("in_use"),
      v.literal("maintenance"),
      v.literal("retired"),
    ),
    // Parameter units this equipment supports (e.g. ["J", "W", "ms"]). Surfaced
    // on the appointment documentation tab so the operator can pick a matching
    // unit when recording treatment parameters during a visit. See #1847.
    parameterUnits: v.optional(v.array(v.string())),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_org", ["organizationId"])
    .index("by_location", ["organizationId", "currentLocationId"])
    .index("by_room", ["organizationId", "currentRoomId"]),

  gabinetEquipmentTransfers: defineTable({
    organizationId: v.string(),
    equipmentId: v.string(),
    fromLocationId: v.optional(v.string()),
    toLocationId: v.string(),
    toRoomId: v.optional(v.string()),
    transferredBy: v.id("users"),
    transferredAt: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_equipment", ["equipmentId"])
    .index("by_org", ["organizationId"])
    .index("by_orgAndTime", ["organizationId", "transferredAt"]),

  // --- Gabinet: PDF Receipts (issue #3739) ---

  gabinetReceipts: defineTable({
    organizationId: v.string(),
    paymentId: v.string(),
    appointmentId: v.optional(v.string()),
    patientId: v.optional(v.string()),
    locationId: v.optional(v.string()),
    receiptNumber: v.string(), // e.g. 2026/001/LOC
    issuedAt: v.number(),
    // Receipt lifecycle: issued (default) | void
    status: v.union(v.literal("issued"), v.literal("void")),
    // Receipt classification: original (default) | correction (KOR/ prefix)
    receiptType: v.union(v.literal("original"), v.literal("correction")),
    // Org data captured at issuance time so the receipt can be reproduced later.
    organizationName: v.string(),
    organizationNip: v.optional(v.string()),
    organizationAddress: v.optional(v.string()),
    // Monetary totals in PLN
    totalNet: v.number(),
    totalVat: v.number(),
    totalGross: v.number(),
    paymentMethod: v.string(),
    // Line items serialised as JSON at issuance time:
    // [{ name, pkwiu, quantity, unitPriceGross, vatRate, netAmount, vatAmount, grossAmount }]
    itemsJson: v.string(),
    // Fiscal reference: copied from payment.fiscalReceiptId when available.
    fiscalReceiptId: v.optional(v.string()),
    // PDF stored in Convex file storage.
    pdfStorageId: v.optional(v.id("_storage")),
    pdfUrl: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_payment", ["paymentId"])
    .index("by_orgAndNumber", ["organizationId", "receiptNumber"])
    .index("by_orgAndLocation", ["organizationId", "locationId"]),

  // --- Gabinet: Receipt Sequences (issue #3736) ---
  // Atomic per-location-per-year counter for generating legally-compliant
  // receipt numbers in the format YYYY/NNN/LOC.
  // lastNumber is incremented inside a Convex mutation (serialised by Convex's
  // OCC) so no two receipts can get the same number within an org+location+year.
  gabinetReceiptSequences: defineTable({
    organizationId: v.string(),
    locationId: v.optional(v.string()),
    year: v.number(),
    lastNumber: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgLocationYear", ["organizationId", "locationId", "year"]),

  // --- Gabinet: Cash Register Transactions (issue #4156) ---
  // Manual deposits and withdrawals from the cash drawer during a working day
  // (not tied to patient payments). Feeds the cash_expected calculation in the
  // end-of-day close.
  gabinetCashTransactions: defineTable({
    organizationId: v.string(),
    locationId: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    type: v.union(v.literal("deposit"), v.literal("withdrawal")),
    amount: v.float64(),
    reason: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDate", ["organizationId", "date"]),

  // --- Gabinet: Day Closes (issue #4156) ---
  // End-of-day cash register closure snapshots. One per (org, optional-location,
  // date). Immutable once created — corrections must open the next day.
  gabinetDayCloses: defineTable({
    organizationId: v.string(),
    locationId: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    paymentSummary: v.string(), // JSON: { method: totalAmount }
    totalCollected: v.float64(),
    cashFromPayments: v.float64(),
    cashOpeningBalance: v.float64(),
    cashDeposits: v.float64(),
    cashWithdrawals: v.float64(),
    cashExpected: v.float64(),
    cashCounted: v.float64(),
    cashDiscrepancy: v.float64(),
    notes: v.optional(v.string()),
    closedBy: v.id("users"),
    closedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDate", ["organizationId", "date"]),

  // --- Gabinet: Waitlist (issue #4166) ---
  // Patients waiting for an appointment slot. Supports optional treatment and
  // employee preference, flexible preferred-date/time arrays, and priority
  // ordering within the queue.
  gabinetWaitlist: defineTable({
    organizationId: v.string(),
    patientId: v.id("gabinetPatients"),
    treatmentId: v.optional(v.id("gabinetTreatments")),
    employeeId: v.optional(v.id("gabinetEmployees")),
    preferredDates: v.optional(v.array(v.string())), // YYYY-MM-DD
    preferredTimes: v.optional(v.array(v.string())), // HH:MM
    notes: v.optional(v.string()),
    status: gabinetWaitlistStatusValidator,
    notifiedAt: v.optional(v.number()),
    priority: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndPriority", ["organizationId", "priority"]),
  };
}
