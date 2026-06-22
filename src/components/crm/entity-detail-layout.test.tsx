import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "common.actions") return "Akcje";
      return key;
    },
  }),
}));

import { EntityDetailLayout } from "./entity-detail-layout";

function countLabel(markup: string, label: string) {
  return (markup.match(new RegExp(label, "g")) ?? []).length;
}

describe("EntityDetailLayout", () => {
  it("does not render a second association header when the child renders its own header", () => {
    const markup = renderToStaticMarkup(
      <EntityDetailLayout
        title="Lead testowy"
        fields={[]}
        tabs={[{ label: "All", content: <div>Tab content</div> }]}
        associations={[
          {
            title: "Kontakty",
            count: 0,
            childrenOwnHeader: true,
            children: <div>Kontakty <span>(0)</span></div>,
          } as any,
        ]}
      />,
    );

    expect(countLabel(markup, "Kontakty")).toBe(1);
  });

  it("renders the shared actions dropdown in the default layout variant", () => {
    const markup = renderToStaticMarkup(
      <EntityDetailLayout
        variant="default"
        title="Lead testowy"
        fields={[]}
        tabs={[{ label: "All", content: <div>Tab content</div> }]}
        primaryAction={{ label: "Mark won", onClick: () => {} }}
        secondaryActions={[{ label: "Mark lost", onClick: () => {} }]}
        quickActionItems={[{ key: "schedule", label: "Schedule activity", onClick: () => {} }]}
      />,
    );

    expect(markup).toContain("Akcje");
  });
});
