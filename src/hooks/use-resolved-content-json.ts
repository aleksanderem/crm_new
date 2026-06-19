import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";

/**
 * Resolve componentBlock nodes in a TipTap contentJson string via the server.
 * Returns the resolved JSON (or the original on miss / error / loading) so
 * callers can pass it straight into renderDocument without rendering the
 * literal "[Komponent: <id>]" placeholder that componentBlock.renderHTML
 * emits for unresolved blocks (#1915).
 *
 * Server-rendered contexts (previewDocumentData, getBySigningToken) already
 * resolve before returning contentJson — use this hook when the contentJson
 * arrives from a list/get template action or from in-memory editor state.
 */
export function useResolvedContentJson(contentJson: string | null | undefined): {
  resolvedContentJson: string | null | undefined;
  isLoading: boolean;
} {
  const { organizationId } = useOrganization();
  const resolveContentJson = useAction(api.documents.components.resolveContentJson);

  const hasComponentBlocks = !!contentJson && contentJson.includes("componentBlock");
  const enabled = !!organizationId && hasComponentBlocks;

  const { data, isLoading } = useQuery({
    queryKey: ["documents.components.resolveContentJson", organizationId, contentJson],
    queryFn: () =>
      resolveContentJson({
        organizationId,
        contentJson: contentJson as string,
      }),
    enabled,
    staleTime: 60_000,
  });

  if (!hasComponentBlocks) {
    return { resolvedContentJson: contentJson, isLoading: false };
  }
  return {
    resolvedContentJson: data ?? contentJson,
    isLoading: enabled && isLoading,
  };
}
