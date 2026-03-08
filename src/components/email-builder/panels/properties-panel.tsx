// ---------------------------------------------------------------------------
// Email Builder — Properties Panel (right sidebar)
// ---------------------------------------------------------------------------
// Tabbed panel: Styles | Settings | Layers
// Mounts GrapesJS built-in UI into ref containers (NOT custom/provider mode,
// which would require us to rebuild the entire styles/traits/layers UI).
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect, useCallback } from "react";
import type { Editor } from "grapesjs";
import type { EmailBuilderTheme } from "../types";

interface PropertiesPanelProps {
  theme: EmailBuilderTheme;
  editor: Editor | null;
}

type PanelTab = "styles" | "traits" | "layers";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "styles", label: "Styles" },
  { id: "traits", label: "Settings" },
  { id: "layers", label: "Layers" },
];

export function PropertiesPanel({ theme, editor }: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("styles");

  const stylesRef = useRef<HTMLDivElement>(null);
  const traitsRef = useRef<HTMLDivElement>(null);
  const layersRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Mount GrapesJS built-in UI elements into our ref containers once
  useEffect(() => {
    if (!editor || mountedRef.current) return;
    mountedRef.current = true;

    if (stylesRef.current) {
      stylesRef.current.appendChild(editor.StyleManager.render());
    }
    if (traitsRef.current) {
      traitsRef.current.appendChild(editor.TraitManager.render());
    }
    if (layersRef.current) {
      layersRef.current.appendChild(editor.LayerManager.render());
    }
  }, [editor]);

  // Show/hide panels via display style (keeps DOM alive for GrapesJS)
  const tabStyle = useCallback(
    (tab: PanelTab): React.CSSProperties => ({
      display: activeTab === tab ? "block" : "none",
      height: "100%",
    }),
    [activeTab],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${theme.borderColor}`,
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: "8px 0",
              fontSize: "12px",
              fontWeight: activeTab === tab.id ? 600 : 400,
              color:
                activeTab === tab.id
                  ? theme.primaryColor
                  : theme.mutedTextColor,
              background: "transparent",
              border: "none",
              borderBottom:
                activeTab === tab.id
                  ? `2px solid ${theme.primaryColor}`
                  : "2px solid transparent",
              cursor: "pointer",
              fontFamily: theme.fontFamily ?? "inherit",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — all three panels stay in DOM, toggled via display */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div ref={stylesRef} style={tabStyle("styles")} />
        <div ref={traitsRef} style={tabStyle("traits")} />
        <div ref={layersRef} style={tabStyle("layers")} />
      </div>
    </div>
  );
}
