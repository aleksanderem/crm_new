import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Resolve all componentBlock nodes in a TipTap JSON document.
 * Replaces each componentBlock with the component's actual content nodes.
 * Also appends any protected end-position components (e.g., QUERA footer)
 * if not already present.
 */
export async function resolveComponentsInContent(
  ctx: QueryCtx | MutationCtx,
  contentJson: string | undefined,
): Promise<string | undefined> {
  if (!contentJson) return contentJson;

  let doc: any;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return contentJson;
  }

  if (!doc.content || !Array.isArray(doc.content)) return contentJson;

  const resolved: any[] = [];
  let hasProtectedEnd = false;

  for (const node of doc.content) {
    if (node.type === "componentBlock" && node.attrs?.componentId) {
      try {
        const comp = await ctx.db.get(
          node.attrs.componentId as Id<"documentComponents">,
        );
        if (comp && comp.contentJson) {
          const compDoc = JSON.parse(comp.contentJson);
          if (compDoc.content && Array.isArray(compDoc.content)) {
            resolved.push(...compDoc.content);
          }
          if (comp.positionConstraint === "end") hasProtectedEnd = true;
        }
      } catch {
        // Component not found or parse error — skip
      }
    } else {
      resolved.push(node);
    }
  }

  // Append protected footer if not already included
  if (!hasProtectedEnd) {
    const systemComponents = await ctx.db
      .query("documentComponents")
      .withIndex("by_scope", (q) => q.eq("scope", "system"))
      .collect();
    const protectedFooter = systemComponents.find(
      (c) => c.protected && c.positionConstraint === "end" && c.isActive,
    );
    if (protectedFooter?.contentJson) {
      try {
        const footerDoc = JSON.parse(protectedFooter.contentJson);
        if (footerDoc.content && Array.isArray(footerDoc.content)) {
          resolved.push(...footerDoc.content);
        }
      } catch {
        // Parse error — skip footer
      }
    }
  }

  return JSON.stringify({ ...doc, content: resolved });
}
