/**
 * CRM Demo Data Seeder
 *
 * Seeds realistic Polish CRM demo data: contacts, companies, leads, activities,
 * notes, calls, emails, scheduled activities, and relationships.
 *
 * Usage:
 *   npx convex run crm/seed:seedAll '{"organizationId":"..."}'
 *   npx convex run crm/seed:clearAll '{"organizationId":"..."}'
 *
 * Idempotent — checks if contacts already exist before seeding.
 */

import { mutation, internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireOrgAdmin } from "../_helpers/auth";
import { Id } from "../_generated/dataModel";
import { createSupabaseDb } from "../_helpers/supabaseDb";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listOrgs = query({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    return orgs.map((o) => ({ id: o._id, name: o.name, ownerId: o.ownerId }));
  },
});

// ---------------------------------------------------------------------------
// Public / Internal entrypoints
// ---------------------------------------------------------------------------

export const seedAll = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    return await doSeed(ctx, args.organizationId, user._id);
  },
});

export const seedAllInternal = internalMutation({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    return await doSeed(ctx, args.organizationId, args.userId);
  },
});

export const clearAll = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    return await doClear(ctx, args.organizationId);
  },
});

export const clearAllInternal = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await doClear(ctx, args.organizationId);
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dayMs = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => now - n * dayMs;
const daysFromNow = (n: number) => now + n * dayMs;

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ---------------------------------------------------------------------------
// Seed implementation
// ---------------------------------------------------------------------------

async function doSeed(ctx: any, orgId: Id<"organizations">, userId: Id<"users">) {
  const supabaseDb = createSupabaseDb();

  // --- Guard ---
  const existing = await supabaseDb
    .query("contacts")
    .eq("organizationId", orgId)
    .first();
  if (existing) {
    throw new Error("CRM data already seeded for this organization. Run clearAll first.");
  }

  // Get pipeline stages for leads
  const stages = await supabaseDb
    .query("pipelineStages")
    .eq("organizationId", orgId)
    .collect();
  const stageMap: Record<string, Id<"pipelineStages">> = {};
  for (const s of stages) stageMap[s.name] = s._id as Id<"pipelineStages">;

  // ============================================================
  // 1. COMPANIES
  // ============================================================
  const companyData = [
    { name: "TechNova Sp. z o.o.", domain: "technova.pl", industry: "IT", size: "51-200", website: "https://technova.pl", phone: "+48 22 123 45 67", city: "Warszawa" },
    { name: "MediCare Polska", domain: "medicare.pl", industry: "Medycyna", size: "201-500", website: "https://medicare.pl", phone: "+48 22 234 56 78", city: "Kraków" },
    { name: "Green Solutions", domain: "greensolutions.pl", industry: "OZE", size: "11-50", website: "https://greensolutions.pl", phone: "+48 12 345 67 89", city: "Wrocław" },
    { name: "BuildRight Sp. z o.o.", domain: "buildright.pl", industry: "Budownictwo", size: "51-200", website: "https://buildright.pl", phone: "+48 71 456 78 90", city: "Poznań" },
    { name: "EduPlus", domain: "eduplus.pl", industry: "Edukacja", size: "11-50", website: "https://eduplus.pl", phone: "+48 58 567 89 01", city: "Gdańsk" },
    { name: "FoodMarket SA", domain: "foodmarket.pl", industry: "Spożywcza", size: "501-1000", website: "https://foodmarket.pl", phone: "+48 22 678 90 12", city: "Warszawa" },
    { name: "AutoLux", domain: "autolux.pl", industry: "Motoryzacja", size: "51-200", website: "https://autolux.pl", phone: "+48 32 789 01 23", city: "Katowice" },
    { name: "FinServe", domain: "finserve.pl", industry: "Finanse", size: "11-50", website: "https://finserve.pl", phone: "+48 22 890 12 34", city: "Warszawa" },
    { name: "CloudHost", domain: "cloudhost.pl", industry: "IT", size: "11-50", website: "https://cloudhost.pl", phone: "+48 22 901 23 45", city: "Warszawa" },
    { name: "BioPharm Polska", domain: "biopharm.pl", industry: "Farmacja", size: "201-500", website: "https://biopharm.pl", phone: "+48 22 012 34 56", city: "Łódź" },
    { name: "TravelMate", domain: "travelmate.pl", industry: "Turystyka", size: "11-50", website: "https://travelmate.pl", phone: "+48 12 123 45 67", city: "Kraków" },
    { name: "LogiTrans", domain: "logitrans.pl", industry: "Logistyka", size: "201-500", website: "https://logitrans.pl", phone: "+48 71 234 56 78", city: "Poznań" },
  ];

  const companyIds: string[] = [];
  for (const c of companyData) {
    const id = await supabaseDb.insert("companies", {
      organizationId: orgId,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      size: c.size,
      website: c.website,
      phone: c.phone,
      address: { city: c.city, country: "Polska" },
      createdBy: userId,
      createdAt: daysAgo(randomBetween(30, 180)),
      updatedAt: now,
    });
    companyIds.push(id);
  }

  // ============================================================
  // 2. CONTACTS
  // ============================================================
  const contactData = [
    { firstName: "Marek", lastName: "Wiśniewski", email: "marek.w@technova.pl", phone: "+48 600 111 222", title: "CTO", companyIdx: 0 },
    { firstName: "Katarzyna", lastName: "Domańska", email: "k.domanska@medicare.pl", phone: "+48 601 222 333", title: "Dyrektor ds. zakupów", companyIdx: 1 },
    { firstName: "Tomasz", lastName: "Zalewski", email: "t.zalewski@greensolutions.pl", phone: "+48 602 333 444", title: "CEO", companyIdx: 2 },
    { firstName: "Anna", lastName: "Mazur", email: "anna.m@buildright.pl", phone: "+48 603 444 555", title: "Project Manager", companyIdx: 3 },
    { firstName: "Piotr", lastName: "Jaworski", email: "p.jaworski@eduplus.pl", phone: "+48 604 555 666", title: "Dyrektor", companyIdx: 4 },
    { firstName: "Agnieszka", lastName: "Pawlik", email: "a.pawlik@foodmarket.pl", phone: "+48 605 666 777", title: "HR Manager", companyIdx: 5 },
    { firstName: "Robert", lastName: "Szczepański", email: "r.szczepanski@autolux.pl", phone: "+48 606 777 888", title: "Kierownik sprzedaży", companyIdx: 6 },
    { firstName: "Monika", lastName: "Kowalczyk", email: "m.kowalczyk@finserve.pl", phone: "+48 607 888 999", title: "CFO", companyIdx: 7 },
    { firstName: "Łukasz", lastName: "Gajewski", email: "l.gajewski@cloudhost.pl", phone: "+48 608 999 000", title: "DevOps Lead", companyIdx: 8 },
    { firstName: "Joanna", lastName: "Krakowska", email: "j.krakowska@biopharm.pl", phone: "+48 609 000 111", title: "Research Director", companyIdx: 9 },
    { firstName: "Michał", lastName: "Adamski", email: "m.adamski@travelmate.pl", phone: "+48 610 111 222", title: "Marketing Manager", companyIdx: 10 },
    { firstName: "Ewa", lastName: "Szymańska", email: "e.szymanska@logitrans.pl", phone: "+48 611 222 333", title: "Operations Director", companyIdx: 11 },
    // Independent contacts (no company)
    { firstName: "Zbigniew", lastName: "Lis", email: "zbyszek.lis@gmail.com", phone: "+48 700 100 200", title: "Konsultant" },
    { firstName: "Dorota", lastName: "Sikora", email: "dorota.sikora@wp.pl", phone: "+48 700 200 300" },
    { firstName: "Wojciech", lastName: "Baran", email: "w.baran@outlook.com", phone: "+48 700 300 400", title: "Freelancer IT" },
    { firstName: "Irena", lastName: "Czarnecka", email: "i.czarnecka@gmail.com", phone: "+48 700 400 500", title: "Prawnik" },
    { firstName: "Grzegorz", lastName: "Sawicki", email: "g.sawicki@onet.pl", phone: "+48 700 500 600" },
    { firstName: "Beata", lastName: "Kozłowska", email: "b.kozlowska@icloud.com", phone: "+48 700 600 700", title: "Księgowa" },
    { firstName: "Arkadiusz", lastName: "Jankowiak", email: "a.jankowiak@gmail.com", phone: "+48 700 700 800", title: "Architekt" },
    { firstName: "Natalia", lastName: "Stępień", email: "n.stepien@pm.me", phone: "+48 700 800 900" },
  ];

  const contactIds: string[] = [];
  for (const c of contactData) {
    const id = await supabaseDb.insert("contacts", {
      organizationId: orgId,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      title: c.title,
      source: randomPick(["Website", "Referral", "Cold Call", "Social Media", "Trade Show", "Email Campaign"]),
      tags: randomPick([[], ["VIP"], ["ważny"], ["hot lead"], []]),
      createdBy: userId,
      createdAt: daysAgo(randomBetween(10, 120)),
      updatedAt: now,
    });
    contactIds.push(id);
  }

  // ============================================================
  // 3. COMPANY-CONTACT RELATIONSHIPS
  // ============================================================
  for (let i = 0; i < Math.min(contactData.length, companyIds.length); i++) {
    const cd = contactData[i];
    if (cd.companyIdx !== undefined) {
      await supabaseDb.insert("objectRelationships", {
        organizationId: orgId,
        sourceType: "company",
        sourceId: companyIds[cd.companyIdx],
        targetType: "contact",
        targetId: contactIds[i],
        createdAt: daysAgo(randomBetween(10, 90)),
      });
    }
  }

  // ============================================================
  // 4. LEADS
  // ============================================================
  const leadData = [
    { title: "Licencja CRM Pro — TechNova", value: 45000, currency: "PLN", companyIdx: 0, contactIdx: 0, stage: "New" },
    { title: "System rezerwacji — MediCare", value: 120000, currency: "PLN", companyIdx: 1, contactIdx: 1, stage: "Qualified" },
    { title: "Audyt SEO — Green Solutions", value: 15000, currency: "PLN", companyIdx: 2, contactIdx: 2, stage: "Proposal" },
    { title: "Aplikacja mobilna — BuildRight", value: 80000, currency: "PLN", companyIdx: 3, contactIdx: 3, stage: "Negotiation" },
    { title: "Platforma e-learning — EduPlus", value: 65000, currency: "PLN", companyIdx: 4, contactIdx: 4, stage: "Won" },
    { title: "Integracja ERP — FoodMarket", value: 200000, currency: "PLN", companyIdx: 5, contactIdx: 5, stage: "Qualified" },
    { title: "Strona www + CMS — AutoLux", value: 35000, currency: "PLN", companyIdx: 6, contactIdx: 6, stage: "New" },
    { title: "Konsultacja bezpieczeństwa — FinServe", value: 25000, currency: "PLN", companyIdx: 7, contactIdx: 7, stage: "Proposal" },
    { title: "Migracja chmurowa — CloudHost", value: 55000, currency: "PLN", companyIdx: 8, contactIdx: 8, stage: "Won" },
    { title: "System zarządzania jakością — BioPharm", value: 150000, currency: "PLN", companyIdx: 9, contactIdx: 9, stage: "Lost" },
    { title: "Bot rezerwacyjny — TravelMate", value: 28000, currency: "PLN", companyIdx: 10, contactIdx: 10, stage: "New" },
    { title: "Moduł logistyczny — LogiTrans", value: 95000, currency: "PLN", companyIdx: 11, contactIdx: 11, stage: "Negotiation" },
    // Independent leads
    { title: "Konsulting strategiczny", value: 18000, currency: "PLN", contactIdx: 12, stage: "Qualified" },
    { title: "Szkolenie zespołu sprzedaży", value: 12000, currency: "PLN", contactIdx: 15, stage: "New" },
    { title: "Automatyzacja procesów", value: 42000, currency: "PLN", contactIdx: 18, stage: "Proposal" },
  ];

  const leadIds: string[] = [];
  for (const l of leadData) {
    const stageId = stageMap[l.stage];
    const stageOrder = stages.find((s: any) => s._id === stageId)?.order;
    const status = l.stage === "Won" ? "won" : l.stage === "Lost" ? "lost" : l.stage === "New" ? "open" : "open";
    const id = await supabaseDb.insert("leads", {
      organizationId: orgId,
      title: l.title,
      value: l.value,
      currency: l.currency ?? "PLN",
      status: status as any,
      companyId: l.companyIdx !== undefined ? companyIds[l.companyIdx] : undefined,
      assignedTo: userId,
      pipelineStageId: stageId,
      stageOrder,
      source: randomPick(["Website", "Referral", "Cold Call", "Trade Show"]),
      notes: l.stage === "Won" ? "Zamknięte pomyślnie" : l.stage === "Lost" ? "Klient wybrał konkurencję" : undefined,
      wonAt: l.stage === "Won" ? daysAgo(randomBetween(5, 30)) : undefined,
      lostAt: l.stage === "Lost" ? daysAgo(randomBetween(3, 20)) : undefined,
      lostReason: l.stage === "Lost" ? "Chose competitor" : undefined,
      createdBy: userId,
      createdAt: daysAgo(randomBetween(15, 60)),
      updatedAt: now,
    });
    leadIds.push(id);
  }

  // Company-Lead relationships
  for (let i = 0; i < leadData.length; i++) {
    const ld = leadData[i];
    if (ld.companyIdx !== undefined) {
      await supabaseDb.insert("objectRelationships", {
        organizationId: orgId,
        sourceType: "company",
        sourceId: companyIds[ld.companyIdx],
        targetType: "deal",
        targetId: leadIds[i],
        createdAt: daysAgo(randomBetween(5, 50)),
      });
    }
  }

  // ============================================================
  // 5. ACTIVITIES (timeline entries)
  // ============================================================
  const actionTypes = ["created", "updated", "note_added", "email_sent", "email_received", "call", "stage_changed", "status_changed", "relationship_added", "assigned", "document_uploaded"] as const;

  // Activities for contacts
  for (let i = 0; i < Math.min(12, contactIds.length); i++) {
    const count = randomBetween(2, 5);
    for (let j = 0; j < count; j++) {
      await supabaseDb.insert("activities", {
        organizationId: orgId,
        entityType: "contact",
        entityId: contactIds[i],
        action: randomPick([...actionTypes]) as any,
        description: randomPick([
          `Kontakt utworzony`,
          `Dane zaktualizowane`,
          `Notatka dodana`,
          `E-mail wysłany do ${contactData[i].email}`,
          `E-mail otrzymany od ${contactData[i].email}`,
          `Połączenie telefoniczne — ${randomBetween(2, 15)} min`,
          `Przypisano do ${contactData[i].firstName}`,
          `Dodano relację z firmą`,
          `Zmieniono status`,
        ]),
        performedBy: userId,
        createdAt: daysAgo(randomBetween(1, 30)),
      });
    }
  }

  // Activities for companies
  for (let i = 0; i < Math.min(8, companyIds.length); i++) {
    const count = randomBetween(1, 4);
    for (let j = 0; j < count; j++) {
      await supabaseDb.insert("activities", {
        organizationId: orgId,
        entityType: "company",
        entityId: companyIds[i],
        action: randomPick([...actionTypes]) as any,
        description: randomPick([
          `Firma dodana do bazy`,
          `Zaktualizowano profil firmy`,
          `Dodano nowy kontakt`,
          `Przypisano lead`,
          `Wysłano ofertę`,
        ]),
        performedBy: userId,
        createdAt: daysAgo(randomBetween(1, 45)),
      });
    }
  }

  // Activities for leads
  for (let i = 0; i < leadIds.length; i++) {
    const count = randomBetween(2, 6);
    for (let j = 0; j < count; j++) {
      await supabaseDb.insert("activities", {
        organizationId: orgId,
        entityType: "lead",
        entityId: leadIds[i],
        action: randomPick([...actionTypes]) as any,
        description: randomPick([
          `Lead utworzony`,
          `Zmieniono etap na ${leadData[i].stage}`,
          `Dodano notatkę`,
          `Wysłano follow-up`,
          `Zaktualizowano wartość`,
          `Przypisano do dealu`,
          `Dodano załącznik`,
        ]),
        performedBy: userId,
        createdAt: daysAgo(randomBetween(1, 50)),
      });
    }
  }

  // ============================================================
  // 6. NOTES
  // ============================================================
  const noteTexts = [
    "Omówiono wymagania dotyczące integracji. Klient oczekuje API REST + webhooki.",
    "Spotkanie bardzo obiecujące. Będą potrzebować demo w przyszłym tygodniu.",
    "Klient prosi o wycenę wersji on-premise. Przygotować do piątku.",
    "Zmieniono osobę decyzyjną — teraz kontakt to CFO, nie CTO.",
    "Follow-up po targach. Zainteresowani modułem raportowania.",
    "Negocjacje w toku — proszą o 15% rabatu na roczny abonament.",
    "Wysłano NDA. Czekają na podpisanie ze strony prawnika klienta.",
    "Klient referencyjny — polecił nas dwóm innym firmom.",
    "Problem z dostępem do API — przekazano do zespołu technicznego.",
    "Zakończono wdrożenie pilotażowe. Feedback pozytywny.",
  ];

  // Notes on contacts
  for (let i = 0; i < Math.min(10, contactIds.length); i++) {
    await supabaseDb.insert("notes", {
      organizationId: orgId,
      entityType: "contact",
      entityId: contactIds[i],
      content: noteTexts[i % noteTexts.length],
      isPinned: i < 2,
      createdBy: userId,
      createdAt: daysAgo(randomBetween(1, 30)),
    });
  }

  // Notes on companies
  for (let i = 0; i < Math.min(6, companyIds.length); i++) {
    await supabaseDb.insert("notes", {
      organizationId: orgId,
      entityType: "company",
      entityId: companyIds[i],
      content: randomPick(noteTexts),
      createdBy: userId,
      createdAt: daysAgo(randomBetween(2, 40)),
    });
  }

  // Notes on leads
  for (let i = 0; i < Math.min(8, leadIds.length); i++) {
    await supabaseDb.insert("notes", {
      organizationId: orgId,
      entityType: "lead",
      entityId: leadIds[i],
      content: randomPick(noteTexts),
      isPinned: i === 0,
      createdBy: userId,
      createdAt: daysAgo(randomBetween(1, 25)),
    });
  }

  // ============================================================
  // 7. CALLS
  // ============================================================
  const callOutcomes = ["answered", "voicemail", "busy", "no_answer"] as const;
  const callNotes = [
    "Krótka rozmowa intro — klient zainteresowany",
    "Omówiono zakres projektu",
    "Zostawiono wiadomość — proszą o oddzwonienie",
    "Klient nieodebrał — spróbować jutro",
    "Negocjacje cenowe — blisko porozumienia",
    "Potwierdzenie terminu demo",
    "Rozmowa techniczna z zespołem klienta",
    "Follow-up po wysłanej ofercie",
  ];

  for (let i = 0; i < 12; i++) {
    await supabaseDb.insert("calls", {
      organizationId: orgId,
      outcome: randomPick([...callOutcomes]) as any,
      callDate: daysAgo(randomBetween(0, 20)),
      note: callNotes[i % callNotes.length],
      duration: randomBetween(60, 900),
      createdBy: userId,
      createdAt: daysAgo(randomBetween(0, 20)),
      updatedAt: now,
    });
  }

  // ============================================================
  // 8. EMAILS
  // ============================================================
  const emailSubjects = [
    "Oferta współpracy — CRM SaaS",
    "Re: Pytanie o integrację API",
    "Demo platformy — potwierdzenie terminu",
    "Propozycja cenowa — wersja Enterprise",
    "Follow-up po spotkaniu",
    "Dokumentacja techniczna API",
    "Re: Rezerwacja demo",
    "Podsumowanie negocjacji",
    "Zaproszenie na webinar produktowy",
    "Re: Problem z dostępem",
  ];

  const emailBodies = [
    "<p>Szanowny Kliencie,</p><p>W załączniku przesyłam ofertę współpracy. Chętnie odpowiem na pytania.</p><p>Pozdrawiam</p>",
    "<p>Dziękuję za zainteresowanie. Nasze API wspiera REST + GraphQL. Dokumentacja dostępna na docs.example.com</p>",
    "<p>Potwierdzam termin demo: wtorek 14:00. Wyślę link do spotkania przed terminem.</p>",
    "<p>Przygotowaliśmy wycenę dla Państwa firmy. Wersja Enterprise obejmuje pełen moduł CRM + Gabinet.</p>",
  ];

  for (let i = 0; i < 10; i++) {
    const contactIdx = i % contactIds.length;
    const direction = i % 3 === 0 ? "inbound" : "outbound";
    const from = direction === "inbound" ? contactData[contactIdx].email : "sales@company.pl";
    const to = direction === "inbound" ? ["sales@company.pl"] : [contactData[contactIdx].email];

    await supabaseDb.insert("emails", {
      organizationId: orgId,
      threadId: `thread-${i}-${Date.now()}`,
      messageId: `<msg-${i}-${randomBetween(1000, 9999)}@company.pl>`,
      direction: direction as any,
      from,
      to,
      subject: emailSubjects[i],
      bodyHtml: emailBodies[i % emailBodies.length],
      snippet: emailSubjects[i].slice(0, 80),
      isRead: i > 2,
      isStarred: i === 0 || i === 4,
      contactId: contactIds[contactIdx],
      companyId: contactData[contactIdx]?.companyIdx !== undefined ? companyIds[contactData[contactIdx].companyIdx!] : undefined,
      sentBy: direction === "outbound" ? userId : undefined,
      createdAt: daysAgo(randomBetween(0, 15)),
      updatedAt: now,
    });
  }

  // ============================================================
  // 9. SCHEDULED ACTIVITIES
  // ============================================================
  const scheduledActivityData = [
    { title: "Call follow-up — TechNova", type: "call", dueOffset: 1, linkedType: "contact", linkedIdx: 0, completed: false },
    { title: "Demo platformy — MediCare", type: "meeting", dueOffset: 3, linkedType: "lead", linkedIdx: 1, completed: false },
    { title: "Wysłać ofertę — Green Solutions", type: "task", dueOffset: 0, linkedType: "lead", linkedIdx: 2, completed: false },
    { title: "Spotkanie kickoff — EduPlus", type: "meeting", dueOffset: 5, linkedType: "lead", linkedIdx: 4, completed: false },
    { title: "Przygotować case study", type: "task", dueOffset: 2, completed: false },
    { title: "Wysłać NDA — FinServe", type: "email", dueOffset: 1, linkedType: "contact", linkedIdx: 7, completed: false },
    { title: "Szkolenie zespołu — CloudHost", type: "meeting", dueOffset: 7, linkedType: "lead", linkedIdx: 8, completed: false },
    { title: "Review kwartalny — FoodMarket", type: "meeting", dueOffset: 4, linkedType: "lead", linkedIdx: 5, completed: false },
    // Completed activities
    { title: "Spotkanie intro — BuildRight", type: "meeting", dueOffset: -2, linkedType: "lead", linkedIdx: 3, completed: true },
    { title: "Wysłać dokumentację — BioPharm", type: "email", dueOffset: -5, linkedType: "contact", linkedIdx: 9, completed: true },
    { title: "Call kwalifikacyjny — LogiTrans", type: "call", dueOffset: -3, linkedType: "contact", linkedIdx: 11, completed: true },
    { title: "Prezentacja oferty — AutoLux", type: "meeting", dueOffset: -1, linkedType: "lead", linkedIdx: 6, completed: true },
  ];

  for (const sa of scheduledActivityData) {
    const dueDate = daysFromNow(sa.dueOffset);
    await supabaseDb.insert("scheduledActivities", {
      organizationId: orgId,
      title: sa.title,
      activityType: sa.type as any,
      dueDate,
      isCompleted: sa.completed,
      completedAt: sa.completed ? dueDate - dayMs : undefined,
      ownerId: userId,
      linkedEntityType: sa.linkedType,
      linkedEntityId: sa.linkedType === "contact" ? contactIds[sa.linkedIdx!] : sa.linkedType === "lead" ? leadIds[sa.linkedIdx!] : undefined,
      description: sa.completed ? "Zadanie wykonane" : undefined,
      createdAt: daysAgo(Math.abs(sa.dueOffset) + 2),
    });
  }

  // Recently viewed is intentionally not seeded: the read path goes through
  // Supabase (see convex/recentlyViewed.ts) while ctx.db here is Convex, so
  // any rows written here would never surface in the sidebar. The list fills
  // naturally as the user navigates seeded entities.

  return {
    companies: companyIds.length,
    contacts: contactIds.length,
    leads: leadIds.length,
    relationships: Math.min(contactData.length, companyIds.length) + leadData.filter((l) => l.companyIdx !== undefined).length,
    activities: "computed",
    notes: Math.min(10, contactIds.length) + Math.min(6, companyIds.length) + Math.min(8, leadIds.length),
    calls: 12,
    emails: 10,
    scheduledActivities: scheduledActivityData.length,
  };
}

// ---------------------------------------------------------------------------
// Clear implementation
// ---------------------------------------------------------------------------

async function doClear(_ctx: any, orgId: Id<"organizations">) {
  const supabaseDb = createSupabaseDb();
  const tables = [
    "scheduledActivities",
    "emails",
    "calls",
    "notes",
    "activities",
    "objectRelationships",
    "leads",
    "contacts",
    "companies",
  ];

  let total = 0;
  for (const table of tables) {
    const rows = await supabaseDb
      .query(table)
      .eq("organizationId", orgId)
      .collect();
    for (const row of rows) {
      await supabaseDb.delete(table, (row as Record<string, unknown>)._id as string);
    }
    total += rows.length;
  }

  return { deleted: total };
}
