import type { SupabaseDb } from "../_helpers/supabaseDb";

/**
 * Resolve all componentBlock nodes in a TipTap JSON document.
 * Replaces each componentBlock with the component's actual content nodes.
 * Also appends any protected end-position components (e.g., QUERA footer)
 * if not already present. Reads `documentComponents` from Supabase.
 */
export async function resolveComponentsInContent(
  db: SupabaseDb,
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
        const comp = await db.get(
          "documentComponents",
          String(node.attrs.componentId),
        );
        if (comp && comp.contentJson) {
          const compDoc = JSON.parse(comp.contentJson as string);
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
    const systemComponents = await db
      .query("documentComponents")
      .eq("scope", "system")
      .collect();
    const protectedFooter = systemComponents.find(
      (c) => c.protected && c.positionConstraint === "end" && c.isActive,
    );
    if (protectedFooter?.contentJson) {
      try {
        const footerDoc = JSON.parse(protectedFooter.contentJson as string);
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
