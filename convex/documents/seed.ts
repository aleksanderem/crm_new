import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { v, type GenericId } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";

// ---------------------------------------------------------------------------
// Seed PDFme-based form templates (formTemplates table)
// ---------------------------------------------------------------------------

/** Authenticated version — callable from frontend */
export const seedFormTemplates = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    return await seedHandler(ctx, args.organizationId, user._id);
  },
});

/** Internal version — callable from CLI via `convex run` */
export const seedFormTemplatesInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await seedHandler(ctx, args.organizationId, args.userId);
  },
});

// ---------------------------------------------------------------------------
// Shared handler
// ---------------------------------------------------------------------------

async function seedHandler(
  ctx: MutationCtx,
  orgId: GenericId<"organizations">,
  userId: GenericId<"users">,
) {
  // Get existing template names to avoid duplicates
  const existingTemplates = await ctx.db
    .query("formTemplates")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();
  const existingNames = new Set(existingTemplates.map((t) => t.name));

  const now = Date.now();
  const templates = buildTemplates();

  let count = 0;
  for (const tmpl of templates) {
    // Skip if template with same name already exists
    if (existingNames.has(tmpl.name)) continue;
    await ctx.db.insert("formTemplates", {
      organizationId: orgId,
      ...tmpl,
      version: 1,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    count++;
  }

  return { skipped: false, count, message: `Seeded ${count} form templates` };
}

// ---------------------------------------------------------------------------
// PDFme helper — builds a single text schema field
// ---------------------------------------------------------------------------

interface TextField {
  name: string;
  type: "text";
  content: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  fontSize?: number;
  fontWeight?: string;
  alignment?: "left" | "center" | "right";
  lineHeight?: number;
  fontColor?: string;
}

function text(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: {
    content?: string;
    fontSize?: number;
    fontWeight?: string;
    alignment?: "left" | "center" | "right";
    lineHeight?: number;
    fontColor?: string;
  } = {},
): TextField {
  return {
    name,
    type: "text" as const,
    content: opts.content ?? "",
    position: { x, y },
    width,
    height,
    ...(opts.fontSize !== undefined && { fontSize: opts.fontSize }),
    ...(opts.fontWeight !== undefined && { fontWeight: opts.fontWeight }),
    ...(opts.alignment !== undefined && { alignment: opts.alignment }),
    ...(opts.lineHeight !== undefined && { lineHeight: opts.lineHeight }),
    ...(opts.fontColor !== undefined && { fontColor: opts.fontColor }),
  };
}

/** A4 base PDF definition */
const A4_BASE = { width: 210, height: 297, padding: [15, 15, 15, 15] as number[] };

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

function buildTemplates() {
  return [
    buildConsentTemplate(),
    buildIntakeTemplate(),
    buildPrescriptionTemplate(),
    buildReferralTemplate(),
    buildContractTemplate(),
  ];
}

// ── 1. Zgoda na zabieg (Treatment Consent) ────────────────────────────────

function buildConsentTemplate() {
  const fields: TextField[] = [
    // Title
    text("title_label", 15, 15, 180, 10, {
      content: "ZGODA NA WYKONANIE ZABIEGU",
      fontSize: 18,
      fontWeight: "bold",
      alignment: "center",
    }),
    // Organization name
    text("organization.name", 15, 28, 180, 7, {
      content: "[Nazwa organizacji]",
      fontSize: 11,
      alignment: "center",
      fontColor: "#555555",
    }),
    // Separator
    text("separator_1", 15, 38, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Patient info block
    text("patient_intro", 15, 46, 12, 7, {
      content: "Ja, ",
      fontSize: 10,
    }),
    text("contact.firstName", 27, 46, 40, 7, { content: "[Imię kontaktu]", fontSize: 10 }),
    text("contact.lastName", 68, 46, 50, 7, { content: "[Nazwisko kontaktu]", fontSize: 10 }),

    text("pesel_label", 15, 55, 18, 7, {
      content: "PESEL: ",
      fontSize: 10,
    }),
    text("patient.pesel", 33, 55, 60, 7, { content: "[PESEL pacjenta]", fontSize: 10 }),

    // Treatment info section
    text("treatment_header", 15, 68, 180, 7, {
      content: "INFORMACJE O ZABIEGU",
      fontSize: 12,
      fontWeight: "bold",
    }),

    text("treatment_name_label", 15, 78, 25, 6, {
      content: "Zabieg:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("treatment.name", 42, 78, 153, 6, { content: "[Nazwa zabiegu]", fontSize: 10 }),

    text("treatment_desc_label", 15, 87, 25, 6, {
      content: "Opis:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("treatment.description", 42, 87, 153, 18, {
      content: "[Opis zabiegu]",
      fontSize: 9,
      lineHeight: 1.4,
    }),

    text("contraindications_label", 15, 109, 50, 6, {
      content: "Przeciwwskazania:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("treatment.contraindications", 15, 117, 180, 18, {
      content: "[Przeciwwskazania]",
      fontSize: 9,
      lineHeight: 1.4,
    }),

    text("aftercare_label", 15, 139, 60, 6, {
      content: "Zalecenia pozabiegowe:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("treatment.aftercareInstructions", 15, 147, 180, 18, {
      content: "[Zalecenia pozabiegowe]",
      fontSize: 9,
      lineHeight: 1.4,
    }),

    // Separator
    text("separator_2", 15, 170, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Consent text
    text("consent_text", 15, 178, 180, 30, {
      content:
        "Oświadczam, że zostałem/am poinformowany/a o rodzaju zabiegu, jego przebiegu, " +
        "możliwych powikłaniach oraz zaleceniach pozabiegowych. Wyrażam świadomą zgodę " +
        "na wykonanie powyższego zabiegu. Oświadczam, że miałem/am możliwość zadawania " +
        "pytań i uzyskałem/am na nie wyczerpujące odpowiedzi.",
      fontSize: 9,
      lineHeight: 1.5,
    }),

    // Date
    text("date_label", 15, 215, 15, 7, {
      content: "Data:",
      fontSize: 10,
    }),
    text("system.date_pl", 31, 215, 50, 7, { content: "[Data]", fontSize: 10 }),

    // Signature line
    text("signature_label", 15, 235, 80, 7, {
      content: "Podpis pacjenta: ___________________________",
      fontSize: 10,
    }),

    // Employee
    text("employee_label", 110, 235, 30, 7, {
      content: "Wykonujący:",
      fontSize: 10,
    }),
    text("employee.firstName", 141, 235, 25, 7, { content: "[Imię pracownika]", fontSize: 10 }),
    text("employee.lastName", 167, 235, 28, 7, { content: "[Nazwisko pracownika]", fontSize: 10 }),
  ];

  const formJson = JSON.stringify({
    basePdf: A4_BASE,
    schemas: [fields],
  });

  // Validate JSON roundtrip
  JSON.parse(formJson);

  return {
    name: "Zgoda na zabieg",
    description: "Formularz świadomej zgody pacjenta na wykonanie zabiegu medycznego/kosmetycznego",
    category: "consent" as const,
    formJson,
    modules: ["gabinet"],
    entityTypes: ["appointment"],
    requiresSignature: true,
    signatureConfig: {
      method: "draw" as const,
      signerRole: "patient" as const,
    },
  };
}

// ── 2. Karta przyjęcia pacjenta (Patient Intake Form) ────────────────────

function buildIntakeTemplate() {
  const fields: TextField[] = [
    // Title
    text("title_label", 15, 15, 180, 10, {
      content: "KARTA PRZYJĘCIA PACJENTA",
      fontSize: 18,
      fontWeight: "bold",
      alignment: "center",
    }),
    // Organization name
    text("organization.name", 15, 28, 180, 7, {
      content: "[Nazwa organizacji]",
      fontSize: 11,
      alignment: "center",
      fontColor: "#555555",
    }),
    // Separator
    text("separator_1", 15, 38, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Patient data section header
    text("patient_header", 15, 46, 180, 7, {
      content: "DANE PACJENTA",
      fontSize: 12,
      fontWeight: "bold",
    }),

    // First name
    text("fname_label", 15, 56, 20, 6, {
      content: "Imię:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.firstName", 45, 56, 60, 6, { content: "[Imię pacjenta]", fontSize: 10 }),

    // Last name
    text("lname_label", 110, 56, 30, 6, {
      content: "Nazwisko:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.lastName", 145, 56, 50, 6, { content: "[Nazwisko pacjenta]", fontSize: 10 }),

    // PESEL
    text("pesel_label", 15, 66, 20, 6, {
      content: "PESEL:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.pesel", 45, 66, 60, 6, { content: "[PESEL pacjenta]", fontSize: 10 }),

    // Date of birth
    text("dob_label", 110, 66, 35, 6, {
      content: "Data urodzenia:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.dateOfBirth", 150, 66, 45, 6, { content: "[Data urodzenia]", fontSize: 10 }),

    // Gender
    text("gender_label", 15, 76, 15, 6, {
      content: "Płeć:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.gender", 45, 76, 40, 6, { content: "[Płeć]", fontSize: 10 }),

    // Blood type
    text("blood_label", 110, 76, 30, 6, {
      content: "Grupa krwi:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.bloodType", 150, 76, 45, 6, { content: "[Grupa krwi]", fontSize: 10 }),

    // Allergies section
    text("allergies_header", 15, 90, 180, 7, {
      content: "ALERGIE I UCZULENIA",
      fontSize: 12,
      fontWeight: "bold",
    }),
    text("patient.allergies", 15, 99, 180, 20, {
      content: "[Alergie]",
      fontSize: 9,
      lineHeight: 1.4,
    }),

    // Medical notes
    text("notes_header", 15, 124, 180, 7, {
      content: "NOTATKI MEDYCZNE",
      fontSize: 12,
      fontWeight: "bold",
    }),
    text("patient.medicalNotes", 15, 133, 180, 25, {
      content: "[Notatki medyczne]",
      fontSize: 9,
      lineHeight: 1.4,
    }),

    // Contact info section
    text("contact_header", 15, 164, 180, 7, {
      content: "DANE KONTAKTOWE",
      fontSize: 12,
      fontWeight: "bold",
    }),
    text("email_label", 15, 174, 15, 6, {
      content: "Email:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.email", 45, 174, 60, 6, { content: "[Email pacjenta]", fontSize: 10 }),
    text("phone_label", 110, 174, 20, 6, {
      content: "Telefon:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.phone", 140, 174, 55, 6, { content: "[Telefon pacjenta]", fontSize: 10 }),

    // Address
    text("address_header", 15, 184, 180, 6, {
      content: "Adres:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.address.street", 45, 184, 60, 6, { content: "[Ulica pacjenta]", fontSize: 10 }),
    text("patient.address.postalCode", 110, 184, 25, 6, { content: "[Kod pocztowy pacjenta]", fontSize: 10 }),
    text("patient.address.city", 140, 184, 55, 6, { content: "[Miasto pacjenta]", fontSize: 10 }),

    // Emergency contact section
    text("emergency_header", 15, 198, 180, 7, {
      content: "KONTAKT W NAGŁYCH WYPADKACH",
      fontSize: 12,
      fontWeight: "bold",
    }),
    text("emergency_name_label", 15, 208, 30, 6, {
      content: "Osoba kontaktowa:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.emergencyContactName", 55, 208, 50, 6, { content: "[Kontakt awaryjny — imię]", fontSize: 10 }),
    text("emergency_phone_label", 110, 208, 20, 6, {
      content: "Telefon:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.emergencyContactPhone", 140, 208, 55, 6, { content: "[Kontakt awaryjny — telefon]", fontSize: 10 }),

    // Separator
    text("separator_2", 15, 222, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Date
    text("date_label", 15, 230, 15, 7, {
      content: "Data:",
      fontSize: 10,
    }),
    text("system.date_pl", 31, 230, 50, 7, { content: "[Data]", fontSize: 10 }),
  ];

  const formJson = JSON.stringify({
    basePdf: A4_BASE,
    schemas: [fields],
  });

  JSON.parse(formJson);

  return {
    name: "Karta przyjęcia pacjenta",
    description: "Formularz zbierający podstawowe dane medyczne i kontaktowe nowego pacjenta",
    category: "intake" as const,
    formJson,
    modules: ["gabinet"],
    entityTypes: ["patient"],
    requiresSignature: false,
  };
}

// ── 3. Recepta (Prescription) ─────────────────────────────────────────────

function buildPrescriptionTemplate() {
  const fields: TextField[] = [
    // Title
    text("title_label", 15, 15, 180, 10, {
      content: "RECEPTA",
      fontSize: 18,
      fontWeight: "bold",
      alignment: "center",
    }),
    // Organization name
    text("organization.name", 15, 28, 180, 7, {
      content: "[Nazwa organizacji]",
      fontSize: 11,
      alignment: "center",
      fontColor: "#555555",
    }),
    // Separator
    text("separator_1", 15, 38, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Date (top right)
    text("date_label", 140, 46, 15, 6, {
      content: "Data:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("system.date_pl", 156, 46, 39, 6, { content: "[Data]", fontSize: 10 }),

    // Patient section
    text("patient_header", 15, 46, 100, 7, {
      content: "DANE PACJENTA",
      fontSize: 12,
      fontWeight: "bold",
    }),
    text("fname_label", 15, 56, 20, 6, {
      content: "Imię:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.firstName", 38, 56, 50, 6, { content: "[Imię pacjenta]", fontSize: 10 }),

    text("lname_label", 95, 56, 25, 6, {
      content: "Nazwisko:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.lastName", 125, 56, 70, 6, { content: "[Nazwisko pacjenta]", fontSize: 10 }),

    text("pesel_label", 15, 65, 20, 6, {
      content: "PESEL:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.pesel", 38, 65, 60, 6, { content: "[PESEL pacjenta]", fontSize: 10 }),

    // Treatment
    text("treatment_label", 15, 78, 25, 6, {
      content: "Zabieg:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("treatment.name", 42, 78, 153, 6, { content: "[Nazwa zabiegu]", fontSize: 10 }),

    // Separator
    text("separator_2", 15, 88, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Prescription header
    text("rp_header", 15, 96, 180, 8, {
      content: "Rp.",
      fontSize: 14,
      fontWeight: "bold",
    }),

    // Large prescription body area
    text("prescription_body", 15, 108, 180, 110, {
      content: "[Wpisz treść recepty...]",
      fontSize: 11,
      lineHeight: 1.6,
    }),

    // Separator
    text("separator_3", 15, 225, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Doctor info
    text("doctor_header", 110, 233, 85, 7, {
      content: "Lekarz prowadzący:",
      fontSize: 10,
      fontWeight: "bold",
      alignment: "right",
    }),
    text("employee.firstName", 110, 242, 40, 6, {
      content: "[Imię pracownika]",
      fontSize: 10,
      alignment: "right",
    }),
    text("employee.lastName", 152, 242, 43, 6, { content: "[Nazwisko pracownika]", fontSize: 10 }),
    text("employee.licenseNumber", 110, 250, 85, 6, {
      content: "[Numer licencji]",
      fontSize: 9,
      alignment: "right",
      fontColor: "#555555",
    }),
  ];

  const formJson = JSON.stringify({
    basePdf: A4_BASE,
    schemas: [fields],
  });

  JSON.parse(formJson);

  return {
    name: "Recepta",
    description: "Szablon recepty z danymi pacjenta, zabiegu i lekarza prowadzącego",
    category: "prescription" as const,
    formJson,
    modules: ["gabinet"],
    entityTypes: ["appointment"],
    requiresSignature: false,
  };
}

// ── 4. Skierowanie (Referral) ─────────────────────────────────────────────

function buildReferralTemplate() {
  const fields: TextField[] = [
    // Title
    text("title_label", 15, 15, 180, 10, {
      content: "SKIEROWANIE",
      fontSize: 18,
      fontWeight: "bold",
      alignment: "center",
    }),
    // Organization name
    text("organization.name", 15, 28, 180, 7, {
      content: "[Nazwa organizacji]",
      fontSize: 11,
      alignment: "center",
      fontColor: "#555555",
    }),

    // Date (top right)
    text("date_label", 140, 40, 15, 6, {
      content: "Data:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("system.date_pl", 156, 40, 39, 6, { content: "[Data]", fontSize: 10 }),

    // Separator
    text("separator_1", 15, 48, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Patient section
    text("patient_header", 15, 56, 100, 7, {
      content: "DANE PACJENTA",
      fontSize: 12,
      fontWeight: "bold",
    }),

    text("fname_label", 15, 66, 20, 6, {
      content: "Imię:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.firstName", 38, 66, 50, 6, { content: "[Imię pacjenta]", fontSize: 10 }),

    text("lname_label", 95, 66, 25, 6, {
      content: "Nazwisko:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.lastName", 125, 66, 70, 6, { content: "[Nazwisko pacjenta]", fontSize: 10 }),

    text("pesel_label", 15, 75, 20, 6, {
      content: "PESEL:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("patient.pesel", 38, 75, 60, 6, { content: "[PESEL pacjenta]", fontSize: 10 }),

    // Separator
    text("separator_2", 15, 85, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Referral body intro
    text("referral_intro", 15, 93, 180, 7, {
      content: "Kieruję wyżej wymienionego pacjenta na konsultację / badanie / zabieg:",
      fontSize: 10,
    }),

    // Large referral body area
    text("referral_body", 15, 104, 180, 110, {
      content: "[Wpisz treść skierowania...]",
      fontSize: 11,
      lineHeight: 1.6,
    }),

    // Separator
    text("separator_3", 15, 222, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Diagnosis / reason
    text("diagnosis_label", 15, 230, 30, 6, {
      content: "Rozpoznanie:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("appointment.notes", 50, 230, 145, 12, {
      content: "[Notatki wizyty]",
      fontSize: 9,
      lineHeight: 1.4,
    }),

    // Doctor info
    text("doctor_header", 110, 250, 85, 7, {
      content: "Lekarz kierujący:",
      fontSize: 10,
      fontWeight: "bold",
      alignment: "right",
    }),
    text("employee.firstName", 110, 259, 40, 6, {
      content: "[Imię pracownika]",
      fontSize: 10,
      alignment: "right",
    }),
    text("employee.lastName", 152, 259, 43, 6, { content: "[Nazwisko pracownika]", fontSize: 10 }),
    text("employee.specialization", 110, 267, 85, 6, {
      content: "[Specjalizacja]",
      fontSize: 9,
      alignment: "right",
      fontColor: "#555555",
    }),
    text("employee.licenseNumber", 110, 274, 85, 6, {
      content: "[Numer licencji]",
      fontSize: 9,
      alignment: "right",
      fontColor: "#555555",
    }),
  ];

  const formJson = JSON.stringify({
    basePdf: A4_BASE,
    schemas: [fields],
  });

  JSON.parse(formJson);

  return {
    name: "Skierowanie",
    description: "Szablon skierowania pacjenta na konsultację, badanie lub zabieg specjalistyczny",
    category: "referral" as const,
    formJson,
    modules: ["gabinet"],
    entityTypes: ["appointment"],
    requiresSignature: false,
  };
}

// ── 5. Umowa handlowa (Sales Contract) ────────────────────────────────────

function buildContractTemplate() {
  const fields: TextField[] = [
    // Title
    text("title_label", 15, 15, 180, 10, {
      content: "UMOWA",
      fontSize: 18,
      fontWeight: "bold",
      alignment: "center",
    }),
    // Organization name
    text("organization.name", 15, 28, 180, 7, {
      content: "[Nazwa organizacji]",
      fontSize: 11,
      alignment: "center",
      fontColor: "#555555",
    }),
    // Date
    text("date_label", 15, 38, 15, 6, {
      content: "Data:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("system.date_pl", 31, 38, 50, 6, { content: "[Data]", fontSize: 10 }),

    // Separator
    text("separator_1", 15, 47, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Parties section
    text("parties_header", 15, 55, 180, 7, {
      content: "STRONY UMOWY",
      fontSize: 12,
      fontWeight: "bold",
    }),

    // Company / seller info
    text("seller_label", 15, 65, 50, 6, {
      content: "Wykonawca / Sprzedawca:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("company.name", 15, 73, 85, 6, { content: "[Nazwa firmy]", fontSize: 10 }),
    text("company.address.street", 15, 80, 50, 6, {
      content: "[Ulica firmy]",
      fontSize: 9,
      fontColor: "#555555",
    }),
    text("company.address.zip", 15, 86, 15, 6, {
      content: "[Kod pocztowy firmy]",
      fontSize: 9,
      fontColor: "#555555",
    }),
    text("company.address.city", 32, 86, 50, 6, {
      content: "[Miasto firmy]",
      fontSize: 9,
      fontColor: "#555555",
    }),
    text("company.phone", 15, 92, 50, 6, {
      content: "[Telefon firmy]",
      fontSize: 9,
      fontColor: "#555555",
    }),

    // Contact / buyer info
    text("buyer_label", 110, 65, 50, 6, {
      content: "Zamawiający / Kupujący:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("contact.firstName", 110, 73, 35, 6, { content: "[Imię kontaktu]", fontSize: 10 }),
    text("contact.lastName", 147, 73, 48, 6, { content: "[Nazwisko kontaktu]", fontSize: 10 }),
    text("contact.email", 110, 80, 85, 6, {
      content: "[Email kontaktu]",
      fontSize: 9,
      fontColor: "#555555",
    }),
    text("contact.phone", 110, 86, 85, 6, {
      content: "[Telefon kontaktu]",
      fontSize: 9,
      fontColor: "#555555",
    }),

    // Lead info
    text("lead_header", 15, 104, 180, 7, {
      content: "PRZEDMIOT UMOWY",
      fontSize: 12,
      fontWeight: "bold",
    }),

    text("lead_title_label", 15, 114, 20, 6, {
      content: "Temat:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("lead.title", 38, 114, 157, 6, { content: "[Tytuł leada]", fontSize: 10 }),

    text("lead_value_label", 15, 123, 20, 6, {
      content: "Kwota:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("lead.value", 38, 123, 40, 6, { content: "[Wartość leada]", fontSize: 10 }),
    text("lead.currency", 80, 123, 20, 6, {
      content: "[Waluta]",
      fontSize: 10,
      fontColor: "#555555",
    }),

    // Separator
    text("separator_2", 15, 133, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Contract body area
    text("contract_header", 15, 140, 180, 7, {
      content: "WARUNKI UMOWY",
      fontSize: 12,
      fontWeight: "bold",
    }),
    text("contract_body", 15, 150, 180, 85, {
      content: "[Wpisz warunki umowy...]",
      fontSize: 10,
      lineHeight: 1.5,
    }),

    // Separator
    text("separator_3", 15, 240, 180, 3, {
      content: "─────────────────────────────────────────────────────────────────────",
      fontSize: 6,
      alignment: "center",
      fontColor: "#cccccc",
    }),

    // Signature section
    text("sig_seller_label", 15, 250, 80, 6, {
      content: "Podpis Wykonawcy:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("sig_seller_line", 15, 260, 80, 7, {
      content: "___________________________",
      fontSize: 10,
    }),

    text("sig_buyer_label", 115, 250, 80, 6, {
      content: "Podpis Zamawiającego:",
      fontSize: 10,
      fontWeight: "bold",
    }),
    text("sig_buyer_line", 115, 260, 80, 7, {
      content: "___________________________",
      fontSize: 10,
    }),
  ];

  const formJson = JSON.stringify({
    basePdf: A4_BASE,
    schemas: [fields],
  });

  JSON.parse(formJson);

  return {
    name: "Umowa handlowa",
    description: "Szablon umowy sprzedażowej z danymi kontaktu, firmy i leada",
    category: "contract" as const,
    formJson,
    modules: ["crm"],
    entityTypes: ["lead", "contact"],
    requiresSignature: true,
    signatureConfig: {
      method: "click" as const,
      signerRole: "client" as const,
    },
  };
}
