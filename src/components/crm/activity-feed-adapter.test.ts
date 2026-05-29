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

  it("translates entity-specific stored descriptions when t is provided", () => {
    // Minimal i18next-like translator that echoes the default value with
    // params interpolated, so we can assert template structure without
    // depending on the real i18n setup.
    const t = (
      _key: string,
      arg?: string | { defaultValue?: string; [k: string]: unknown },
    ): string => {
      if (typeof arg === "string") return arg;
      const tpl = (arg?.defaultValue as string) ?? "";
      return tpl.replace(/\{\{(\w+)\}\}/g, (_, name) => String(arg?.[name] ?? ""));
    };

    const entries = activitiesToFeedEntries(
      [
        {
          _id: "x1",
          action: "created",
          description: 'Created contact "Jan Kowalski"',
          createdAt: 1,
        },
        {
          _id: "x2",
          action: "created",
          description: 'Created treatment "Botox"',
          createdAt: 2,
        },
        {
          _id: "x3",
          action: "updated",
          description: 'Updated pipeline "Sales"',
          createdAt: 3,
        },
        {
          _id: "x4",
          action: "created",
          description: 'Created task "Follow up"',
          createdAt: 4,
        },
      ],
      t,
    );

    // Entity-specific rules should win over the generic
    // `Created {{type}} "{{title}}"` scheduled-activity fallback.
    expect(entries[0]?.title).toBe('Created contact "Jan Kowalski"');
    expect(entries[1]?.title).toBe('Created treatment "Botox"');
    expect(entries[2]?.title).toBe('Updated pipeline "Sales"');
    // No entity-specific rule for `task`, falls through to scheduled-activity.
    expect(entries[3]?.title).toBe('Created task "Follow up"');
  });
});
