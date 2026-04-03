import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityFeed, type FeedEntry } from "./activity-feed";

function countActorSystemLabels(markup: string) {
  return (markup.match(/class="text-xs font-medium">System<\/span>/g) ?? []).length;
}

describe("ActivityFeed", () => {
  it("does not fall back to System for actorless user activity entries", () => {
    const entries: FeedEntry[] = [
      {
        _id: "note-1",
        type: "note",
        action: "note_added",
        title: "Added a note",
        body: "Treść notatki",
        createdAt: 1,
      },
    ];

    const markup = renderToStaticMarkup(<ActivityFeed entries={entries} />);

    expect(countActorSystemLabels(markup)).toBe(0);
  });
});
