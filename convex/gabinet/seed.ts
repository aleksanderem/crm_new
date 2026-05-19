import { mutation, internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireOrgAdmin } from "../_helpers/auth";
import { Id } from "../_generated/dataModel";

/** Helper to list orgs+users for CLI seeding. */
export const listOrgs = query({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("organizations").collect();
    return orgs.map((o) => ({ id: o._id, name: o.name, ownerId: o.ownerId }));
  },
});

/**
 * Seeds the Gabinet module with realistic demo data.
 * Call from the app or Convex dashboard with an organizationId.
 * Idempotent — checks if patients already exist before seeding.
 */
export const seedAll = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    return await doSeed(ctx, args.organizationId, user._id);
  },
});

/**
 * Internal seed for CLI usage: `npx convex run gabinet/seed:seedAllInternal '{"organizationId":"...","userId":"..."}'`
 */
export const seedAllInternal = internalMutation({
  args: { organizationId: v.id("organizations"), userId: v.id("users") },
  handler: async (ctx, args) => {
    return await doSeed(ctx, args.organizationId, args.userId);
  },
});

async function doSeed(ctx: any, orgId: Id<"organizations">, userId: Id<"users">) {
    const now = Date.now();

    // --- Guard: skip if already seeded ---
    const existingPatients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
      .first();
    if (existingPatients) {
      throw new Error("Gabinet data already seeded for this organization. Delete existing data first.");
    }

    // --- Helpers ---
    const ts = (daysOffset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + daysOffset);
      return d.toISOString().split("T")[0];
    };

    const year = new Date().getFullYear();

    // ============================================================
    // 1. PATIENTS
    // ============================================================
    const patientData = [
      { firstName: "Anna", lastName: "Kowalska", email: "anna.kowalska@example.com", phone: "+48 512 345 678", dateOfBirth: "1985-03-15", gender: "female" as const, pesel: "85031512345", allergies: "Penicylina", bloodType: "A+" },
      { firstName: "Jan", lastName: "Nowak", email: "jan.nowak@example.com", phone: "+48 501 234 567", dateOfBirth: "1972-11-08", gender: "male" as const, pesel: "72110854321", medicalNotes: "Cukrzyca typu 2", bloodType: "O+" },
      { firstName: "Maria", lastName: "Wiśniewska", email: "maria.w@example.com", phone: "+48 600 111 222", dateOfBirth: "1990-07-22", gender: "female" as const, bloodType: "B+" },
      { firstName: "Piotr", lastName: "Zieliński", email: "piotr.z@example.com", phone: "+48 510 333 444", dateOfBirth: "1968-01-30", gender: "male" as const, pesel: "68013098765", allergies: "Lateks", bloodType: "AB-" },
      { firstName: "Katarzyna", lastName: "Wójcik", email: "kasia.wojcik@example.com", phone: "+48 660 555 777", dateOfBirth: "1995-12-03", gender: "female" as const },
      { firstName: "Tomasz", lastName: "Kamiński", email: "t.kaminski@example.com", phone: "+48 515 666 888", dateOfBirth: "1980-05-18", gender: "male" as const, bloodType: "O-", emergencyContactName: "Ewa Kamińska", emergencyContactPhone: "+48 515 666 889" },
      { firstName: "Agnieszka", lastName: "Lewandowska", email: "agnieszka.l@example.com", phone: "+48 790 999 000", dateOfBirth: "1988-09-11", gender: "female" as const, medicalNotes: "Astma", bloodType: "A-" },
      { firstName: "Michał", lastName: "Szymański", email: "michal.sz@example.com", phone: "+48 502 111 333", dateOfBirth: "1975-04-25", gender: "male" as const, address: { street: "ul. Marszałkowska 10/5", city: "Warszawa", postalCode: "00-001" } },
      { firstName: "Ewa", lastName: "Dąbrowska", email: "ewa.d@example.com", phone: "+48 530 222 444", dateOfBirth: "1992-06-14", gender: "female" as const, referralSource: "Google" },
      { firstName: "Robert", lastName: "Jankowski", email: "robert.j@example.com", phone: "+48 780 333 555", dateOfBirth: "1960-02-28", gender: "male" as const, pesel: "60022876543", medicalNotes: "Nadciśnienie, kardiolog kontrola co 6 mies.", bloodType: "B-", emergencyContactName: "Jolanta Jankowska", emergencyContactPhone: "+48 780 333 556" },
      { firstName: "Zofia", lastName: "Mazur", email: "zofia.mazur@example.com", phone: "+48 505 444 666", dateOfBirth: "2000-08-07", gender: "female" as const },
      { firstName: "Krzysztof", lastName: "Krawczyk", email: "k.krawczyk@example.com", phone: "+48 600 777 888", dateOfBirth: "1955-10-20", gender: "male" as const, allergies: "Jod, Aspiryna", bloodType: "AB+" },
      // Additional patients for richer data set
      { firstName: "Aleksandra", lastName: "Piotrowska", email: "aleksandra.p@example.com", phone: "+48 512 888 101", dateOfBirth: "1993-02-14", gender: "female" as const, bloodType: "A+", referralSource: "Znajomy" },
      { firstName: "Stanisław", lastName: "Grabowski", email: "s.grabowski@example.com", phone: "+48 601 222 303", dateOfBirth: "1958-07-09", gender: "male" as const, pesel: "58070912345", medicalNotes: "Osteoporoza, kontrola co 3 mies.", bloodType: "O-" },
      { firstName: "Monika", lastName: "Kowalczyk", email: "monika.k@example.com", phone: "+48 530 444 505", dateOfBirth: "1987-11-28", gender: "female" as const, allergies: "Nikiel" },
      { firstName: "Jakub", lastName: "Wróbel", email: "jakub.wrobel@example.com", phone: "+48 790 666 707", dateOfBirth: "1999-04-01", gender: "male" as const },
      { firstName: "Barbara", lastName: "Nowicka", email: "barbara.n@example.com", phone: "+48 515 777 808", dateOfBirth: "1970-12-15", gender: "female" as const, bloodType: "B+", emergencyContactName: "Tadeusz Nowicki", emergencyContactPhone: "+48 515 777 809" },
      { firstName: "Łukasz", lastName: "Olszewski", email: "lukasz.o@example.com", phone: "+48 660 888 909", dateOfBirth: "1983-06-22", gender: "male" as const, medicalNotes: "Refluks żołądkowy" },
      { firstName: "Natalia", lastName: "Sikora", email: "natalia.sikora@example.com", phone: "+48 502 999 010", dateOfBirth: "1996-09-05", gender: "female" as const, referralSource: "Instagram" },
      { firstName: "Damian", lastName: "Jabłoński", email: "damian.j@example.com", phone: "+48 780 111 212", dateOfBirth: "1978-03-17", gender: "male" as const, pesel: "78031798765", allergies: "Lidokaina", bloodType: "AB-" },
    ];

    const patientIds: Id<"gabinetPatients">[] = [];
    for (const p of patientData) {
      const id = await ctx.db.insert("gabinetPatients", {
        organizationId: orgId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        dateOfBirth: p.dateOfBirth,
        gender: p.gender,
        pesel: p.pesel,
        allergies: p.allergies,
        bloodType: p.bloodType,
        medicalNotes: p.medicalNotes,
        emergencyContactName: p.emergencyContactName,
        emergencyContactPhone: p.emergencyContactPhone,
        address: p.address,
        referralSource: p.referralSource,
        isActive: true,
        tags: [],
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      patientIds.push(id);
    }

    // ============================================================
    // 2. TREATMENTS
    // ============================================================
    const treatmentData = [
      { name: "Konsultacja lekarska", category: "Konsultacje", duration: 30, price: 200, color: "#3b82f6" },
      { name: "Konsultacja specjalistyczna", category: "Konsultacje", duration: 45, price: 350, color: "#6366f1" },
      { name: "USG jamy brzusznej", category: "Diagnostyka", duration: 30, price: 250, color: "#8b5cf6" },
      { name: "EKG", category: "Diagnostyka", duration: 20, price: 100, color: "#a855f7" },
      { name: "Morfologia krwi", category: "Laboratorium", duration: 15, price: 50, color: "#ec4899" },
      { name: "Masaż leczniczy", category: "Fizjoterapia", duration: 60, price: 180, color: "#14b8a6" },
      { name: "Rehabilitacja kręgosłupa", category: "Fizjoterapia", duration: 45, price: 200, color: "#10b981" },
      { name: "Laseroterapia", category: "Fizjoterapia", duration: 30, price: 120, color: "#22c55e" },
      { name: "Mezoterapia igłowa", category: "Medycyna estetyczna", duration: 45, price: 500, color: "#f59e0b" },
      { name: "Botox", category: "Medycyna estetyczna", duration: 30, price: 800, color: "#f97316" },
      { name: "Peeling chemiczny", category: "Medycyna estetyczna", duration: 40, price: 350, color: "#ef4444" },
      { name: "Szczepienie ochronne", category: "Profilaktyka", duration: 15, price: 80, color: "#06b6d4", requiresApproval: true },
      // Additional treatments
      { name: "Drenaż limfatyczny", category: "Fizjoterapia", duration: 60, price: 160, color: "#0d9488" },
      { name: "Peeling kawitacyjny", category: "Medycyna estetyczna", duration: 45, price: 280, color: "#e11d48" },
      { name: "Krioterapia miejscowa", category: "Fizjoterapia", duration: 20, price: 90, color: "#0ea5e9" },
    ];

    // Seed root-level treatment categoryDefinitions and map name → id.
    // Treatments link via `categoryId`; the legacy free-text `category` field
    // is no longer written (see #471, #493).
    const categoryNames = Array.from(new Set(treatmentData.map((t) => t.category)));
    const treatmentCategoryIds = new Map<string, Id<"categoryDefinitions">>();
    for (let i = 0; i < categoryNames.length; i++) {
      const id = await ctx.db.insert("categoryDefinitions", {
        organizationId: orgId,
        entityType: "gabinetTreatment" as const,
        name: categoryNames[i],
        sortOrder: i,
        createdAt: now,
        updatedAt: now,
      });
      treatmentCategoryIds.set(categoryNames[i], id);
    }

    const treatmentIds: Id<"gabinetTreatments">[] = [];
    for (let i = 0; i < treatmentData.length; i++) {
      const t = treatmentData[i];
      const id = await ctx.db.insert("gabinetTreatments", {
        organizationId: orgId,
        name: t.name,
        categoryId: treatmentCategoryIds.get(t.category),
        duration: t.duration,
        price: t.price,
        currency: "PLN",
        color: t.color,
        isActive: true,
        sortOrder: i,
        requiresApproval: t.requiresApproval,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      treatmentIds.push(id);
    }

    // ============================================================
    // 3. EMPLOYEES (from org members)
    // ============================================================
    const members = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q: any) => q.eq("organizationId", orgId))
      .collect();

    const employeeConfigs = [
      { role: "doctor" as const, specialization: "Medycyna rodzinna", color: "#3b82f6", license: "LEK-2015/12345", treatments: [0, 1, 2, 3, 4, 11] },
      { role: "nurse" as const, specialization: "Pielęgniarstwo", color: "#10b981", license: "PIE-2018/67890", treatments: [4, 11] },
      { role: "therapist" as const, specialization: "Fizjoterapia", color: "#f59e0b", license: "FIZ-2020/11111", treatments: [5, 6, 7, 12, 14] },
      { role: "doctor" as const, specialization: "Medycyna estetyczna", color: "#ec4899", license: "LEK-2012/99999", treatments: [0, 1, 8, 9, 10, 13] },
      { role: "receptionist" as const, specialization: undefined, color: "#6b7280", treatments: [] },
    ];

    const employeeIds: Id<"gabinetEmployees">[] = [];
    for (let i = 0; i < Math.min(members.length, employeeConfigs.length); i++) {
      const cfg = employeeConfigs[i];
      const id = await ctx.db.insert("gabinetEmployees", {
        organizationId: orgId,
        userId: members[i].userId,
        role: cfg.role,
        specialization: cfg.specialization,
        qualifiedTreatmentIds: cfg.treatments.map((idx) => treatmentIds[idx]),
        licenseNumber: cfg.license,
        hireDate: `${year - 3}-01-15`,
        isActive: true,
        color: cfg.color,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      employeeIds.push(id);
    }

    // If only 1 member, we still use that userId for appointments
    const employeeUserIds = members.slice(0, employeeConfigs.length).map((m: any) => m.userId);

    // ============================================================
    // 4. WORKING HOURS (Mon-Fri 8:00-18:00, Sat 9:00-14:00)
    // ============================================================
    const weekHours = [
      { dayOfWeek: 0, isOpen: false, startTime: "08:00", endTime: "18:00" }, // Sun
      { dayOfWeek: 1, isOpen: true, startTime: "08:00", endTime: "18:00", breakStart: "12:00", breakEnd: "12:30" },
      { dayOfWeek: 2, isOpen: true, startTime: "08:00", endTime: "18:00", breakStart: "12:00", breakEnd: "12:30" },
      { dayOfWeek: 3, isOpen: true, startTime: "08:00", endTime: "18:00", breakStart: "12:00", breakEnd: "12:30" },
      { dayOfWeek: 4, isOpen: true, startTime: "08:00", endTime: "18:00", breakStart: "12:00", breakEnd: "12:30" },
      { dayOfWeek: 5, isOpen: true, startTime: "08:00", endTime: "18:00", breakStart: "12:00", breakEnd: "12:30" },
      { dayOfWeek: 6, isOpen: true, startTime: "09:00", endTime: "14:00" }, // Sat
    ];

    for (const wh of weekHours) {
      await ctx.db.insert("gabinetWorkingHours", {
        organizationId: orgId,
        dayOfWeek: wh.dayOfWeek,
        startTime: wh.startTime,
        endTime: wh.endTime,
        isOpen: wh.isOpen,
        breakStart: wh.breakStart,
        breakEnd: wh.breakEnd,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // ============================================================
    // 5. LEAVE TYPES
    // ============================================================
    const leaveTypeData = [
      { name: "Urlop wypoczynkowy", color: "#3b82f6", isPaid: true, annualQuotaDays: 26, requiresApproval: true },
      { name: "Zwolnienie lekarskie (L4)", color: "#ef4444", isPaid: true, annualQuotaDays: undefined, requiresApproval: false },
      { name: "Urlop na żądanie", color: "#f59e0b", isPaid: true, annualQuotaDays: 4, requiresApproval: true },
      { name: "Urlop bezpłatny", color: "#6b7280", isPaid: false, annualQuotaDays: undefined, requiresApproval: true },
      { name: "Szkolenie / Konferencja", color: "#8b5cf6", isPaid: true, annualQuotaDays: 10, requiresApproval: true },
    ];

    const leaveTypeIds: Id<"gabinetLeaveTypes">[] = [];
    for (const lt of leaveTypeData) {
      const id = await ctx.db.insert("gabinetLeaveTypes", {
        organizationId: orgId,
        name: lt.name,
        color: lt.color,
        isPaid: lt.isPaid,
        annualQuotaDays: lt.annualQuotaDays,
        requiresApproval: lt.requiresApproval,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      leaveTypeIds.push(id);
    }

    // ============================================================
    // 6. LEAVE BALANCES (for each employee × each quota-based type)
    // ============================================================
    for (const empId of employeeIds) {
      for (let i = 0; i < leaveTypeData.length; i++) {
        const quota = leaveTypeData[i].annualQuotaDays;
        if (quota === undefined) continue;

        const usedDays = i === 0 ? Math.floor(Math.random() * 8) : i === 2 ? Math.floor(Math.random() * 2) : 0;
        await ctx.db.insert("gabinetLeaveBalances", {
          organizationId: orgId,
          employeeId: empId,
          leaveTypeId: leaveTypeIds[i],
          year,
          totalDays: quota,
          usedDays,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // ============================================================
    // 7. LEAVES (a few sample requests)
    // ============================================================
    if (employeeUserIds.length >= 1) {
      await ctx.db.insert("gabinetLeaves", {
        organizationId: orgId,
        userId: employeeUserIds[0],
        type: "vacation",
        leaveTypeId: leaveTypeIds[0],
        startDate: ts(14),
        endDate: ts(18),
        status: "approved",
        reason: "Wakacje rodzinne",
        approvedBy: userId,
        approvedAt: now,
        createdBy: employeeUserIds[0],
        createdAt: now,
        updatedAt: now,
      });
    }
    if (employeeUserIds.length >= 2) {
      await ctx.db.insert("gabinetLeaves", {
        organizationId: orgId,
        userId: employeeUserIds[1],
        type: "sick",
        leaveTypeId: leaveTypeIds[1],
        startDate: ts(-3),
        endDate: ts(-1),
        status: "approved",
        reason: "Przeziębienie",
        approvedBy: userId,
        approvedAt: now,
        createdBy: employeeUserIds[1],
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("gabinetLeaves", {
        organizationId: orgId,
        userId: employeeUserIds[1],
        type: "training",
        leaveTypeId: leaveTypeIds[4],
        startDate: ts(21),
        endDate: ts(22),
        status: "pending",
        reason: "Konferencja medyczna w Krakowie",
        createdBy: employeeUserIds[1],
        createdAt: now,
        updatedAt: now,
      });
    }

    // ============================================================
    // 8. APPOINTMENTS (current week + next 2 weeks + past)
    // ============================================================
    const appointmentSlots = [
      // --- Today (day 0) ---
      { daysOffset: 0, startTime: "08:30", endTime: "09:00", patientIdx: 0, treatmentIdx: 0, empIdx: 0, status: "confirmed" as const },
      { daysOffset: 0, startTime: "09:00", endTime: "09:45", patientIdx: 1, treatmentIdx: 1, empIdx: 0, status: "confirmed" as const },
      { daysOffset: 0, startTime: "10:00", endTime: "11:00", patientIdx: 12, treatmentIdx: 5, empIdx: 2, status: "scheduled" as const },
      { daysOffset: 0, startTime: "11:00", endTime: "11:45", patientIdx: 13, treatmentIdx: 6, empIdx: 2, status: "scheduled" as const },
      { daysOffset: 0, startTime: "14:00", endTime: "14:45", patientIdx: 7, treatmentIdx: 8, empIdx: 3, status: "confirmed" as const },
      { daysOffset: 0, startTime: "15:00", endTime: "15:45", patientIdx: 14, treatmentIdx: 13, empIdx: 3, status: "scheduled" as const },
      // --- Tomorrow (day 1) ---
      { daysOffset: 1, startTime: "08:00", endTime: "08:30", patientIdx: 2, treatmentIdx: 0, empIdx: 0 },
      { daysOffset: 1, startTime: "09:00", endTime: "09:45", patientIdx: 3, treatmentIdx: 1, empIdx: 0 },
      { daysOffset: 1, startTime: "10:00", endTime: "11:00", patientIdx: 15, treatmentIdx: 12, empIdx: 2 },
      { daysOffset: 1, startTime: "11:00", endTime: "11:30", patientIdx: 4, treatmentIdx: 7, empIdx: 2 },
      { daysOffset: 1, startTime: "14:00", endTime: "14:45", patientIdx: 16, treatmentIdx: 8, empIdx: 3, status: "confirmed" as const },
      // --- Day 2 ---
      { daysOffset: 2, startTime: "08:30", endTime: "09:00", patientIdx: 5, treatmentIdx: 0, empIdx: 0 },
      { daysOffset: 2, startTime: "09:00", endTime: "09:30", patientIdx: 6, treatmentIdx: 2, empIdx: 0 },
      { daysOffset: 2, startTime: "10:00", endTime: "10:20", patientIdx: 17, treatmentIdx: 14, empIdx: 2 },
      { daysOffset: 2, startTime: "14:00", endTime: "14:45", patientIdx: 18, treatmentIdx: 9, empIdx: 3 },
      { daysOffset: 2, startTime: "15:00", endTime: "15:30", patientIdx: 8, treatmentIdx: 10, empIdx: 3 },
      // --- Day 3 ---
      { daysOffset: 3, startTime: "08:00", endTime: "08:30", patientIdx: 9, treatmentIdx: 0, empIdx: 0, status: "confirmed" as const },
      { daysOffset: 3, startTime: "09:00", endTime: "10:00", patientIdx: 10, treatmentIdx: 5, empIdx: 2 },
      { daysOffset: 3, startTime: "10:00", endTime: "10:30", patientIdx: 11, treatmentIdx: 7, empIdx: 2 },
      { daysOffset: 3, startTime: "13:00", endTime: "13:45", patientIdx: 19, treatmentIdx: 13, empIdx: 3 },
      // --- Day 4 ---
      { daysOffset: 4, startTime: "08:00", endTime: "08:15", patientIdx: 1, treatmentIdx: 4, empIdx: 1 },
      { daysOffset: 4, startTime: "09:00", endTime: "09:30", patientIdx: 12, treatmentIdx: 0, empIdx: 0 },
      { daysOffset: 4, startTime: "10:00", endTime: "10:45", patientIdx: 13, treatmentIdx: 1, empIdx: 0 },
      { daysOffset: 4, startTime: "14:00", endTime: "14:30", patientIdx: 14, treatmentIdx: 2, empIdx: 0 },
      // --- Day 5 ---
      { daysOffset: 5, startTime: "09:00", endTime: "10:00", patientIdx: 15, treatmentIdx: 12, empIdx: 2 },
      { daysOffset: 5, startTime: "10:00", endTime: "10:45", patientIdx: 6, treatmentIdx: 6, empIdx: 2 },
      { daysOffset: 5, startTime: "11:00", endTime: "11:45", patientIdx: 16, treatmentIdx: 8, empIdx: 3 },
      // --- Week 2 (days 7-12) ---
      { daysOffset: 7, startTime: "08:00", endTime: "08:30", patientIdx: 8, treatmentIdx: 0, empIdx: 0 },
      { daysOffset: 7, startTime: "09:00", endTime: "09:20", patientIdx: 17, treatmentIdx: 3, empIdx: 0 },
      { daysOffset: 7, startTime: "10:00", endTime: "10:15", patientIdx: 10, treatmentIdx: 11, empIdx: 0 },
      { daysOffset: 7, startTime: "14:00", endTime: "15:00", patientIdx: 18, treatmentIdx: 12, empIdx: 2 },
      { daysOffset: 8, startTime: "09:00", endTime: "09:30", patientIdx: 0, treatmentIdx: 0, empIdx: 0, status: "confirmed" as const },
      { daysOffset: 8, startTime: "13:00", endTime: "13:30", patientIdx: 11, treatmentIdx: 9, empIdx: 3 },
      { daysOffset: 8, startTime: "14:00", endTime: "14:40", patientIdx: 19, treatmentIdx: 10, empIdx: 3 },
      { daysOffset: 9, startTime: "08:30", endTime: "09:00", patientIdx: 3, treatmentIdx: 0, empIdx: 0 },
      { daysOffset: 9, startTime: "10:00", endTime: "10:45", patientIdx: 5, treatmentIdx: 1, empIdx: 0 },
      { daysOffset: 9, startTime: "14:00", endTime: "15:00", patientIdx: 7, treatmentIdx: 5, empIdx: 2 },
      { daysOffset: 10, startTime: "09:00", endTime: "09:30", patientIdx: 14, treatmentIdx: 2, empIdx: 0 },
      { daysOffset: 10, startTime: "11:00", endTime: "11:45", patientIdx: 16, treatmentIdx: 13, empIdx: 3 },
      // --- Week 3 (days 14-18) ---
      { daysOffset: 14, startTime: "08:00", endTime: "08:30", patientIdx: 2, treatmentIdx: 0, empIdx: 0 },
      { daysOffset: 14, startTime: "10:00", endTime: "10:45", patientIdx: 15, treatmentIdx: 6, empIdx: 2 },
      { daysOffset: 15, startTime: "09:00", endTime: "09:45", patientIdx: 18, treatmentIdx: 1, empIdx: 0 },
      { daysOffset: 15, startTime: "14:00", endTime: "14:45", patientIdx: 19, treatmentIdx: 8, empIdx: 3 },
      // --- Past appointments (completed/no_show/cancelled) ---
      { daysOffset: -1, startTime: "08:00", endTime: "08:30", patientIdx: 0, treatmentIdx: 0, empIdx: 0, status: "completed" as const },
      { daysOffset: -1, startTime: "09:00", endTime: "09:45", patientIdx: 1, treatmentIdx: 1, empIdx: 0, status: "completed" as const },
      { daysOffset: -1, startTime: "10:00", endTime: "11:00", patientIdx: 12, treatmentIdx: 5, empIdx: 2, status: "completed" as const },
      { daysOffset: -1, startTime: "14:00", endTime: "14:45", patientIdx: 7, treatmentIdx: 8, empIdx: 3, status: "completed" as const },
      { daysOffset: -2, startTime: "08:00", endTime: "08:30", patientIdx: 2, treatmentIdx: 0, empIdx: 0, status: "completed" as const },
      { daysOffset: -2, startTime: "09:00", endTime: "09:30", patientIdx: 13, treatmentIdx: 2, empIdx: 0, status: "completed" as const },
      { daysOffset: -2, startTime: "14:00", endTime: "14:45", patientIdx: 3, treatmentIdx: 8, empIdx: 3, status: "completed" as const },
      { daysOffset: -3, startTime: "09:00", endTime: "09:30", patientIdx: 4, treatmentIdx: 2, empIdx: 0, status: "no_show" as const },
      { daysOffset: -3, startTime: "10:00", endTime: "10:45", patientIdx: 14, treatmentIdx: 6, empIdx: 2, status: "completed" as const },
      { daysOffset: -4, startTime: "08:30", endTime: "09:15", patientIdx: 15, treatmentIdx: 1, empIdx: 0, status: "cancelled" as const, cancelReason: "Klient odwołał — choroba" },
      { daysOffset: -5, startTime: "10:00", endTime: "10:45", patientIdx: 5, treatmentIdx: 1, empIdx: 0, status: "completed" as const },
      { daysOffset: -5, startTime: "14:00", endTime: "14:30", patientIdx: 16, treatmentIdx: 9, empIdx: 3, status: "no_show" as const },
      { daysOffset: -7, startTime: "09:00", endTime: "09:45", patientIdx: 17, treatmentIdx: 12, empIdx: 2, status: "cancelled" as const, cancelReason: "Zmiana terminu" },
    ];

    const appointmentIds: Id<"gabinetAppointments">[] = [];
    for (const slot of appointmentSlots) {
      const empIdx = Math.min(slot.empIdx, employeeUserIds.length - 1);
      const status = slot.status ?? "scheduled";
      const apptData: Record<string, unknown> = {
        organizationId: orgId,
        patientId: patientIds[slot.patientIdx % patientIds.length],
        treatmentId: treatmentIds[slot.treatmentIdx % treatmentIds.length],
        employeeId: employeeUserIds[empIdx],
        date: ts(slot.daysOffset),
        startTime: slot.startTime,
        endTime: slot.endTime,
        status,
        isRecurring: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      };
      if (status === "cancelled" && "cancelReason" in slot) {
        apptData.cancelledAt = now;
        apptData.cancelledBy = userId;
        apptData.cancellationReason = (slot as any).cancelReason;
      }
      const id = await ctx.db.insert("gabinetAppointments", apptData as any);
      appointmentIds.push(id);
    }

    // ============================================================
    // 9. TREATMENT PACKAGES
    // ============================================================
    const pkg1 = await ctx.db.insert("gabinetTreatmentPackages", {
      organizationId: orgId,
      name: "Pakiet rehabilitacyjny (10 sesji)",
      description: "10 sesji masażu leczniczego lub rehabilitacji kręgosłupa ze zniżką 20%",
      treatments: [
        { treatmentId: treatmentIds[5], quantity: 5 },
        { treatmentId: treatmentIds[6], quantity: 5 },
      ],
      totalPrice: 1520,
      currency: "PLN",
      discountPercent: 20,
      validityDays: 90,
      isActive: true,
      loyaltyPointsAwarded: 150,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    const pkg2 = await ctx.db.insert("gabinetTreatmentPackages", {
      organizationId: orgId,
      name: "Pakiet anti-aging",
      description: "Mezoterapia + Botox + peeling chemiczny",
      treatments: [
        { treatmentId: treatmentIds[8], quantity: 3 },
        { treatmentId: treatmentIds[9], quantity: 1 },
        { treatmentId: treatmentIds[10], quantity: 2 },
      ],
      totalPrice: 3200,
      currency: "PLN",
      discountPercent: 15,
      validityDays: 180,
      isActive: true,
      loyaltyPointsAwarded: 300,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("gabinetTreatmentPackages", {
      organizationId: orgId,
      name: "Pakiet diagnostyczny",
      description: "Konsultacja + USG + EKG + morfologia",
      treatments: [
        { treatmentId: treatmentIds[0], quantity: 1 },
        { treatmentId: treatmentIds[2], quantity: 1 },
        { treatmentId: treatmentIds[3], quantity: 1 },
        { treatmentId: treatmentIds[4], quantity: 1 },
      ],
      totalPrice: 500,
      currency: "PLN",
      discountPercent: 17,
      validityDays: 30,
      isActive: true,
      loyaltyPointsAwarded: 50,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Package usage for 2 patients
    await ctx.db.insert("gabinetPackageUsage", {
      organizationId: orgId,
      patientId: patientIds[0],
      packageId: pkg1,
      purchasedAt: now - 30 * 24 * 60 * 60 * 1000,
      expiresAt: now + 60 * 24 * 60 * 60 * 1000,
      status: "active",
      treatmentsUsed: [
        { treatmentId: treatmentIds[5], usedCount: 2, totalCount: 5 },
        { treatmentId: treatmentIds[6], usedCount: 1, totalCount: 5 },
      ],
      paidAmount: 1520,
      paymentMethod: "card",
      createdBy: userId,
      createdAt: now - 30 * 24 * 60 * 60 * 1000,
      updatedAt: now,
    });

    await ctx.db.insert("gabinetPackageUsage", {
      organizationId: orgId,
      patientId: patientIds[7],
      packageId: pkg2,
      purchasedAt: now - 14 * 24 * 60 * 60 * 1000,
      status: "active",
      treatmentsUsed: [
        { treatmentId: treatmentIds[8], usedCount: 1, totalCount: 3 },
        { treatmentId: treatmentIds[9], usedCount: 0, totalCount: 1 },
        { treatmentId: treatmentIds[10], usedCount: 0, totalCount: 2 },
      ],
      paidAmount: 3200,
      paymentMethod: "transfer",
      createdBy: userId,
      createdAt: now - 14 * 24 * 60 * 60 * 1000,
      updatedAt: now,
    });

    // ============================================================
    // 10. LOYALTY POINTS
    // ============================================================
    const loyaltyPatients = [
      { idx: 0, balance: 320, earned: 470, spent: 150, tier: "silver" as const },
      { idx: 1, balance: 150, earned: 150, spent: 0, tier: "bronze" as const },
      { idx: 7, balance: 500, earned: 800, spent: 300, tier: "gold" as const },
      { idx: 9, balance: 50, earned: 50, spent: 0, tier: "bronze" as const },
    ];

    for (const lp of loyaltyPatients) {
      await ctx.db.insert("gabinetLoyaltyPoints", {
        organizationId: orgId,
        patientId: patientIds[lp.idx],
        balance: lp.balance,
        lifetimeEarned: lp.earned,
        lifetimeSpent: lp.spent,
        tier: lp.tier,
        createdAt: now,
        updatedAt: now,
      });

      // Transaction history
      await ctx.db.insert("gabinetLoyaltyTransactions", {
        organizationId: orgId,
        patientId: patientIds[lp.idx],
        type: "earn",
        points: lp.earned,
        reason: "Wizyty i pakiety",
        balanceAfter: lp.balance + lp.spent,
        createdBy: userId,
        createdAt: now - 60 * 24 * 60 * 60 * 1000,
      });

      if (lp.spent > 0) {
        await ctx.db.insert("gabinetLoyaltyTransactions", {
          organizationId: orgId,
          patientId: patientIds[lp.idx],
          type: "spend",
          points: lp.spent,
          reason: "Rabat na wizytę",
          balanceAfter: lp.balance,
          createdBy: userId,
          createdAt: now - 10 * 24 * 60 * 60 * 1000,
        });
      }
    }

    // ============================================================
    // 11. DOCUMENT TEMPLATES
    // ============================================================
    const templateData = [
      {
        name: "Zgoda na zabieg",
        type: "consent" as const,
        content: "Ja, {{patient.firstName}} {{patient.lastName}}, wyrażam zgodę na przeprowadzenie zabiegu {{treatment.name}} w dniu {{appointment.date}}.\n\nOświadczam, że zostałem/am poinformowany/a o:\n- przebiegu zabiegu\n- możliwych powikłaniach\n- alternatywnych metodach leczenia\n\nData: {{appointment.date}}\nPodpis klienta: _______________",
        requiresSignature: true,
      },
      {
        name: "Karta wizyty",
        type: "medical_record" as const,
        content: "KARTA WIZYTY\n\nKlient: {{patient.firstName}} {{patient.lastName}}\nPESEL: {{patient.pesel}}\nData wizyty: {{appointment.date}}\nLekarz: {{employee.name}}\n\nRozpoznanie:\n\n\nZalecenia:\n\n\nPrzepisy leków:\n\n\nNastępna wizyta:",
        requiresSignature: false,
      },
      {
        name: "Skierowanie",
        type: "referral" as const,
        content: "SKIEROWANIE\n\nSkierowuję klienta {{patient.firstName}} {{patient.lastName}} (PESEL: {{patient.pesel}})\ndo: ________________________________\nw celu: ________________________________\n\nRozpoznanie: ________________________________\nBadania dotychczasowe: ________________________________\n\nData: {{appointment.date}}\nLekarz: {{employee.name}}\nNr prawa wyk. zawodu: {{employee.license}}",
        requiresSignature: true,
      },
      {
        name: "Recepta",
        type: "prescription" as const,
        content: "RECEPTA\n\nKlient: {{patient.firstName}} {{patient.lastName}}\nPESEL: {{patient.pesel}}\nAdres: {{patient.address}}\n\nRp.\n1. ________________________________\n   Dawkowanie: ________________________________\n\n2. ________________________________\n   Dawkowanie: ________________________________\n\nData wystawienia: {{appointment.date}}\nLekarz: {{employee.name}}\nNr PWZ: {{employee.license}}",
        requiresSignature: true,
      },
    ];

    const templateIds: Id<"gabinetDocumentTemplates">[] = [];
    for (let i = 0; i < templateData.length; i++) {
      const tmpl = templateData[i];
      const id = await ctx.db.insert("gabinetDocumentTemplates", {
        organizationId: orgId,
        name: tmpl.name,
        type: tmpl.type,
        content: tmpl.content,
        requiresSignature: tmpl.requiresSignature,
        isActive: true,
        sortOrder: i,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      templateIds.push(id);
    }

    // ============================================================
    // 12. SAMPLE DOCUMENTS
    // ============================================================
    // Signed consent for a past appointment
    await ctx.db.insert("gabinetDocuments", {
      organizationId: orgId,
      patientId: patientIds[0],
      appointmentId: appointmentIds[43], // first past appointment (daysOffset -1, patientIdx 0)
      templateId: templateIds[0],
      title: "Zgoda na zabieg — Anna Kowalska",
      type: "consent",
      content: templateData[0].content
        .replace("{{patient.firstName}}", "Anna")
        .replace("{{patient.lastName}}", "Kowalska")
        .replace(/\{\{treatment\.name\}\}/g, "Konsultacja lekarska")
        .replace(/\{\{appointment\.date\}\}/g, ts(-1)),
      status: "signed",
      signedAt: now - 24 * 60 * 60 * 1000,
      signedByPatient: true,
      createdBy: userId,
      createdAt: now - 24 * 60 * 60 * 1000,
      updatedAt: now,
    });

    // Pending medical record
    await ctx.db.insert("gabinetDocuments", {
      organizationId: orgId,
      patientId: patientIds[1],
      appointmentId: appointmentIds[44], // second past appointment (daysOffset -1, patientIdx 1)
      templateId: templateIds[1],
      title: "Karta wizyty — Jan Nowak",
      type: "medical_record",
      content: templateData[1].content
        .replace("{{patient.firstName}}", "Jan")
        .replace("{{patient.lastName}}", "Nowak")
        .replace("{{patient.pesel}}", "72110854321")
        .replace(/\{\{appointment\.date\}\}/g, ts(-1))
        .replace("{{employee.name}}", "Dr med. Kowalski"),
      status: "draft",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Pending signature consent for upcoming appointment
    await ctx.db.insert("gabinetDocuments", {
      organizationId: orgId,
      patientId: patientIds[3],
      templateId: templateIds[0],
      title: "Zgoda na zabieg — Piotr Zieliński",
      type: "consent",
      content: templateData[0].content
        .replace("{{patient.firstName}}", "Piotr")
        .replace("{{patient.lastName}}", "Zieliński")
        .replace(/\{\{treatment\.name\}\}/g, "Mezoterapia igłowa")
        .replace(/\{\{appointment\.date\}\}/g, ts(3)),
      status: "pending_signature",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      patients: patientIds.length,
      treatments: treatmentIds.length,
      employees: employeeIds.length,
      leaveTypes: leaveTypeIds.length,
      appointments: appointmentIds.length,
      packages: 3,
      templates: templateIds.length,
      documents: 3,
    };
}

/**
 * Clears all Gabinet data for an organization.
 * Use before re-seeding.
 */
export const clearAll = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    return await doClear(ctx, args.organizationId);
  },
});

/**
 * Internal clear for CLI usage.
 */
export const clearAllInternal = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await doClear(ctx, args.organizationId);
  },
});

async function doClear(ctx: any, orgId: Id<"organizations">) {
  const tables = [
    "gabinetDocuments",
    "gabinetDocumentTemplates",
    "gabinetLoyaltyTransactions",
    "gabinetLoyaltyPoints",
    "gabinetPackageUsage",
    "gabinetTreatmentPackages",
    "gabinetAppointments",
    "gabinetLeaveBalances",
    "gabinetLeaves",
    "gabinetLeaveTypes",
    "gabinetOvertime",
    "gabinetEmployeeSchedules",
    "gabinetWorkingHours",
    "gabinetEmployees",
    "gabinetTreatments",
    "gabinetPatients",
    "gabinetPortalSessions",
  ] as const;

  let total = 0;
  for (const table of tables) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_org", (q: any) => q.eq("organizationId", orgId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    total += rows.length;
  }

  return { deleted: total };
}
