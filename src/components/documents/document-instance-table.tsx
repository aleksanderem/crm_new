import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id, Doc } from "@cvx/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { Plus, FileText, Eye } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentInstance = Doc<"documentInstances">;
type DocumentStatus = DocumentInstance["status"];

interface DocumentInstanceTableProps {
  organizationId: Id<"organizations">;
  sourceKey?: string;
  sourceInstanceId?: string;
  status?: string;
  module?: string;
  onView?: (instanceId: Id<"documentInstances">) => void;
  onNewFromTemplate?: () => void;
  showNewButton?: boolean;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "Szkic",
  pending_review: "Do przeglądu",
  approved: "Zatwierdzony",
  pending_signature: "Do podpisu",
  signed: "Podpisany",
  archived: "Zarchiwizowany",
};

const STATUS_VARIANT: Record<
  DocumentStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  pending_review: "outline",
  approved: "default",
  pending_signature: "outline",
  signed: "default",
  archived: "secondary",
};

const STATUS_CLASS: Record<DocumentStatus, string> = {
  draft: "",
  pending_review: "border-yellow-400 text-yellow-700 bg-yellow-50",
  approved: "bg-blue-600",
  pending_signature: "border-orange-400 text-orange-700 bg-orange-50",
  signed: "bg-green-600",
  archived: "",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentInstanceTable({
  organizationId,
  sourceKey,
  sourceInstanceId,
  status,
  module,
  onView,
  onNewFromTemplate,
  showNewButton = false,
}: DocumentInstanceTableProps) {
  // Fetch by source or by org
  const bySourceEnabled = !!(sourceKey && sourceInstanceId);

  const { data: sourceData, isLoading: sourceLoading } = useQuery({
    ...convexQuery(api.documentInstances.listBySource, {
      organizationId,
      sourceKey: sourceKey ?? "",
      sourceInstanceId: sourceInstanceId ?? "",
    }),
    enabled: bySourceEnabled,
  });

  const { data: orgData, isLoading: orgLoading } = useQuery({
    ...convexQuery(api.documentInstances.list, {
      organizationId,
      status: (status as DocumentStatus) || undefined,
      module: module || undefined,
    }),
    enabled: !bySourceEnabled,
  });

  const isLoading = bySourceEnabled ? sourceLoading : orgLoading;
  const rawInstances: DocumentInstance[] =
    (bySourceEnabled ? sourceData : orgData) ?? [];

  // Fetch template names for all unique template IDs
  const templateIds = useMemo(
    () => [
      ...new Set(
        rawInstances
          .map((d) => d.templateId)
          .filter((id): id is NonNullable<typeof id> => !!id),
      ),
    ],
    [rawInstances],
  );

  const templateQueries = templateIds.map((id) =>
    useQuery(convexQuery(api.documentTemplates.getById, { id })),
  );

  const templateMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (let i = 0; i < templateIds.length; i++) {
      const tpl = templateQueries[i]?.data;
      if (tpl) map[templateIds[i]] = tpl.name;
    }
    return map;
  }, [templateIds, ...templateQueries.map((q) => q.data)]);

  // ----- Loading state -----
  if (isLoading) {
    return (
      <div className="space-y-3">
        {showNewButton && <Skeleton className="h-9 w-48" />}
        <div className="rounded-lg border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b p-4 last:border-b-0"
            >
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ----- Empty state -----
  if (rawInstances.length === 0) {
    return (
      <div className="space-y-3">
        {showNewButton && onNewFromTemplate && (
          <div className="flex justify-end">
            <Button size="sm" onClick={onNewFromTemplate}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              Nowy dokument z szablonu
            </Button>
          </div>
        )}
        <EmptyState
          icon={FileText}
          title="Brak dokumentów"
          description="Nie ma jeszcze żadnych dokumentów wygenerowanych z szablonów."
          action={
            !showNewButton && onNewFromTemplate ? (
              <Button size="sm" onClick={onNewFromTemplate}>
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                Nowy dokument z szablonu
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  // ----- Table -----
  return (
    <div className="space-y-3">
      {showNewButton && onNewFromTemplate && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onNewFromTemplate}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            Nowy dokument z szablonu
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Tytuł</TableHead>
              <TableHead>Szablon</TableHead>
              <TableHead>Moduł</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Utworzono</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rawInstances.map((instance) => (
              <TableRow
                key={instance._id}
                className={cn(onView && "cursor-pointer")}
                onClick={() => onView?.(instance._id)}
              >
                <TableCell className="font-medium">{instance.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {(instance.templateId
                    ? templateMap[instance.templateId]
                    : undefined) ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {instance.module}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={STATUS_VARIANT[instance.status]}
                    className={STATUS_CLASS[instance.status]}
                  >
                    {STATUS_LABEL[instance.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(instance.createdAt).toLocaleDateString("pl-PL")}
                </TableCell>
                <TableCell className="text-right">
                  {onView && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(instance._id);
                      }}
                    >
                      <Eye className="h-4 w-4" variant="stroke" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
