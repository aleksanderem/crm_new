import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { v, type GenericId } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// ---------------------------------------------------------------------------
// Seed example document templates + email templates
// ---------------------------------------------------------------------------

/** Internal version — callable from CLI via `convex run` */
export const seedExampleTemplatesInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      return await seedHandler(ctx, args.organizationId, args.userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[seedTemplates] Seed failed:", message);
      return { skipped: false, message: `Seed failed: ${message}`, error: message };
    }
  },
});

/** Authenticated version — callable from frontend */
export const seedExampleTemplates = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    try {
      return await seedHandler(ctx, args.organizationId, user._id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[seedTemplates] Seed failed:", message);
      return { skipped: false, message: `Seed failed: ${message}`, error: message };
    }
  },
});

async function seedHandler(ctx: MutationCtx, orgId: GenericId<"organizations">, userId: GenericId<"users">): Promise<{ skipped: boolean; documentTemplates?: number; emailTemplates?: number; message: string; error?: string }> {
  const now = Date.now();

  // Idempotency check
  const existingEmail = await ctx.db
    .query("emailTemplates")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .first();
  const existingDoc = await ctx.db
    .query("documentTemplates")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .collect();
  const hasRealDocTemplates = existingDoc.some(
    (t) => t.name.includes("świadczenie") || t.name.includes("Zgoda"),
  );
  if (existingEmail && hasRealDocTemplates)
    return { skipped: true, message: "Templates already exist" };

  const accessAll = { mode: "all" as const, roles: [], userIds: [] };

  // ─── DOCUMENT TEMPLATES ──────────────────────────────────────

  let docCount = 0;

  if (!hasRealDocTemplates) {
    // 1. Service contract (CRM)
    const serviceContractId = await ctx.db.insert("documentTemplates", {
      organizationId: orgId,
      name: "Umowa o świadczenie usług",
      description: "Standardowa umowa B2B na świadczenie usług",
      category: "contract",
      module: "crm",
      requiredSources: ["contact", "company"],
      requiresSignature: true,
      signatureSlots: [
        { id: "s1", role: "author", label: "Przedstawiciel firmy", signerType: "internal" },
        { id: "s2", role: "client", label: "Klient", signerType: "external", verificationMethod: "email_otp" },
      ],
      accessControl: accessAll,
      content: `<h1 style="text-align:center">UMOWA O ŚWIADCZENIE USŁUG</h1>
<p style="text-align:center">Nr {{field:contract_number}} z dnia {{field:contract_date}}</p>
<hr/>
<p>zawarta pomiędzy:</p>
<p><strong>{{field:company_name}}</strong>, NIP: {{field:company_nip}}, z siedzibą w {{field:company_address}}, reprezentowaną przez {{field:representative_name}}, zwaną dalej <em>Zleceniodawcą</em>,</p>
<p>a</p>
<p><strong>{{field:client_name}}</strong>, {{field:client_email}}, zwanym dalej <em>Zleceniobiorcą</em>,</p>
<hr/>
<h2>§1 Przedmiot umowy</h2>
<p>{{field:contract_scope}}</p>
<h2>§2 Termin realizacji</h2>
<p>Umowa obowiązuje od {{field:start_date}} do {{field:end_date}}.</p>
<h2>§3 Wynagrodzenie</h2>
<p>Za wykonanie przedmiotu umowy Zleceniodawca zapłaci kwotę <strong>{{field:amount}} PLN</strong> netto, powiększoną o należny podatek VAT. Płatność w terminie {{field:payment_days}} dni od faktury.</p>
<h2>§4 Postanowienia końcowe</h2>
<p>Wszelkie zmiany wymagają formy pisemnej. W sprawach nieuregulowanych stosuje się przepisy Kodeksu Cywilnego.</p>`,
      version: 1,
      status: "active",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    const serviceContractFields = [
      { fieldKey: "contract_number", label: "Numer umowy", type: "text" as const, sortOrder: 0, group: "Dane umowy", validation: { required: true } },
      { fieldKey: "contract_date", label: "Data zawarcia", type: "date" as const, sortOrder: 1, group: "Dane umowy", validation: { required: true } },
      { fieldKey: "company_name", label: "Nazwa firmy", type: "text" as const, sortOrder: 2, group: "Zleceniodawca", binding: { source: "company", field: "name" } },
      { fieldKey: "company_nip", label: "NIP firmy", type: "text" as const, sortOrder: 3, group: "Zleceniodawca", binding: { source: "company", field: "nip" } },
      { fieldKey: "company_address", label: "Adres firmy", type: "text" as const, sortOrder: 4, group: "Zleceniodawca", binding: { source: "company", field: "address" } },
      { fieldKey: "representative_name", label: "Przedstawiciel", type: "text" as const, sortOrder: 5, group: "Zleceniodawca" },
      { fieldKey: "client_name", label: "Imię i nazwisko klienta", type: "text" as const, sortOrder: 6, group: "Zleceniobiorca", binding: { source: "contact", field: "fullName" } },
      { fieldKey: "client_email", label: "Email klienta", type: "email" as const, sortOrder: 7, group: "Zleceniobiorca", binding: { source: "contact", field: "email" } },
      { fieldKey: "contract_scope", label: "Przedmiot umowy", type: "textarea" as const, sortOrder: 8, group: "Warunki", validation: { required: true } },
      { fieldKey: "start_date", label: "Data rozpoczęcia", type: "date" as const, sortOrder: 9, group: "Warunki", validation: { required: true } },
      { fieldKey: "end_date", label: "Data zakończenia", type: "date" as const, sortOrder: 10, group: "Warunki", validation: { required: true } },
      { fieldKey: "amount", label: "Kwota netto (PLN)", type: "currency" as const, sortOrder: 11, group: "Warunki", validation: { required: true } },
      { fieldKey: "payment_days", label: "Termin płatności (dni)", type: "number" as const, sortOrder: 12, group: "Warunki", defaultValue: "14" },
    ];
    for (const f of serviceContractFields) {
      await ctx.db.insert("documentTemplateFields", { templateId: serviceContractId, ...f, width: "full" // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
    docCount++;

    // 2. GDPR consent (Gabinet)
    const consentId = await ctx.db.insert("documentTemplates", {
      organizationId: orgId,
      name: "Zgoda na przetwarzanie danych osobowych",
      description: "Formularz zgody RODO dla pacjentów gabinetu",
      category: "consent",
      module: "gabinet",
      requiredSources: ["patient"],
      requiresSignature: true,
      signatureSlots: [
        { id: "s1", role: "patient", label: "Pacjent", signerType: "external", verificationMethod: "click" },
      ],
      accessControl: accessAll,
      content: `<h1 style="text-align:center">ZGODA NA PRZETWARZANIE DANYCH OSOBOWYCH</h1>
<p>Ja, <strong>{{field:patient_name}}</strong>, niniejszym wyrażam zgodę na przetwarzanie moich danych osobowych przez <strong>{{field:org_name}}</strong> w celu prowadzenia dokumentacji, umawiania wizyt i kontaktu w ich sprawie.</p>
<p>Zostałem/am poinformowany/a o przysługujących mi prawach, w tym prawie do wycofania zgody w dowolnym momencie.</p>
<p>Data: {{field:consent_date}}</p>`,
      version: 1,
      status: "active",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    const consentFields = [
      { fieldKey: "patient_name", label: "Imię i nazwisko pacjenta", type: "text" as const, sortOrder: 0, binding: { source: "patient", field: "fullName" }, validation: { required: true } },
      { fieldKey: "org_name", label: "Nazwa gabinetu", type: "text" as const, sortOrder: 1, validation: { required: true } },
      { fieldKey: "consent_date", label: "Data zgody", type: "date" as const, sortOrder: 2, validation: { required: true } },
    ];
    for (const f of consentFields) {
      await ctx.db.insert("documentTemplateFields", { templateId: consentId, ...f, width: "full" // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    }
    docCount++;
  }

  // ─── EMAIL TEMPLATES ──────────────────────────────────────────

  if (existingEmail) {
    return { skipped: false, documentTemplates: docCount, emailTemplates: 0, message: "Email templates already exist, only document templates seeded" };
  }

  const emailTemplates = [
    {
      name: "Potwierdzenie wizyty",
      subject: "Potwierdzenie wizyty – {{appointmentDate}} o {{appointmentTime}}",
      body: `<p>Drogi/a {{patientName}},</p>
<p>Potwierdzamy Twoją wizytę:</p>
<ul>
  <li><strong>Data:</strong> {{appointmentDate}}</li>
  <li><strong>Godzina:</strong> {{appointmentTime}}</li>
  <li><strong>Zabieg:</strong> {{treatmentName}}</li>
  <li><strong>Specjalista:</strong> {{employeeName}}</li>
</ul>
<p>W razie pytań prosimy o kontakt.</p>`,
      category: "gabinet",
      module: "gabinet",
      variables: [
        { key: "patientName", label: "Imię i nazwisko klienta", source: "patient" },
        { key: "appointmentDate", label: "Data wizyty", source: "appointment" },
        { key: "appointmentTime", label: "Godzina wizyty", source: "appointment" },
        { key: "treatmentName", label: "Nazwa zabiegu", source: "appointment" },
        { key: "employeeName", label: "Specjalista", source: "appointment" },
      ],
    },
    {
      name: "Przypomnienie o wizycie",
      subject: "Przypomnienie: wizyta jutro o {{appointmentTime}}",
      body: `<p>Drogi/a {{patientName}},</p>
<p>Przypominamy o jutrzejszej wizycie:</p>
<ul>
  <li><strong>Data:</strong> {{appointmentDate}}</li>
  <li><strong>Godzina:</strong> {{appointmentTime}}</li>
  <li><strong>Zabieg:</strong> {{treatmentName}}</li>
</ul>
<p>Do zobaczenia!</p>`,
      category: "gabinet",
      module: "gabinet",
      variables: [
        { key: "patientName", label: "Imię i nazwisko klienta", source: "patient" },
        { key: "appointmentDate", label: "Data wizyty", source: "appointment" },
        { key: "appointmentTime", label: "Godzina wizyty", source: "appointment" },
        { key: "treatmentName", label: "Nazwa zabiegu", source: "appointment" },
      ],
    },
    {
      name: "Odwołanie wizyty",
      subject: "Odwołanie wizyty – {{appointmentDate}}",
      body: `<p>Drogi/a {{patientName}},</p>
<p>Informujemy, że Twoja wizyta zaplanowana na <strong>{{appointmentDate}} o {{appointmentTime}}</strong> została odwołana.</p>
<p>{{cancellationReason}}</p>
<p>Prosimy o kontakt w celu umówienia nowego terminu.</p>`,
      category: "gabinet",
      module: "gabinet",
      variables: [
        { key: "patientName", label: "Imię i nazwisko klienta", source: "patient" },
        { key: "appointmentDate", label: "Data wizyty", source: "appointment" },
        { key: "appointmentTime", label: "Godzina wizyty", source: "appointment" },
        { key: "cancellationReason", label: "Powód odwołania", source: "appointment" },
      ],
    },
    {
      name: "Powitanie nowego kontaktu",
      subject: "Witamy w {{organizationName}}!",
      body: `<p>Drogi/a {{contactName}},</p>
<p>Dziękujemy za dołączenie do {{organizationName}}. Cieszymy się, że jesteś z nami!</p>
<p>W razie pytań jesteśmy do dyspozycji.</p>`,
      category: "crm",
      module: "crm",
      variables: [
        { key: "contactName", label: "Imię i nazwisko", source: "contact" },
        { key: "organizationName", label: "Nazwa organizacji", source: "contact" },
      ],
    },
    {
      name: "Zmiana statusu leada",
      subject: "Aktualizacja statusu: {{leadTitle}}",
      body: `<p>Drogi/a {{contactName}},</p>
<p>Status Twojego zapytania <strong>{{leadTitle}}</strong> zmienił się z <em>{{previousStage}}</em> na <em>{{newStage}}</em>.</p>
<p>Skontaktuje się z Tobą {{assigneeName}}.</p>`,
      category: "crm",
      module: "crm",
      variables: [
        { key: "contactName", label: "Imię i nazwisko", source: "contact" },
        { key: "leadTitle", label: "Tytuł leada", source: "lead" },
        { key: "previousStage", label: "Poprzedni etap", source: "lead" },
        { key: "newStage", label: "Nowy etap", source: "lead" },
        { key: "assigneeName", label: "Opiekun", source: "lead" },
      ],
    },
  ];

  let emailCount = 0;
  for (const tpl of emailTemplates) {
    await ctx.db.insert("emailTemplates", {
      organizationId: orgId,
      name: tpl.name,
      subject: tpl.subject,
      body: tpl.body,
      category: tpl.category,
      module: tpl.module,
      variables: tpl.variables,
      createdBy: userId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    emailCount++;
  }

  return {
    skipped: false,
    documentTemplates: docCount,
    emailTemplates: emailCount,
    message: `Seeded ${docCount} document templates and ${emailCount} email templates`,
  };
}
