import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Upload } from "@/lib/ez-icons";
import Papa from "papaparse";

type EntityType = "contacts" | "companies" | "leads" | "products";

interface CsvImportDialogProps {
  organizationId: Id<"organizations">;
  entityType: EntityType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "map" | "preview" | "import" | "done";

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  contacts: ["firstName"],
  companies: ["name"],
  leads: ["title"],
  products: ["name", "sku", "unitPrice"],
};

const ALL_FIELDS: Record<EntityType, string[]> = {
  contacts: ["firstName", "lastName", "email", "phone", "title", "source", "tags", "notes"],
  companies: ["name", "domain", "industry", "size", "website", "phone", "street", "city", "state", "zip", "country", "notes"],
  leads: ["title", "value", "currency", "status", "priority", "source", "notes", "tags"],
  products: ["name", "sku", "unitPrice", "taxRate", "isActive", "description"],
};

const BATCH_SIZE = 100;

export function CsvImportDialog({
  organizationId,
  entityType,
  open,
  onOpenChange,
}: CsvImportDialogProps) {
  const { t } = useTranslation();

  const batchCreateContacts = useMutation(api.csvImport.batchCreateContacts);
  const batchCreateCompanies = useMutation(api.csvImport.batchCreateCompanies);
  const batchCreateLeads = useMutation(api.csvImport.batchCreateLeads);
  const batchCreateProducts = useMutation(api.csvImport.batchCreateProducts);

  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [results, setResults] = useState<{ created: number; errors: { row: number; error: string }[] }>({
    created: 0,
    errors: [],
  });

  const reset = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvData([]);
    setColumnMap({});
    setProgress(0);
    setTotalRows(0);
    setResults({ created: 0, errors: [] });
  };

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const headers = result.meta.fields ?? [];
          const data = result.data as Record<string, string>[];
          setCsvHeaders(headers);
          setCsvData(data);

          // Auto-map matching column names
          const autoMap: Record<string, string> = {};
          const crmFields = ALL_FIELDS[entityType];
          for (const header of headers) {
            const normalized = header.toLowerCase().replace(/[\s_-]/g, "");
            const match = crmFields.find(
              (f) => f.toLowerCase() === normalized
            );
            if (match) {
              autoMap[header] = match;
            }
          }
          setColumnMap(autoMap);
          setStep("map");
        },
      });
    },
    [entityType]
  );

  const handleMapChange = (csvHeader: string, crmField: string) => {
    setColumnMap((prev) => {
      const next = { ...prev };
      if (crmField === "") {
        delete next[csvHeader];
      } else {
        next[csvHeader] = crmField;
      }
      return next;
    });
  };

  const mapRow = (row: Record<string, string>) => {
    const mapped: Record<string, any> = {};
    for (const [csvHeader, crmField] of Object.entries(columnMap)) {
      const value = row[csvHeader]?.trim();
      if (!value) continue;

      if (crmField === "tags") {
        mapped[crmField] = value.split(";").map((t: string) => t.trim()).filter(Boolean);
      } else if (crmField === "value" || crmField === "unitPrice" || crmField === "taxRate") {
        const num = parseFloat(value);
        if (!isNaN(num)) mapped[crmField] = num;
      } else if (crmField === "isActive") {
        mapped[crmField] = value.toLowerCase() === "yes" || value.toLowerCase() === "true";
      } else {
        mapped[crmField] = value;
      }
    }
    return mapped;
  };

  const previewRows = csvData.slice(0, 5).map(mapRow);

  const handleImport = async () => {
    setStep("import");
    setTotalRows(csvData.length);

    const records = csvData.map(mapRow);
    let totalCreated = 0;
    const allErrors: { row: number; error: string }[] = [];

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      try {
        let result: { created: number; errors: { row: number; error: string }[] };

        switch (entityType) {
          case "contacts":
            result = await batchCreateContacts({
              organizationId,
              records: batch as any,
            });
            break;
          case "companies":
            result = await batchCreateCompanies({
              organizationId,
              records: batch as any,
            });
            break;
          case "leads":
            result = await batchCreateLeads({
              organizationId,
              records: batch as any,
            });
            break;
          case "products":
            result = await batchCreateProducts({
              organizationId,
              records: batch as any,
            });
            break;
        }

        totalCreated += result.created;
        allErrors.push(
          ...result.errors.map((e) => ({ ...e, row: e.row + i }))
        );
      } catch (e: any) {
        allErrors.push({ row: i, error: e.message ?? "Batch failed" });
      }
      setProgress(Math.min(i + BATCH_SIZE, records.length));
    }

    setResults({ created: totalCreated, errors: allErrors });
    setStep("done");
  };

  const crmFields = ALL_FIELDS[entityType];
  const requiredFields = REQUIRED_FIELDS[entityType];

  const missingRequired = requiredFields.filter(
    (f) => !Object.values(columnMap).includes(f)
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>
            {t("csv.import")} — {t(`${entityType}.title`)}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("csv.upload")}</p>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="text-sm"
              />
            </div>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">{t("csv.mapColumns")}</p>
            <div className="max-h-[350px] overflow-y-auto space-y-2">
              {csvHeaders.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <span className="w-1/3 truncate text-sm font-medium">
                    {header}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <Select
                    value={columnMap[header] ?? "skip"}
                    onValueChange={(val) => handleMapChange(header, val === "skip" ? "" : val)}
                  >
                    <SelectTrigger className="h-8 flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">— Skip —</SelectItem>
                      {crmFields.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                          {requiredFields.includes(f) ? " *" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && (
              <p className="text-xs text-destructive">
                Required: {missingRequired.join(", ")}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("upload")}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => setStep("preview")}
                disabled={missingRequired.length > 0}
              >
                {t("csv.preview")}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {t("csv.preview")} — {csvData.length} {t("common.records")}
            </p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {Object.values(columnMap).map((f) => (
                      <th key={f} className="px-3 py-2 text-left font-medium">
                        {f}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b">
                      {Object.values(columnMap).map((f) => (
                        <td key={f} className="px-3 py-1.5 max-w-[150px] truncate">
                          {Array.isArray(row[f])
                            ? (row[f] as string[]).join(", ")
                            : String(row[f] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("map")}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleImport}>{t("csv.import")}</Button>
            </DialogFooter>
          </div>
        )}

        {step === "import" && (
          <div className="space-y-4 py-8">
            <p className="text-center text-sm text-muted-foreground">
              {t("csv.importing")}... {progress}/{totalRows}
            </p>
            <div className="mx-auto h-2 w-2/3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${totalRows > 0 ? (progress / totalRows) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 py-4">
            <p className="text-sm font-medium">
              {t("csv.importComplete")}: {results.created} {t("common.records")}
            </p>
            {results.errors.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto rounded-md border p-3">
                <p className="mb-2 text-xs font-medium text-destructive">
                  {t("csv.errors")} ({results.errors.length})
                </p>
                {results.errors.slice(0, 20).map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    Row {e.row + 1}: {e.error}
                  </p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { reset(); onOpenChange(false); }}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
