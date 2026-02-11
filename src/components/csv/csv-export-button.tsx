import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Papa from "papaparse";

type EntityType = "contacts" | "companies" | "leads" | "products";

const exportQueries = {
  contacts: api.csvExport.exportContacts,
  companies: api.csvExport.exportCompanies,
  leads: api.csvExport.exportLeads,
  products: api.csvExport.exportProducts,
} as const;

interface CsvExportButtonProps {
  organizationId: Id<"organizations">;
  entityType: EntityType;
}

export function CsvExportButton({
  organizationId,
  entityType,
}: CsvExportButtonProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);

  const { data, refetch } = useQuery({
    ...convexQuery(exportQueries[entityType], { organizationId }),
    enabled: false, // Only fetch on demand
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await refetch();
      const rows = result.data;
      if (!rows || rows.length === 0) return;

      const csv = Papa.unparse(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${entityType}_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

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
