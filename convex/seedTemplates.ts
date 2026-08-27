import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { v, type GenericId } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

// ---------------------------------------------------------------------------
// Seed example email templates
// (documentTemplates seeding removed in #5404 — the document_templates /
//  document_template_fields Supabase tables are superseded by form_templates)
// ---------------------------------------------------------------------------

/** Internal version — callable from CLI via `convex run` */
export const seedExampleTemplatesInternal = internalMutation({
  args: {
    organizationId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      return await seedHandler(ctx, args.organizationId as GenericId<"organizations">, args.userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[seedTemplates] Seed failed:", message);
      return { skipped: false, message: `Seed failed: ${message}`, error: message };
    }
  },
});

/** Authenticated version — callable from frontend */
export const seedExampleTemplates = mutation({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    try {
      return await seedHandler(ctx, args.organizationId as GenericId<"organizations">, user._id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[seedTemplates] Seed failed:", message);
      return { skipped: false, message: `Seed failed: ${message}`, error: message };
    }
  },
});

async function seedHandler(ctx: MutationCtx, orgId: GenericId<"organizations">, userId: GenericId<"users">): Promise<{ skipped: boolean; emailTemplates?: number; message: string; error?: string }> {
  const now = Date.now();

  // Idempotency check
  const existingEmail = await ctx.db
    .query("emailTemplates")
    .withIndex("by_org", (q) => q.eq("organizationId", orgId))
    .first();
  if (existingEmail)
    return { skipped: true, message: "Templates already exist" };

  // ─── EMAIL TEMPLATES ──────────────────────────────────────────

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
    emailTemplates: emailCount,
    message: `Seeded ${emailCount} email templates`,
  };
}
