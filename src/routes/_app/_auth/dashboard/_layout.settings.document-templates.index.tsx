import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileText,
  MoreHorizontal,
  Pencil,
  Archive,
  CopyIcon,
} from "@/lib/ez-icons";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/document-templates/",
)({
  component: DocumentTemplatesListPage,
});


type Category =
  | "contract"
  | "invoice"
  | "consent"
  | "referral"
  | "prescription"
  | "report"
  | "protocol"
  | "custom";

type Status = "draft" | "active" | "archived";

const CATEGORY_LABELS: Record<Category, string> = {
  contract: "Umowa",
  invoice: "Faktura",
  consent: "Zgoda",
  referral: "Skierowanie",
  prescription: "Recepta",
  report: "Raport",
  protocol: "Protokol",
  custom: "Inny",
};

const STATUS_LABELS: Record<Status, string> = {
  draft: "Szkic",
  active: "Aktywny",
  archived: "Archiwalny",
};

const MODULE_LABELS: Record<string, string> = {
  platform: "Platforma",
  gabinet: "Gabinet",
  crm: "CRM",
};

function DocumentTemplatesListPage() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: templates } = useQuery(
    convexQuery(api.documentTemplates.list, {
      organizationId,
      status:
        statusFilter !== "all"
          ? (statusFilter as Status)
          : undefined,
      category:
        categoryFilter !== "all"
          ? (categoryFilter as Category)
          : undefined,
    }),
  );

  const duplicateTemplate = useMutation(api.documentTemplates.duplicate);
  const archiveTemplate = useMutation(api.documentTemplates.archive);
  const publishTemplate = useMutation(api.documentTemplates.publish);

  const filtered = (templates ?? []).filter((t) => {
    if (!search) return true;
    return t.name.toLowerCase().includes(search.toLowerCase());
  });

  const handleDuplicate = async (id: Id<"documentTemplates">) => {
    try {
      await duplicateTemplate({ id });
      toast.success("Szablon zostal zduplikowany");
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas duplikowania");
    }
  };

  const handleArchive = async (id: Id<"documentTemplates">) => {
    try {
      await archiveTemplate({ id });
      toast.success("Szablon zostal zarchiwizowany");
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas archiwizacji");
    }
  };

  const handlePublish = async (id: Id<"documentTemplates">) => {
    try {
      await publishTemplate({ id });
      toast.success("Szablon zostal opublikowany");
    } catch (e: any) {
      toast.error(e.message ?? "Blad podczas publikacji");
    }
  };

  function statusBadgeVariant(status: Status) {
    switch (status) {
      case "draft":
        return "outline" as const;
      case "active":
        return "default" as const;
      case "archived":
        return "secondary" as const;
    }
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title="Szablony dokumentow"
        description="Zarzadzaj szablonami dokumentow dla organizacji"
        actions={
          <Button asChild>
            <Link to="/dashboard/settings/document-templates/new">
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              Nowy szablon
            </Link>
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Szukaj po nazwie..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-64"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie statusy</SelectItem>
            <SelectItem value="draft">Szkic</SelectItem>
            <SelectItem value="active">Aktywny</SelectItem>
            <SelectItem value="archived">Archiwalny</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Kategoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie kategorie</SelectItem>
            {(Object.entries(CATEGORY_LABELS) as [Category, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Brak szablonow"
          description="Nie znaleziono szablonow dokumentow. Utworz nowy szablon, aby rozpoczac."
          action={
            <Button asChild>
              <Link to="/dashboard/settings/document-templates/new">
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                Nowy szablon
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Kategoria</TableHead>
                <TableHead>Modul</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pola</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tpl) => (
                <TableRow
                  key={tpl._id}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate({
                      to: "/dashboard/settings/document-templates/$id",
                      params: { id: tpl._id },
                    })
                  }
                >
                  <TableCell className="font-medium">{tpl.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {CATEGORY_LABELS[tpl.category as Category] ??
                        tpl.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {MODULE_LABELS[tpl.module] ?? tpl.module}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(tpl.status as Status)}>
                      {STATUS_LABELS[tpl.status as Status] ?? tpl.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {tpl.fieldCount}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate({
                              to: "/dashboard/settings/document-templates/$id",
                              params: { id: tpl._id },
                            });
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edytuj
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicate(
                              tpl._id as Id<"documentTemplates">,
                            );
                          }}
                        >
                          <CopyIcon className="mr-2 h-4 w-4" />
                          Duplikuj
                        </DropdownMenuItem>
                        {tpl.status === "draft" && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePublish(
                                tpl._id as Id<"documentTemplates">,
                              );
                            }}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Opublikuj
                          </DropdownMenuItem>
                        )}
                        {tpl.status !== "archived" && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchive(
                                tpl._id as Id<"documentTemplates">,
                              );
                            }}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archiwizuj
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
