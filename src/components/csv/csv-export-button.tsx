import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Download } from "@/lib/ez-icons";
import Papa from "papaparse";
import { formatActionError } from "@/lib/format-action-error";

type EntityType = "contacts" | "companies" | "leads" | "patients" | "products";

export function useCsvExport(
  organizationId: Id<"organizations">,
  entityType: EntityType,
  fileNamePrefix?: string,
) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const runContactsExport = useAction(api.csvExport.exportContacts);
  const runCompaniesExport = useAction(api.csvExport.exportCompanies);
  const runLeadsExport = useAction(api.csvExport.exportLeads);
  const runPatientsExport = useAction(api.csvExport.exportPatients);
  const runProductsExport = useAction(api.csvExport.exportProducts);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const args = { organizationId };
      let rows: Record<string, unknown>[];
      if (entityType === "contacts") {
        rows = (await runContactsExport(args)) as Record<string, unknown>[];
      } else if (entityType === "companies") {
        rows = (await runCompaniesExport(args)) as Record<string, unknown>[];
      } else if (entityType === "leads") {
        rows = (await runLeadsExport(args)) as Record<string, unknown>[];
      } else if (entityType === "patients") {
        rows = (await runPatientsExport(args)) as Record<string, unknown>[];
      } else {
        rows = (await runProductsExport(args)) as Record<string, unknown>[];
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
  }, [
    runContactsExport,
    runCompaniesExport,
    runLeadsExport,
    runPatientsExport,
    runProductsExport,
    entityType,
    organizationId,
    fileNamePrefix,
    t,
  ]);

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
