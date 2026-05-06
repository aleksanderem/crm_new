import { Node, mergeAttributes } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { cn } from "@/lib/utils";
import { Puzzle, Unlink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentBlockState = "linked" | "detached" | "protected";

interface ComponentBlockAttrs {
  componentId: string;
  componentVersion: number;
  state: ComponentBlockState;
  positionConstraint: string | null;
}

// ---------------------------------------------------------------------------
// React NodeView — live component preview
// ---------------------------------------------------------------------------

function ComponentBlockNodeView({
  node,
  updateAttributes,
  selected,
  editor,
}: ReactNodeViewProps) {
  const attrs = node.attrs as ComponentBlockAttrs;
  const { organizationId } = useOrganization();

  // Fetch live component content (Supabase-primary action)
  const getComponentContent = useAction(api.documents.components.getContent);
  const { data: componentData } = useQuery({
    queryKey: ["documents.components.getContent", organizationId, attrs.componentId],
    queryFn: () =>
      getComponentContent({
        organizationId,
        componentId: attrs.componentId as string,
      }),
    enabled: !!attrs.componentId && !!organizationId,
  }) as { data: { contentJson: string; version: number; name: string; category: string; protected: boolean; positionConstraint?: string | null } | null | undefined };

  const isProtected = attrs.state === "protected";
  const isLinked = attrs.state === "linked";
  const isStale =
    isLinked &&
    componentData &&
    componentData.version > attrs.componentVersion;

  // For protected components: render content with zero chrome
  if (isProtected) {
    return (
      <NodeViewWrapper className="component-block-protected" contentEditable={false}>
        {componentData?.contentJson ? (
          <div
            className="prose prose-sm max-w-none text-gray-900"
            dangerouslySetInnerHTML={{
              __html: renderContentJsonToHtml(componentData.contentJson),
            }}
          />
        ) : (
          <div className="py-2 text-center text-xs text-gray-400">
            Ładowanie...
          </div>
        )}
      </NodeViewWrapper>
    );
  }

  // Linked components: show with border + toolbar
  const handleDetach = () => {
    if (!componentData?.contentJson || !editor) return;
    try {
      const content = JSON.parse(componentData.contentJson);
      const nodes = content.content || [];
      // Replace this node with the component's content nodes
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const nodePos = findNodePos(tr.doc, node);
          if (nodePos === null) return false;
          const resolvedContent = editor.schema.nodeFromJSON({
            type: "doc",
            content: nodes,
          });
          tr.replaceWith(
            nodePos,
            nodePos + node.nodeSize,
            resolvedContent.content,
          );
          return true;
        })
        .run();
    } catch {
      // Failed to parse — ignore
    }
  };

  const handleRefresh = () => {
    if (componentData) {
      updateAttributes({ componentVersion: componentData.version });
    }
  };

  return (
    <NodeViewWrapper className="my-2">
      <div
        className={cn(
          "overflow-hidden rounded-md border",
          "border-indigo-200 bg-indigo-50/30",
          selected && "ring-2 ring-primary",
        )}
      >
        {/* Header bar */}
        <div className="flex items-center gap-1.5 border-b border-indigo-200 bg-indigo-50 px-3 py-1">
          <Puzzle className="h-3.5 w-3.5 text-indigo-600" />
          <span className="text-xs font-medium text-indigo-700">
            {componentData?.name ?? "Komponent"}
          </span>
          {componentData?.category && (
            <span className="text-[10px] text-indigo-400">
              {componentData.category}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            {isStale && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-amber-600 hover:text-amber-700"
                onClick={handleRefresh}
                title="Odśwież do najnowszej wersji"
              >
                <RefreshCw className="mr-1 h-3 w-3" />
                Odśwież
              </Button>
            )}
            {isLinked && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-indigo-600"
                onClick={handleDetach}
                title="Odłącz — wstaw treść jako zwykły tekst"
              >
                <Unlink className="mr-1 h-3 w-3" />
                Odłącz
              </Button>
            )}
          </div>
        </div>

        {/* Content preview */}
        <div
          className="prose prose-sm max-w-none bg-white p-3 text-gray-900 [&_*]:!text-gray-900 [&_a]:!text-blue-700"
          contentEditable={false}
        >
          {componentData?.contentJson ? (
            <div
              dangerouslySetInnerHTML={{
                __html: renderContentJsonToHtml(componentData.contentJson),
              }}
            />
          ) : (
            <div className="py-4 text-center text-sm text-gray-400">
              Ładowanie komponentu...
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// ---------------------------------------------------------------------------
// Minimal TipTap JSON → HTML renderer for preview
// ---------------------------------------------------------------------------

function renderContentJsonToHtml(contentJson: string): string {
  try {
    const doc = JSON.parse(contentJson);
    return renderNodes(doc.content || []);
  } catch {
    return "<p>Błąd renderowania</p>";
  }
}

function renderNodes(nodes: any[]): string {
  return nodes.map(renderNode).join("");
}

function renderNode(node: any): string {
  if (node.type === "text") {
    let text = escapeHtml(node.text || "");
    for (const mark of node.marks || []) {
      if (mark.type === "bold") text = `<strong>${text}</strong>`;
      if (mark.type === "italic") text = `<em>${text}</em>`;
      if (mark.type === "underline") text = `<u>${text}</u>`;
    }
    return text;
  }
  if (node.type === "paragraph") {
    const align = node.attrs?.textAlign;
    const style = align ? ` style="text-align:${align}"` : "";
    return `<p${style}>${renderNodes(node.content || [])}</p>`;
  }
  if (node.type === "heading") {
    const level = node.attrs?.level ?? 2;
    const align = node.attrs?.textAlign;
    const style = align ? ` style="text-align:${align}"` : "";
    return `<h${level}${style}>${renderNodes(node.content || [])}</h${level}>`;
  }
  if (node.type === "horizontalRule") return "<hr/>";
  if (node.type === "bulletList") return `<ul>${renderNodes(node.content || [])}</ul>`;
  if (node.type === "orderedList") return `<ol>${renderNodes(node.content || [])}</ol>`;
  if (node.type === "listItem") return `<li>${renderNodes(node.content || [])}</li>`;
  if (node.type === "table") return `<table>${renderNodes(node.content || [])}</table>`;
  if (node.type === "tableRow") return `<tr>${renderNodes(node.content || [])}</tr>`;
  if (node.type === "tableHeader") return `<th>${renderNodes(node.content || [])}</th>`;
  if (node.type === "tableCell") return `<td>${renderNodes(node.content || [])}</td>`;
  if (node.type === "variableMentionCurly" || node.type === "variableMentionAt") {
    const id = node.attrs?.id || "";
    return `<span class="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 border border-gray-200">{{${escapeHtml(id)}}}</span>`;
  }
  if (node.type === "formField") {
    const label = node.attrs?.label || node.attrs?.fieldId || "Field";
    return `<span class="inline-flex items-center rounded border border-dashed border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-700">[${escapeHtml(label)}]</span>`;
  }
  if (node.type === "columnLayout") {
    const cols = node.attrs?.columns ?? 2;
    return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:1rem">${renderNodes(node.content || [])}</div>`;
  }
  if (node.type === "column") {
    return `<div>${renderNodes(node.content || [])}</div>`;
  }
  // Fallback: render children
  if (node.content) return renderNodes(node.content);
  return "";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Helper: find a node's position in a ProseMirror document
// ---------------------------------------------------------------------------

function findNodePos(doc: any, target: any): number | null {
  let found: number | null = null;
  doc.descendants((node: any, pos: number) => {
    if (found !== null) return false;
    if (node === target) {
      found = pos;
      return false;
    }
  });
  return found;
}

// ---------------------------------------------------------------------------
// TipTap Node extension
// ---------------------------------------------------------------------------

export const ComponentBlockNode = Node.create({
  name: "componentBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      componentId: { default: "" },
      componentVersion: { default: 1 },
      state: { default: "linked" as ComponentBlockState },
      positionConstraint: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-component-block="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-component-block": "true",
        "data-component-id": HTMLAttributes.componentId,
        "data-component-state": HTMLAttributes.state,
      }),
      `[Komponent: ${HTMLAttributes.componentId}]`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ComponentBlockNodeView);
  },

  addCommands() {
    return {
      insertComponentBlock:
        (componentId: string, version: number, state?: ComponentBlockState, positionConstraint?: string | null) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                componentId,
                componentVersion: version,
                state: state ?? "linked",
                positionConstraint: positionConstraint ?? null,
              },
            })
            .run();
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    componentBlock: {
      insertComponentBlock: (
        componentId: string,
        version: number,
        state?: ComponentBlockState,
        positionConstraint?: string | null,
      ) => ReturnType;
    };
  }
}
