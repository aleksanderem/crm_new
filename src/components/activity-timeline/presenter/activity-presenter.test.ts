import { describe, expect, it } from "vitest";
import { presentActivity } from "./activity-presenter";

describe("presentActivity", () => {
  it("renders generic envelope fields", () => {
    const presented = presentActivity({
      _id: "a1",
      action: "updated",
      description: "Legacy description",
      performedByName: "Legacy user",
      createdAt: 1,
      metadata: {
        activityEnvelope: {
          summary: "Envelope summary",
          actor: { label: "Envelope actor" },
          payload: {
            body: "Envelope body",
            subject: "Envelope subject",
          },
        },
      },
    });

    expect(presented.description).toBe("Envelope summary");
    expect(presented.performedByName).toBe("Envelope actor");
    expect(presented.contentSnapshot).toBe("Envelope body");
    expect(presented.metaLines).toEqual(["Subject: Envelope subject"]);
  });

  it("renders email actions from semantic envelope payload", () => {
    const presented = presentActivity({
      _id: "a2",
      action: "email_sent",
      description: "Legacy email description",
      performedByName: "Legacy sender",
      createdAt: 2,
      metadata: {
        activityEnvelope: {
          actor: { label: "Envelope sender" },
          payload: {
            to: ["client@example.com"],
            subject: "Welcome aboard",
            bodyText: "Hello from CRM",
          },
        },
      },
    });

    expect(presented.description).toBe(
      'Sent email "Welcome aboard" to client@example.com',
    );
    expect(presented.performedByName).toBe("Envelope sender");
    expect(presented.contentSnapshot).toBe("Hello from CRM");
    expect(presented.metaLines).toEqual([
      "To: client@example.com",
      "Subject: Welcome aboard",
    ]);
  });

  it("falls back from envelope fields to legacy fields", () => {
    const envelopeWins = presentActivity({
      _id: "a3",
      action: "updated",
      description: "Legacy description",
      createdAt: 3,
      contentSnapshot: "Legacy snapshot",
      metaLines: ["Legacy line"],
      metadata: {
        activityEnvelope: {
          summary: "Envelope summary",
          payload: { body: "Envelope snapshot" },
        },
      },
    });

    expect(envelopeWins.description).toBe("Envelope summary");
    expect(envelopeWins.contentSnapshot).toBe("Envelope snapshot");

    const fallbackToLegacy = presentActivity({
      _id: "a4",
      action: "updated",
      description: "Legacy description",
      createdAt: 4,
      contentSnapshot: "Legacy snapshot",
      metaLines: ["Legacy line"],
      metadata: {
        activityEnvelope: {
          payload: {},
        },
      },
    });

    expect(fallbackToLegacy.description).toBe("Legacy description");
    expect(fallbackToLegacy.contentSnapshot).toBe("Legacy snapshot");
    expect(fallbackToLegacy.metaLines).toEqual(["Legacy line"]);
  });
});
