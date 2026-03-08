// ---------------------------------------------------------------------------
// Email Builder — Block Palette Panel
// ---------------------------------------------------------------------------
// Renders available blocks grouped by category.
// Uses GrapesJS BlocksProvider render-prop data.
// ---------------------------------------------------------------------------

import type { BlocksResultProps } from "@grapesjs/react";
import type { EmailBuilderTheme } from "../types";

interface BlockPaletteProps extends BlocksResultProps {
  theme: EmailBuilderTheme;
}

export function BlockPalette({
  mapCategoryBlocks,
  dragStart,
  dragStop,
  theme,
}: BlockPaletteProps) {
  return (
    <div style={{ padding: "8px" }}>
      {Array.from(mapCategoryBlocks.entries()).map(([category, blocks]) => (
        <div key={category} style={{ marginBottom: "12px" }}>
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: theme.mutedTextColor,
              padding: "4px 8px",
              margin: 0,
            }}
          >
            {category || "Basic"}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "6px",
            }}
          >
            {blocks.map((block) => (
              <div
                key={block.getId()}
                draggable
                onDragStart={(e) => dragStart(block, e.nativeEvent)}
                onDragEnd={() => dragStop(false)}
                style={{
                  padding: "8px 6px",
                  border: `1px solid ${theme.borderColor}`,
                  borderRadius: theme.borderRadius ?? "8px",
                  backgroundColor: theme.surfaceColor,
                  cursor: "grab",
                  textAlign: "center",
                  fontSize: "11px",
                  color: theme.textColor,
                  transition: "border-color 0.15s, background-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = theme.primaryColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = theme.borderColor;
                }}
              >
                {block.getMedia() && (
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      margin: "0 auto 4px",
                      color: theme.primaryColor,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: block.getMedia() ?? "",
                    }}
                  />
                )}
                <span>{block.getLabel()}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
