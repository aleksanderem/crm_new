import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import {
  Plus,
  Puzzle,
  MoreHorizontal,
  Pencil,
  Trash2,
  CopyIcon,
  Lock,
  Building,
  User,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/document-components/",
)({
  component: DocumentComponentsListPage,
});

// ---------------------------------------------------------------------------
// Category & scope labels
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  header: "Nagłówek",
  footer: "Stopka",
  patient_data: "Dane pacjenta",
  treatment_data: "Dane zabiegu",
  signature: "Podpis",
  table: "Tabela",
  legal: "Prawne",
  custom: "Inne",
};

const SCOPE_META: Record<string, { label: string; icon: typeof Globe }> = {
  system: { label: "Systemowy", icon: Globe },
  org: { label: "Organizacyjny", icon: Building },
  user: { label: "Osobisty", icon: User },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DocumentComponentsListPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const listComponents = useAction(api.documents.components.list);
  const { data: components } = useQuery({
    queryKey: ["documents.components.list", organizationId],
    queryFn: () => listComponents({ organizationId }),
    enabled: !!organizationId,
  });

  const removeMutation = useAction(api.documents.components.remove);
  const duplicateMutation = useAction(api.documents.components.duplicate);

  const [deleteTarget, setDeleteTarget] = useState<Id<"documentComponents"> | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeMutation({ organizationId, componentId: deleteTarget });
      toast.success("Komponent usunięty");
    } catch (err: any) {
      toast.error(err.message ?? "Błąd");
    }
    setDeleteTarget(null);
  };

  const handleDuplicate = async (id: Id<"documentComponents">) => {
    try {
      await duplicateMutation({ organizationId, componentId: id });
      toast.success("Komponent skopiowany");
    } catch (err: any) {
      toast.error(err.message ?? "Błąd");
    }
  };

  // Group by scope
  const grouped = new Map<string, typeof components>();
  for (const comp of components ?? []) {
    const scope = (comp as any).scope as string;
    if (!grouped.has(scope)) grouped.set(scope, []);
    grouped.get(scope)!.push(comp);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {t("settings.documentComponents.title", "Biblioteka komponentów")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "settings.documentComponents.description",
              "Zarządzaj komponentami wielokrotnego użytku do szablonów dokumentów",
            )}
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/dashboard/settings/document-components/new">
            <Plus className="mr-1 h-4 w-4" />
            {t("settings.documentComponents.create", "Nowy komponent")}
          </Link>
        </Button>
      </div>

      {(!components || components.length === 0) && (
        <div className="rounded-lg border p-12 text-center">
          <Puzzle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">Brak komponentów</p>
        </div>
      )}

      {Array.from(grouped.entries()).map(([scope, comps]) => {
        const meta = SCOPE_META[scope] ?? { label: scope, icon: Puzzle };
        const ScopeIcon = meta.icon;
        return (
          <div key={scope}>
            <div className="mb-2 flex items-center gap-2">
              <ScopeIcon className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-medium text-muted-foreground">
                {meta.label}
              </h3>
              <Badge variant="outline" className="text-[10px]">
                {(comps as any[]).length}
              </Badge>
            </div>
            <div className="divide-y rounded-lg border">
              {(comps as any[]).map((comp: any) => (
                <div
                  key={comp._id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Puzzle className="h-4 w-4 shrink-0 text-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{comp.name}</span>
                      {comp.protected && (
                        <Lock className="h-3 w-3 text-amber-500" />
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {CATEGORY_LABELS[comp.category] ?? comp.category}
                      </Badge>
                    </div>
                    {comp.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {comp.description}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    v{comp.version}
                  </span>

                  {scope !== "system" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link
                            to="/dashboard/settings/document-components/$id"
                            params={{ id: comp._id }}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Edytuj
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(comp._id)}
                        >
                          <CopyIcon className="mr-2 h-3.5 w-3.5" />
                          Duplikuj
                        </DropdownMenuItem>
                        {!comp.protected && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(comp._id)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Usuń
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {scope === "system" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(comp._id)}
                        >
                          <CopyIcon className="mr-2 h-3.5 w-3.5" />
                          Duplikuj do organizacji
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuń komponent?</AlertDialogTitle>
            <AlertDialogDescription>
              Komponent zostanie dezaktywowany. Szablony które go używają zachowają
              ostatnią zapisaną wersję treści.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
