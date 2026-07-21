import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download } from "@/lib/ez-icons";
import Papa from "papaparse";
import { formatActionError } from "@/lib/format-action-error";

type QueryEntityType = "contacts" | "companies" | "leads" | "patients";
type EntityType = QueryEntityType | "products";

const exportQueries = {
  contacts: api.csvExport.exportContacts,
  companies: api.csvExport.exportCompanies,
  leads: api.csvExport.exportLeads,
  patients: api.csvExport.exportPatients,
} as const;

export function useCsvExport(
  organizationId: Id<"organizations">,
  entityType: EntityType,
  fileNamePrefix?: string,
) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  // useQuery is always called (hook rules). When entityType=products the query
  // is never used (enabled:false + runProductsExport handles it instead).
  const queryType: QueryEntityType = entityType !== "products" ? entityType : "contacts";
  const { refetch } = useQuery({
    ...convexQuery(exportQueries[queryType], { organizationId }),
    enabled: false,
  });

  // Products data lives in Supabase; exportProducts is a Convex action that
  // reads from Supabase via createSupabaseDb() rather than ctx.db.
  const runProductsExport = useAction(api.csvExport.exportProducts);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      let rows: Record<string, unknown>[] | undefined;
      if (entityType === "products") {
        rows = (await runProductsExport({ organizationId })) as Record<string, unknown>[];
      } else {
        const result = await refetch();
        rows = result.data as Record<string, unknown>[] | undefined;
      }
      if (!rows || rows.length === 0) return;

      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const prefix = fileNamePrefix ?? `${entityType}_export`;
      link.download = `${prefix}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "csv.errors.exportFailed",
          defaultValue: "Nie udało się wyeksportować danych do CSV.",
        }),
      );
    } finally {
      setIsExporting(false);
    }
  }, [refetch, runProductsExport, entityType, organizationId, fileNamePrefix, t]);

  return { handleExport, isExporting };
}

interface CsvExportButtonProps {
  organizationId: Id<"organizations">;
  entityType: EntityType;
}

export function CsvExportButton({
  organizationId,
  entityType,
}: CsvExportButtonProps) {
  const { t } = useTranslation();
  const { handleExport, isExporting } = useCsvExport(
    organizationId,
    entityType,
  );

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
    >
      <Download className="mr-2 h-4 w-4" />
      {isExporting ? t("common.loading") : t("csv.export")}
    </Button>
  );
}
