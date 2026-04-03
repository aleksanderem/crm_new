import { describe, expect, it } from "vitest";
import { activitiesToFeedEntries } from "./activity-feed-adapter";

describe("activitiesToFeedEntries", () => {
  it("prefers envelope actor label over opaque performedBy id", () => {
    const entries = activitiesToFeedEntries([
      {
        _id: "a1",
        action: "relationship_added",
        description: "Added relationship to deal entity",
        performedBy: "mn734w9bg99bv05j8gc9p241bd829mrz",
        createdAt: 1,
        metadata: {
          activityEnvelope: {
            actor: {
              label: "Alfred Admin",
            },
          },
        },
      },
    ]);

    expect(entries[0]?.performedBy).toEqual({ name: "Alfred Admin" });
  });

  it("hides opaque performedBy id when no readable actor label exists", () => {
    const entries = activitiesToFeedEntries([
      {
        _id: "a2",
        action: "relationship_removed",
        description: "Removed relationship to deal entity",
        performedBy: "mn734w9bg99bv05j8gc9p241bd829mrz",
        createdAt: 2,
      },
    ]);

    expect(entries[0]?.performedBy).toBeUndefined();
  });

  it("keeps readable legacy performedBy values", () => {
    const entries = activitiesToFeedEntries([
      {
        _id: "a3",
        action: "updated",
        description: "Updated contact",
        performedBy: "Jan Kowalski",
        createdAt: 3,
      },
    ]);

    expect(entries[0]?.performedBy).toEqual({ name: "Jan Kowalski" });
  });

  it("maps user-driven change actions to activity instead of system", () => {
    const entries = activitiesToFeedEntries([
      {
        _id: "a4",
        action: "updated",
        description: "Updated lead",
        createdAt: 4,
      },
      {
        _id: "a5",
        action: "status_changed",
        description: "Changed status",
        createdAt: 5,
      },
      {
        _id: "a6",
        action: "created",
        description: "Created lead",
        createdAt: 6,
      },
    ]);

    expect(entries[0]?.type).toBe("activity");
    expect(entries[1]?.type).toBe("activity");
    expect(entries[2]?.type).toBe("activity");
  });
});
