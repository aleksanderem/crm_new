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
  gabinetDocTypeValidator: typeof import("../schema").gabinetDocTypeValidator;
  gabinetDocStatusValidator: typeof import("../schema").gabinetDocStatusValidator;
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
  gabinetDocTypeValidator,
  gabinetDocStatusValidator,
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
    organizationId: v.id("organizations"),
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
    .searchIndex("search_patients", {
      searchField: "firstName",
      filterFields: ["organizationId"],
    }),

  gabinetTreatments: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.number(),
    price: v.number(),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.id("gabinetEquipment"))),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    isActive: v.boolean(),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
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
    // Treatment detail: required document templates for this treatment (legacy)
    requiredDocumentTemplateIds: v.optional(
      v.array(v.id("gabinetDocumentTemplates")),
    ),
    // Treatment detail: required form templates with timing
    requiredFormTemplates: v.optional(v.array(v.object({
      templateId: v.id("formTemplates"),
      timing: v.union(v.literal("before_start"), v.literal("after_completion")),
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
    .index("by_orgAndCategory", ["organizationId", "category"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .searchIndex("search_treatments", {
      searchField: "name",
      filterFields: ["organizationId"],
    }),

  gabinetTreatmentVariants: defineTable({
    organizationId: v.id("organizations"),
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

  // --- Gabinet: Employee Scheduling (Phase 2) ---

  gabinetWorkingHours: defineTable({
    organizationId: v.id("organizations"),
    dayOfWeek: v.number(), // 0-6
    startTime: v.string(), // "HH:MM"
    endTime: v.string(),
    isOpen: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndDay", ["organizationId", "dayOfWeek"])
    .index("by_orgAndLocation", ["organizationId", "locationId"]),

  gabinetEmployeeSchedules: defineTable({
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isWorking: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgUserAndDay", ["organizationId", "userId", "dayOfWeek"]),

  gabinetLeaves: defineTable({
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    role: gabinetEmployeeRoleValidator,
    specialization: v.optional(v.string()),
    qualifiedTreatmentIds: v.array(v.id("gabinetTreatments")),
    licenseNumber: v.optional(v.string()),
    hireDate: v.optional(v.string()),
    isActive: v.boolean(),
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
    baseSalary: v.optional(v.number()),
    commissionPercent: v.optional(v.number()),
    bankAccount: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndUser", ["organizationId", "userId"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .index("by_orgAndRole", ["organizationId", "role"]),

  // --- Gabinet: Leave Types & Balances (HR) ---

  gabinetLeaveTypes: defineTable({
    organizationId: v.id("organizations"),
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

  gabinetLeaveBalances: defineTable({
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    treatmentId: v.optional(v.id("gabinetTreatments")),
    employeeId: v.id("users"),
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
    scheduledActivityId: v.optional(v.string()),
    reminderSentAt: v.optional(v.number()),
    sendReminder: v.optional(v.boolean()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.id("users")),
    cancellationReason: v.optional(v.string()),
    bookedFromPortal: v.optional(v.boolean()),
    bookedByPatientId: v.optional(v.id("gabinetPatients")),
    locationId: v.optional(v.id("gabinetLocations")),
    roomId: v.optional(v.id("gabinetRooms")),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    requiresCompletion: v.optional(v.boolean()),
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
    .index("by_orgAndTreatment", ["organizationId", "treatmentId"])
    .index("by_orgAndRecurringGroup", ["organizationId", "recurringGroupId"])
    .index("by_orgAndRoomAndDate", ["organizationId", "roomId", "date"])
    .index("by_requiresCompletion", ["organizationId", "requiresCompletion"]),

  // --- Gabinet: Packages & Loyalty (Phase 4) ---

  gabinetTreatmentPackages: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    treatments: v.array(
      v.object({
        treatmentId: v.id("gabinetTreatments"),
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
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndActive", ["organizationId", "isActive"])
    .index("by_orgAndAutoTreatment", ["organizationId", "autoGeneratedForTreatmentId"]),

  gabinetPackageUsage: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    packageId: v.id("gabinetTreatmentPackages"),
    purchasedAt: v.number(),
    expiresAt: v.optional(v.number()),
    status: gabinetPackageUsageStatusValidator,
    treatmentsUsed: v.array(
      v.object({
        treatmentId: v.id("gabinetTreatments"),
        usedCount: v.number(),
        totalCount: v.number(),
      }),
    ),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgPatientAndPackage", ["organizationId", "patientId", "packageId"]),

  gabinetLoyaltyPoints: defineTable({
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
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

  // --- Gabinet: Documents & Signatures (Phase 5) ---

  // TODO: Drop after confirming no data needs preserving — all code migrated to formTemplates/formDocuments
  gabinetDocumentTemplates: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    type: gabinetDocTypeValidator,
    content: v.string(),
    requiresSignature: v.boolean(),
    isActive: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndType", ["organizationId", "type"]),

  // TODO: Drop after confirming no data needs preserving — all code migrated to formTemplates/formDocuments
  gabinetDocuments: defineTable({
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    appointmentId: v.optional(v.id("gabinetAppointments")),
    templateId: v.optional(v.id("gabinetDocumentTemplates")),
    title: v.string(),
    type: gabinetDocTypeValidator,
    content: v.string(),
    status: gabinetDocStatusValidator,
    signatureData: v.optional(v.string()),
    signedAt: v.optional(v.number()),
    signedByPatient: v.optional(v.boolean()),
    signedByEmployee: v.optional(v.id("users")),
    fileStorageId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileMimeType: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    categoryId: v.optional(v.id("categoryDefinitions")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndPatient", ["organizationId", "patientId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_appointment", ["appointmentId"]),

  // --- Platform: Document Templates ---

  documentTemplates: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.union(
      v.literal("contract"),
      v.literal("invoice"),
      v.literal("consent"),
      v.literal("referral"),
      v.literal("prescription"),
      v.literal("report"),
      v.literal("protocol"),
      v.literal("custom"),
    ),
    content: v.string(),
    module: v.string(),
    requiredSources: v.array(v.string()),
    requiresSignature: v.boolean(),
    signatureSlots: v.array(
      v.object({
        id: v.string(),
        role: v.union(
          v.literal("author"),
          v.literal("client"),
          v.literal("patient"),
          v.literal("employee"),
          v.literal("witness"),
          v.literal("custom"),
        ),
        label: v.string(),
        verificationMethod: v.optional(
          v.union(v.literal("click"), v.literal("sms"), v.literal("email_otp")),
        ),
        signerType: v.optional(
          v.union(v.literal("internal"), v.literal("external")),
        ),
      }),
    ),
    accessControl: v.object({
      mode: v.union(v.literal("all"), v.literal("roles"), v.literal("users")),
      roles: v.array(v.string()),
      userIds: v.array(v.id("users")),
    }),
    version: v.number(),
    parentTemplateId: v.optional(v.id("documentTemplates")),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("archived"),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndModule", ["organizationId", "module"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndCategory", ["organizationId", "category"])
    .index("by_parent", ["parentTemplateId"]),

  documentTemplateFields: defineTable({
    templateId: v.id("documentTemplates"),
    fieldKey: v.string(),
    label: v.string(),
    type: v.union(
      v.literal("text"),
      v.literal("textarea"),
      v.literal("number"),
      v.literal("date"),
      v.literal("select"),
      v.literal("checkbox"),
      v.literal("signature"),
      v.literal("currency"),
      v.literal("phone"),
      v.literal("email"),
      v.literal("pesel"),
    ),
    sortOrder: v.number(),
    group: v.optional(v.string()),
    options: v.optional(
      v.array(v.object({ label: v.string(), value: v.string() })),
    ),
    defaultValue: v.optional(v.string()),
    binding: v.optional(
      v.object({
        source: v.string(),
        field: v.string(),
      }),
    ),
    validation: v.optional(
      v.object({
        required: v.optional(v.boolean()),
        min: v.optional(v.number()),
        max: v.optional(v.number()),
        pattern: v.optional(v.string()),
        minLength: v.optional(v.number()),
        maxLength: v.optional(v.number()),
      }),
    ),
    placeholder: v.optional(v.string()),
    helpText: v.optional(v.string()),
    width: v.union(v.literal("full"), v.literal("half")),
  })
    .index("by_template", ["templateId"])
    .index("by_templateAndKey", ["templateId", "fieldKey"]),

  documentInstances: defineTable({
    organizationId: v.id("organizations"),
    // Type discriminator
    type: v.optional(v.union(v.literal("template"), v.literal("file"))),
    // Template fields (optional for file type)
    templateId: v.optional(v.id("documentTemplates")),
    templateVersion: v.optional(v.number()),
    renderedContent: v.optional(v.string()),
    fieldValues: v.optional(v.any()),
    resolvedSources: v.optional(v.any()),
    // File fields (optional for template type)
    fileId: v.optional(v.id("_storage")),
    fileUrl: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    category: v.optional(v.string()),
    // Common fields
    title: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("pending_review"),
      v.literal("approved"),
      v.literal("pending_signature"),
      v.literal("signed"),
      v.literal("archived"),
    ),
    module: v.optional(v.string()),
    signatures: v.array(
      v.object({
        slotId: v.string(),
        slotLabel: v.string(),
        verificationMethod: v.optional(
          v.union(v.literal("click"), v.literal("sms"), v.literal("email_otp")),
        ),
        signerType: v.optional(
          v.union(v.literal("internal"), v.literal("external")),
        ),
        signerUserId: v.optional(v.id("users")),
        signerEmail: v.optional(v.string()),
        signerName: v.optional(v.string()),
        signerPhone: v.optional(v.string()),
        signatureData: v.optional(v.string()),
        signedByUserId: v.optional(v.id("users")),
        signedByName: v.optional(v.string()),
        signedAt: v.optional(v.number()),
      }),
    ),
    pdfFileId: v.optional(v.id("_storage")),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    assignedReviewerId: v.optional(v.id("users")),
    assignedReviewerName: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
  })
    .index("by_org", ["organizationId"])
    .index("by_orgAndStatus", ["organizationId", "status"])
    .index("by_orgAndModule", ["organizationId", "module"])
    .index("by_template", ["templateId"])
    .searchIndex("search_documents", {
      searchField: "title",
      filterFields: ["organizationId", "status", "module"],
    }),

  // --- Document Signing ---

  signatureRequests: defineTable({
    organizationId: v.id("organizations"),
    instanceId: v.id("documentInstances"),
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
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
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
    organizationId: v.id("organizations"),
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
    emailEventLogId: v.optional(v.id("emailEventLog")),
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
    organizationId: v.id("organizations"),
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
    isActive: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_org", ["organizationId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["organizationId"],
    }),

  gabinetRooms: defineTable({
    organizationId: v.id("organizations"),
    locationId: v.id("gabinetLocations"),
    name: v.string(),
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_org", ["organizationId"])
    .index("by_location", ["locationId"]),

  gabinetEquipment: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    currentLocationId: v.optional(v.id("gabinetLocations")),
    currentRoomId: v.optional(v.id("gabinetRooms")),
    status: v.union(
      v.literal("available"),
      v.literal("in_use"),
      v.literal("maintenance"),
      v.literal("retired"),
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_org", ["organizationId"])
    .index("by_location", ["organizationId", "currentLocationId"])
    .index("by_room", ["organizationId", "currentRoomId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["organizationId"],
    }),

  gabinetEquipmentTransfers: defineTable({
    organizationId: v.id("organizations"),
    equipmentId: v.id("gabinetEquipment"),
    fromLocationId: v.optional(v.id("gabinetLocations")),
    toLocationId: v.id("gabinetLocations"),
    toRoomId: v.optional(v.id("gabinetRooms")),
    transferredBy: v.id("users"),
    transferredAt: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_equipment", ["equipmentId"])
    .index("by_org", ["organizationId"])
    .index("by_orgAndTime", ["organizationId", "transferredAt"]),
  };
}
