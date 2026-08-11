/**
 * Audit evidence: orgSettings fields have proven behavioral effects.
 *
 * Issue #3672 — each org-level setting must be confirmed through a test, not
 * just a code-review read. This file covers the seven orgSettings fields with
 * confirmed consumers identified in the pre-verification pass:
 *
 *   reminderEnabled         → appointments.create: controls whether _createSideEffects
 *                             schedules a reminder at all (appointments.ts:1259)
 *   reminderHoursBefore     → _createSideEffects legacy-mode: sets the reminder
 *                             offset in hours when no 4-toggle config is present
 *                             (appointments.ts:1046)
 *   reminderSms24h/48h      → _createSideEffects 4-toggle mode: determines which
 *   reminderEmail24h/48h      timing slots (24h, 48h) are scheduled
 *                             (appointments.ts:1023–1048)
 *   resourceSharingEnabled  → permissions.getResourceSharingEnabled action:
 *                             reads from Supabase, returned directly to callers (permissions.ts:118)
 *
 * Resolved follow-ups (issue #3678):
 *   timezone                — wired up: appointment-dialog now reads orgSettings.timezone
 *                             and computes nowDate/nowTime in the clinic's timezone
 *                             (frontend effect; no backend unit test needed)
 *   appointmentWorkflowConfig — removed: dispatchAppointmentCreated was never called;
 *                             appointment notifications are handled by automation.ts
 *
 * The sendReminder internalMutation channel-level effect (which SMS/email channel
 * fires) has a known Convex/Supabase storage inconsistency (see follow-up note
 * below the test suite) and is intentionally tested at the scheduling level only.
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedGabinetPrereqs,
  seedTestUser,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// A date far enough in the future that reminders will always be scheduled
// (the scheduler guard in _createSideEffects skips reminders already in the past).
// Pick a date whose day-of-week is covered by the all-days working-hours seed
// in seedGabinetPrereqs — all days 0-6 are seeded, so any future date works.
const FUTURE_DATE = "2099-12-01";
const START_TIME = "10:00";
const END_TIME = "10:30";
const APPOINTMENT_MS = new Date(`${FUTURE_DATE}T${START_TIME}:00`).getTime();

// ─── Shared setup/teardown ────────────────────────────────────────────────────

beforeEach(() => {
  // Stub fetch so any SMS/email HTTP calls from the reminder path are no-ops.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ sid: "SM_ORGSET_AUDIT" }),
    })) as unknown as typeof fetch,
  );
});

afterEach(async () => {
  // Drain any pending setTimeout(0) side-effect callbacks before the next test
  // creates a fresh context. The process-wide scheduler-noise filter in
  // tests/convex/_setup.ts swallows any orphan-write rejections that escape.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

// ─── Helper: create a future appointment via the public action ────────────────

async function createFutureAppointment(
  t: ReturnType<typeof createTestCtx>,
  identity: { subject: string; issuer: string; tokenIdentifier: string },
  args: {
    organizationId: any;
    patientId: any;
    treatmentId: any;
    employeeId: any;
    sendReminder?: boolean;
  },
) {
  return t.withIdentity(identity).action(api.gabinet.appointments.create, {
    organizationId: args.organizationId,
    patientId: String(args.patientId),
    treatmentId: String(args.treatmentId),
    employeeId: String(args.employeeId),
    date: FUTURE_DATE,
    startTime: START_TIME,
    endTime: END_TIME,
    ...(args.sendReminder !== undefined
      ? { sendReminder: args.sendReminder }
      : {}),
  });
}

// ─── Helper: seed orgSettings into Convex ctx.db ─────────────────────────────

async function seedConvexOrgSettings(
  t: ReturnType<typeof createTestCtx>,
  organizationId: any,
  extra: Record<string, unknown>,
) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("orgSettings", {
      organizationId,
      allowCustomLostReason: false,
      lostReasonRequired: false,
      createdAt: now,
      updatedAt: now,
      ...extra,
    });
  });
}

// ─── Helper: seed orgSettings into in-memory Supabase mock ───────────────────

async function seedSupabaseOrgSettings(
  organizationId: string,
  extra: Record<string, unknown>,
) {
  const db = createSupabaseDb();
  const now = Date.now();
  await db.insert("orgSettings", {
    organizationId,
    allowCustomLostReason: false,
    lostReasonRequired: false,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
}

// =============================================================================
// reminderEnabled
// =============================================================================

describe("reminderEnabled: controls whether appointment creation schedules a reminder", () => {
  test("reminderEnabled=true causes a pending appointmentReminders entry to be created in Convex", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // Seed reminderEnabled=true in Supabase (read by _getOrgSettings internalAction).
    // No 4-toggle config → falls through to legacy 24h mode in _createSideEffects.
    await seedSupabaseOrgSettings(String(organizationId), { reminderEnabled: true });

    // Create appointment without an explicit sendReminder arg so the action
    // picks up the value from orgSettings.reminderEnabled.
    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders[0].status).toBe("pending");
    expect(reminders[0].organizationId).toStrictEqual(organizationId);
  });

  test("reminderEnabled=false prevents any appointmentReminders entry from being created", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await seedSupabaseOrgSettings(String(organizationId), { reminderEnabled: false });

    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders).toHaveLength(0);
  });
});

// =============================================================================
// reminderHoursBefore (legacy mode — no 4-toggle config in Supabase)
// =============================================================================

describe("reminderHoursBefore: controls legacy single-reminder offset", () => {
  test("reminderHoursBefore=48 schedules reminder 48 hours before appointment time", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // Seed 48h offset in Supabase. No 4-toggle config → legacy mode uses this value.
    await seedSupabaseOrgSettings(String(organizationId), { reminderHoursBefore: 48 });

    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      sendReminder: true,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders).toHaveLength(1);
    const expected48h = APPOINTMENT_MS - 48 * 60 * 60 * 1000;
    expect(reminders[0].scheduledFor).toBe(expected48h);
  });

  test("reminderHoursBefore defaults to 24 when orgSettings not configured", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // No orgSettings at all — code defaults to 24h (appointments.ts:1046 ?? 24).

    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      sendReminder: true,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders).toHaveLength(1);
    const expected24h = APPOINTMENT_MS - 24 * 60 * 60 * 1000;
    expect(reminders[0].scheduledFor).toBe(expected24h);
  });
});

// =============================================================================
// 4-toggle channel config: reminderSms24h / reminderEmail24h /
//                          reminderSms48h / reminderEmail48h
//
// When any of these four fields is explicitly set in orgSettings (Supabase),
// _createSideEffects switches from legacy single-timing mode to 4-toggle mode.
// The mode decides WHICH timing slots (24h, 48h) get scheduled based on whether
// the combined need24h / need48h expression evaluates to true.
// =============================================================================

describe("4-toggle channel settings: control which reminder timing slots get scheduled", () => {
  test("reminderSms24h=true only → one 24h reminder slot scheduled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // Setting any of the four toggle fields activates 4-toggle mode in Supabase.
    await seedSupabaseOrgSettings(String(organizationId), {
      reminderSms24h: true,
      reminderEmail24h: false,
      reminderSms48h: false,
      reminderEmail48h: false,
    });

    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      sendReminder: true,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders).toHaveLength(1);
    const expected24h = APPOINTMENT_MS - 24 * 60 * 60 * 1000;
    expect(reminders[0].scheduledFor).toBe(expected24h);
  });

  test("reminderEmail48h=true only → one 48h reminder slot scheduled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await seedSupabaseOrgSettings(String(organizationId), {
      reminderSms24h: false,
      reminderEmail24h: false,
      reminderSms48h: false,
      reminderEmail48h: true,
    });

    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      sendReminder: true,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders).toHaveLength(1);
    const expected48h = APPOINTMENT_MS - 48 * 60 * 60 * 1000;
    expect(reminders[0].scheduledFor).toBe(expected48h);
  });

  test("SMS-24h + Email-48h both true → two slots (24h and 48h) scheduled", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await seedSupabaseOrgSettings(String(organizationId), {
      reminderSms24h: true,
      reminderEmail24h: false,
      reminderSms48h: false,
      reminderEmail48h: true,
    });

    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      sendReminder: true,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders).toHaveLength(2);
    const times = reminders.map((r) => r.scheduledFor).sort((a, b) => a - b);
    expect(times[0]).toBe(APPOINTMENT_MS - 48 * 60 * 60 * 1000);
    expect(times[1]).toBe(APPOINTMENT_MS - 24 * 60 * 60 * 1000);
  });

  test("all 4 channel toggles false → no reminder slots scheduled even when sendReminder=true", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    await seedSupabaseOrgSettings(String(organizationId), {
      reminderSms24h: false,
      reminderEmail24h: false,
      reminderSms48h: false,
      reminderEmail48h: false,
    });

    await createFutureAppointment(t, identity, {
      organizationId,
      patientId,
      treatmentId,
      employeeId: userId,
      sendReminder: true,
    });

    const reminders = await t.run(async (ctx) =>
      ctx.db.query("appointmentReminders").collect(),
    );
    expect(reminders).toHaveLength(0);
  });
});

// =============================================================================
// resourceSharingEnabled
// =============================================================================

describe("resourceSharingEnabled: controls permissions.getResourceSharingEnabled return value", () => {
  test("resourceSharingEnabled=false returns false", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), {
      resourceSharingEnabled: false,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.permissions.getResourceSharingEnabled, { organizationId });

    expect(result).toBe(false);
  });

  test("resourceSharingEnabled=true returns true", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), {
      resourceSharingEnabled: true,
    });

    const result = await t
      .withIdentity(identity)
      .action(api.permissions.getResourceSharingEnabled, { organizationId });

    expect(result).toBe(true);
  });

  test("resourceSharingEnabled defaults to true (fail-open) when orgSettings not configured", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // No orgSettings row — getResourceSharingEnabled returns ?? true (permissions.ts:118)

    const result = await t
      .withIdentity(identity)
      .action(api.permissions.getResourceSharingEnabled, { organizationId });

    expect(result).toBe(true);
  });
});

// =============================================================================
// allowCustomLostReason
// =============================================================================

describe("allowCustomLostReason: controls whether lostReasons.create is permitted", () => {
  test("allowCustomLostReason=true allows creating a custom lost reason", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { allowCustomLostReason: true });

    await expect(
      t.withIdentity(identity).action(api.crm.lostReasons.create, {
        organizationId,
        label: "Custom reason",
      }),
    ).resolves.toBeDefined();
  });

  test("allowCustomLostReason=false blocks creating a custom lost reason", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { allowCustomLostReason: false });

    await expect(
      t.withIdentity(identity).action(api.crm.lostReasons.create, {
        organizationId,
        label: "Blocked reason",
      }),
    ).rejects.toThrow("Custom lost reasons are disabled");
  });

  test("allowCustomLostReason defaults to allow (fail-open) when orgSettings not configured", async () => {
    const t = createTestCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // No orgSettings row — lostReasons.create should succeed (settings?.allowCustomLostReason === false is false when settings is null)

    await expect(
      t.withIdentity(identity).action(api.crm.lostReasons.create, {
        organizationId,
        label: "Default allow reason",
      }),
    ).resolves.toBeDefined();
  });
});

// =============================================================================
// lostReasonRequired
// =============================================================================

describe("lostReasonRequired: blocks leads.update to 'lost' status when no lostReason provided", () => {
  async function seedLead(organizationId: string, userId: string): Promise<string> {
    const db = createSupabaseDb();
    const now = Date.now();
    return db.insert("leads", {
      organizationId,
      title: "Test Lead",
      status: "open",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }

  test("lostReasonRequired=true blocks marking a lead lost without a reason", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { lostReasonRequired: true });
    const leadId = await seedLead(String(organizationId), String(userId));

    await expect(
      t.withIdentity(identity).action(api.crm.leads.update, {
        organizationId,
        leadId,
        status: "lost",
      }),
    ).rejects.toThrow("A lost reason is required");
  });

  test("lostReasonRequired=true allows marking a lead lost when lostReason is provided", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { lostReasonRequired: true });
    const leadId = await seedLead(String(organizationId), String(userId));

    await expect(
      t.withIdentity(identity).action(api.crm.leads.update, {
        organizationId,
        leadId,
        status: "lost",
        lostReason: "Price too high",
      }),
    ).resolves.toBeDefined();
  });

  test("lostReasonRequired=false allows marking a lead lost without a reason", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { lostReasonRequired: false });
    const leadId = await seedLead(String(organizationId), String(userId));

    await expect(
      t.withIdentity(identity).action(api.crm.leads.update, {
        organizationId,
        leadId,
        status: "lost",
      }),
    ).resolves.toBeDefined();
  });

  test("lostReasonRequired defaults to not required (fail-open) when orgSettings not configured", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    // No orgSettings row — leads.update to "lost" should succeed without a reason
    const leadId = await seedLead(String(organizationId), String(userId));

    await expect(
      t.withIdentity(identity).action(api.crm.leads.update, {
        organizationId,
        leadId,
        status: "lost",
      }),
    ).resolves.toBeDefined();
  });
});

// =============================================================================
// lostReasonRequired (via moveToStage)
// =============================================================================

describe("lostReasonRequired: blocks moveToStage to a lost pipeline stage when no lostReason provided", () => {
  async function seedLeadAndLostStage(
    organizationId: string,
    userId: string,
  ): Promise<{ leadId: string; lostStageId: string }> {
    const db = createSupabaseDb();
    const now = Date.now();
    const leadId = await db.insert("leads", {
      organizationId,
      title: "Test Lead",
      status: "open",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    const lostStageId = await db.insert("pipelineStages", {
      organizationId,
      name: "Lost",
      isLostStage: true,
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { leadId, lostStageId };
  }

  test("lostReasonRequired=true blocks moveToStage to a lost stage without a reason", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { lostReasonRequired: true });
    const { leadId, lostStageId } = await seedLeadAndLostStage(
      String(organizationId),
      String(userId),
    );

    await expect(
      t.withIdentity(identity).action(api.crm.leads.moveToStage, {
        organizationId,
        leadId,
        pipelineStageId: lostStageId,
        stageOrder: 0,
      }),
    ).rejects.toThrow("A lost reason is required");
  });

  test("lostReasonRequired=true allows moveToStage to a lost stage when lostReason is provided", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { lostReasonRequired: true });
    const { leadId, lostStageId } = await seedLeadAndLostStage(
      String(organizationId),
      String(userId),
    );

    await expect(
      t.withIdentity(identity).action(api.crm.leads.moveToStage, {
        organizationId,
        leadId,
        pipelineStageId: lostStageId,
        stageOrder: 0,
        lostReason: "Price too high",
      }),
    ).resolves.toBeDefined();
  });

  test("lostReasonRequired=false allows moveToStage to a lost stage without a reason", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await seedSupabaseOrgSettings(String(organizationId), { lostReasonRequired: false });
    const { leadId, lostStageId } = await seedLeadAndLostStage(
      String(organizationId),
      String(userId),
    );

    await expect(
      t.withIdentity(identity).action(api.crm.leads.moveToStage, {
        organizationId,
        leadId,
        pipelineStageId: lostStageId,
        stageOrder: 0,
      }),
    ).resolves.toBeDefined();
  });

  test("lostReasonRequired defaults to not required (fail-open) when orgSettings not configured", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    // No orgSettings row — moveToStage to a lost stage should succeed without a reason
    const { leadId, lostStageId } = await seedLeadAndLostStage(
      String(organizationId),
      String(userId),
    );

    await expect(
      t.withIdentity(identity).action(api.crm.leads.moveToStage, {
        organizationId,
        leadId,
        pipelineStageId: lostStageId,
        stageOrder: 0,
      }),
    ).resolves.toBeDefined();
  });
});
