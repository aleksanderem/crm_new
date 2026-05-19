import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import {
  publishActivityEnvelope,
  type ActivityEnvelopeTarget,
} from "../../convex/_helpers/activityEnvelope";
import { logActivity } from "../../convex/_helpers/activities";

afterEach(async () => {
  // Let any pending setTimeout(0) side-effect callbacks (activity-envelope
  // fan-out from `notes.create` etc.) fire against the *current* instance
  // before the next test creates a new one. The process-wide scheduler-noise
  // filter in tests/convex/_setup.ts swallows any that still escape.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function listActivities(
  t: ReturnType<typeof createTestCtx>,
  organizationId: Id<"organizations">,
) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("activities").collect();
    return rows.filter((row) => row.organizationId === organizationId);
  });
}

describe("activity envelope helper", () => {
  test("rejects blank summary, blank eventKey, and empty targets", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const runWithArgs = async ({
      summary = "Sent SMS",
      eventKey = "evt-1",
      targets = [
        {
          entityType: "gabinetAppointment",
          entityId: "appointment-1",
        },
      ],
      module = "gabinet",
      occurredAt = 1_710_000_000_000,
      actor = {
        type: "user",
        userId,
      },
    }: {
      summary?: string;
      eventKey?: string;
      targets?: ActivityEnvelopeTarget[];
      module?: string;
      occurredAt?: number;
      actor?: {
        type: string;
        userId?: Id<"users">;
      };
    }) => {
      await t.run(async (ctx) => {
        await publishActivityEnvelope(ctx, {
          organizationId,
          action: "sms_sent",
          performedBy: userId,
          module,
          summary,
          occurredAt,
          actor,
          payload: {
            channel: "sms",
          },
          eventKey,
          targets,
        });
      });
    };

    await expect(runWithArgs({ summary: "   " })).rejects.toThrow(/summary/i);
    await expect(runWithArgs({ eventKey: "   " })).rejects.toThrow(/eventKey/i);
    await expect(runWithArgs({ targets: [] })).rejects.toThrow(/target/i);
  });

  test("rejects malformed envelope fields required by the shared contract", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const runWithArgs = async ({
      module = "gabinet",
      occurredAt = 1_710_000_000_000,
      actor = {
        type: "user",
        userId,
      },
      targets = [
        {
          entityType: "gabinetAppointment",
          entityId: "appointment-1",
        },
      ],
    }: {
      module?: string;
      occurredAt?: number;
      actor?: {
        type: string;
        userId?: Id<"users">;
      };
      targets?: ActivityEnvelopeTarget[];
    }) => {
      await t.run(async (ctx) => {
        await publishActivityEnvelope(ctx, {
          organizationId,
          action: "sms_sent",
          performedBy: userId,
          module,
          summary: "Sent SMS",
          occurredAt,
          actor,
          payload: {
            channel: "sms",
          },
          eventKey: "evt-1",
          targets,
        });
      });
    };

    await expect(runWithArgs({ module: "   " })).rejects.toThrow(/module/i);
    await expect(runWithArgs({ occurredAt: Number.NaN })).rejects.toThrow(/occurredAt/i);
    await expect(runWithArgs({ actor: { type: "   ", userId } })).rejects.toThrow(/actor/i);
    await expect(
      runWithArgs({
        targets: [
          {
            entityType: "   ",
            entityId: "appointment-1",
          },
        ],
      }),
    ).rejects.toThrow(/target/i);
    await expect(
      runWithArgs({
        targets: [
          {
            entityType: "gabinetAppointment",
            entityId: "   ",
          },
        ],
      }),
    ).rejects.toThrow(/target/i);
  });

  test("logActivity compatibility wrapper preserves flat fields and stores envelope metadata", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    await t.run(async (ctx) => {
      await logActivity(ctx, {
        organizationId,
        entityType: "contact",
        entityId: "contact-1",
        action: "created",
        description: "Created contact \"Jan Kowalski\"",
        metadata: {
          source: "manual",
        },
        performedBy: userId,
      });
    });

    const rows = await listActivities(t, organizationId);
    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.description).toBe("Created contact \"Jan Kowalski\"");
    expect(row.performedBy).toBe(userId);
    expect(row.createdAt).toBeTypeOf("number");
    expect(row.metadata).toMatchObject({
      source: "manual",
      activityEnvelope: {
        schemaVersion: 1,
        module: "crm",
        summary: "Created contact \"Jan Kowalski\"",
        occurredAt: row.createdAt,
        actor: {
          type: "user",
          userId,
        },
        payload: {
          legacyMetadata: {
            source: "manual",
          },
          legacyAction: "created",
        },
        attachments: [],
        targets: [
          {
            entityType: "contact",
            entityId: "contact-1",
          },
        ],
      },
    });
    expect(row.metadata?.activityEnvelope?.eventKey).toBe("crm:contact:contact-1:created");
  });

  test("publishActivityEnvelope rejects caller-supplied metadata.activityEnvelope", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    await expect(
      t.run(async (ctx) => {
        await publishActivityEnvelope(ctx, {
          organizationId,
          action: "sms_sent",
          performedBy: userId,
          module: "gabinet",
          summary: "Sent appointment confirmation SMS",
          occurredAt: 1_710_000_123_455,
          actor: {
            type: "user",
            userId,
          },
          payload: {
            template: "appointment_confirmation_request",
          },
          eventKey: "sms:appointment-confirmation:legacy",
          targets: [
            {
              entityType: "gabinetAppointment",
              entityId: "appointment-legacy",
            },
          ],
          metadata: {
            activityEnvelope: {
              legacy: true,
              source: "preexisting",
            },
            source: "manual",
          },
        });
      }),
    ).rejects.toThrow(/metadata\.activityEnvelope/i);
  });

  test("publishActivityEnvelope snapshots publish-time targets even if insert payload is mutated mid fan-out", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const targets: ActivityEnvelopeTarget[] = [
      {
        entityType: "gabinetAppointment",
        entityId: "appointment-1",
      },
      {
        entityType: "gabinetPatient",
        entityId: "patient-1",
      },
      {
        entityType: "gabinetPatient",
        entityId: "patient-1",
      },
    ];

    await t.run(async (ctx) => {
      const originalInsert = ctx.db.insert.bind(ctx.db);
      let mutatedOnce = false;

      (ctx.db as { insert: typeof ctx.db.insert }).insert = async (...insertArgs) => {
        const result = await originalInsert(...insertArgs);

        if (!mutatedOnce) {
          const [, value] = insertArgs;
          (
            value as {
              metadata?: {
                activityEnvelope?: {
                  targets?: ActivityEnvelopeTarget[];
                };
              };
            }
          ).metadata?.activityEnvelope?.targets?.push({
            entityType: "contact",
            entityId: "late-added-target",
          });
          mutatedOnce = true;
        }

        return result;
      };

      await publishActivityEnvelope(ctx, {
        organizationId,
        action: "sms_sent",
        performedBy: userId,
        module: "gabinet",
        summary: "Sent appointment confirmation SMS",
        occurredAt: 1_710_000_222_222,
        actor: {
          type: "user",
          userId,
        },
        payload: {
          template: "appointment_confirmation_request",
        },
        eventKey: "sms:appointment-confirmation:publish-time-snapshot",
        targets,
      });
    });

    const rows = await listActivities(t, organizationId);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.metadata?.activityEnvelope?.targets).toEqual([
        {
          entityType: "gabinetAppointment",
          entityId: "appointment-1",
        },
        {
          entityType: "gabinetPatient",
          entityId: "patient-1",
        },
      ]);
    }
  });

  test("publishActivityEnvelope keeps distinct target tuples even when colon-joined keys collide", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const targets: ActivityEnvelopeTarget[] = [
      {
        entityType: "crm:contact",
        entityId: "1",
      },
      {
        entityType: "crm",
        entityId: "contact:1",
      },
      {
        entityType: "crm:contact",
        entityId: "1",
      },
    ];

    await t.run(async (ctx) => {
      await publishActivityEnvelope(ctx, {
        organizationId,
        action: "sms_sent",
        performedBy: userId,
        module: "gabinet",
        summary: "Sent appointment confirmation SMS",
        occurredAt: 1_710_000_222_333,
        actor: {
          type: "user",
          userId,
        },
        payload: {
          template: "appointment_confirmation_request",
        },
        eventKey: "sms:appointment-confirmation:tuple-dedupe",
        targets,
      });
    });

    const rows = await listActivities(t, organizationId);
    expect(rows).toHaveLength(2);

    for (const row of rows) {
      expect(row.metadata?.activityEnvelope?.targets).toEqual([
        {
          entityType: "crm:contact",
          entityId: "1",
        },
        {
          entityType: "crm",
          entityId: "contact:1",
        },
      ]);
    }

    expect(rows.map((row) => `${row.entityType}|${row.entityId}`).sort()).toEqual([
      "crm:contact|1",
      "crm|contact:1",
    ]);
  });

  test("publishActivityEnvelope deduplicates targets and fans out rows with shared envelope", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const targets: ActivityEnvelopeTarget[] = [
      {
        entityType: "gabinetAppointment",
        entityId: "appointment-1",
      },
      {
        entityType: "gabinetAppointment",
        entityId: "appointment-1",
      },
      {
        entityType: "gabinetPatient",
        entityId: "patient-1",
      },
      {
        entityType: "contact",
        entityId: "contact-1",
      },
      {
        entityType: "contact",
        entityId: "contact-1",
      },
    ];

    await t.run(async (ctx) => {
      await publishActivityEnvelope(ctx, {
        organizationId,
        action: "sms_sent",
        performedBy: userId,
        module: "gabinet",
        summary: "Sent appointment confirmation SMS",
        occurredAt: 1_710_000_123_456,
        actor: {
          type: "user",
          userId,
          label: "Receptionist",
        },
        payload: {
          template: "appointment_confirmation_request",
        },
        attachments: undefined,
        eventKey: "sms:appointment-confirmation:1",
        targets,
      });
    });

    const dedupedTargets: ActivityEnvelopeTarget[] = [
      {
        entityType: "gabinetAppointment",
        entityId: "appointment-1",
      },
      {
        entityType: "gabinetPatient",
        entityId: "patient-1",
      },
      {
        entityType: "contact",
        entityId: "contact-1",
      },
    ];

    const rows = await listActivities(t, organizationId);
    expect(rows).toHaveLength(3);

    for (const row of rows) {
      expect(row.action).toBe("sms_sent");
      expect(row.description).toBe("Sent appointment confirmation SMS");
      expect(row.createdAt).toBe(1_710_000_123_456);
      expect(row.performedBy).toBe(userId);
      expect(row.metadata?.activityEnvelope).toMatchObject({
        schemaVersion: 1,
        module: "gabinet",
        summary: "Sent appointment confirmation SMS",
        occurredAt: 1_710_000_123_456,
        actor: {
          type: "user",
          userId,
          label: "Receptionist",
        },
        payload: {
          template: "appointment_confirmation_request",
        },
        attachments: [],
        eventKey: "sms:appointment-confirmation:1",
        targets: dedupedTargets,
      });
    }

    expect(rows.map((row) => `${row.entityType}:${row.entityId}`).sort()).toEqual([
      "contact:contact-1",
      "gabinetAppointment:appointment-1",
      "gabinetPatient:patient-1",
    ]);
  });

  test("notes.create publishes note_added envelope with stable eventKey and semantic payload", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    const noteId = await t.withIdentity(identity).action(api.notes.create, {
      organizationId,
      entityType: "contact",
      entityId: "contact-123",
      content: "Follow up tomorrow",
    });

    expect(noteId).toBeTruthy();

    const rows = await listActivities(t, organizationId);
    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.entityType).toBe("contact");
    expect(row.entityId).toBe("contact-123");
    expect(row.action).toBe("note_added");
    expect(row.description).toBe("Added a note");
    expect(row.performedBy).toBe(userId);

    const envelope = row.metadata?.activityEnvelope;
    expect(envelope).toBeTruthy();
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      module: "crm",
      summary: "Added a note",
      actor: {
        type: "user",
        userId,
      },
      payload: {
        noteId,
        noteContent: "Follow up tomorrow",
      },
      targets: [
        {
          entityType: "contact",
          entityId: "contact-123",
        },
      ],
    });
    expect(envelope.eventKey).toBe(`crm:note:contact:contact-123:${noteId}:note_added`);
    expect(envelope.occurredAt).toBe(row.createdAt);
  });
});
