import { describe, expect, it } from "vitest";
import { mapActivityFromSupabase } from "./activities";

describe("mapActivityFromSupabase", () => {
  it("maps joined user name into performedByName", () => {
    const mapped = mapActivityFromSupabase({
      id: "activity-1",
      organization_id: "org-1",
      entity_type: "lead",
      entity_id: "lead-1",
      action: "updated",
      description: "Updated lead",
      metadata: null,
      performed_by: "user-1",
      created_at: 1712100000000,
      users: {
        id: "user-1",
        name: "Alfred Admin",
        email: "alfred@example.com",
      },
    } as any);

    expect(mapped.performedByName).toBe("Alfred Admin");
  });
});
