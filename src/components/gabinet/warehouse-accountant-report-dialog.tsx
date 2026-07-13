import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MappedProduct } from "@/lib/supabase/mappers/products";

function formatPricePLN(value: number): string {
  return value.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " zł";
}

interface ReportBodyProps {
  organizationName: string | undefined;
  locationName: string | null | undefined;
  stockDateFormatted: string;
  generatedAt: string;
  products: MappedProduct[];
  historicalStock: Map<string, number>;
}

function ReportBody({
  organizationName,
  locationName,
  stockDateFormatted,
  generatedAt,
  products,
  historicalStock,
}: ReportBodyProps) {
  const { t } = useTranslation();
  const noPrice = t("inventory.accountantReport.noPrice", {
    defaultValue: "brak danych",
  });

  return (
    <div className="space-y-5 p-6 text-sm text-foreground print:text-black">
      <div className="text-center">
        <h1 className="text-xl font-bold">
          {t("inventory.accountantReport.heading", {
            defaultValue: "Raport stanów magazynowych",
          })}
        </h1>
        {organizationName && (
          <p className="mt-1 text-base font-semibold">{organizationName}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
        <div>
          <span className="font-medium">
            {t("inventory.accountantReport.location", {
              defaultValue: "Lokalizacja",
            })}
            :
          </span>{" "}
          {locationName ??
            t("inventory.count.locationNone", {
              defaultValue: "Bez lokalizacji",
            })}
        </div>
        <div>
          <span className="font-medium">
            {t("inventory.accountantReport.stockDate", {
              defaultValue: "Stan na dzień",
            })}
            :
          </span>{" "}
          {stockDateFormatted}
        </div>
        <div>
          <span className="font-medium">
            {t("inventory.accountantReport.generatedAt", {
              defaultValue: "Data wygenerowania",
            })}
            :
          </span>{" "}
          {generatedAt}
        </div>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-border bg-muted/40 print:bg-transparent print:border-black">
            <th className="px-2 py-2 text-left font-semibold">
              {t("inventory.accountantReport.colNo", { defaultValue: "Lp." })}
            </th>
            <th className="px-2 py-2 text-left font-semibold">
              {t("common.name")}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("inventory.count.unit", { defaultValue: "Jedn." })}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("inventory.history.stockOnDate", { defaultValue: "Stan" })}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("inventory.accountantReport.purchasePrice", {
                defaultValue: "Cena zakupu",
              })}
            </th>
            <th className="px-2 py-2 text-right font-semibold">
              {t("inventory.accountantReport.value", {
                defaultValue: "Wartość",
              })}
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product, idx) => {
            const qty = historicalStock.get(product._id) ?? 0;
            const unit = product.stockUnit?.trim() || "—";
            const hasPrice = product.purchasePrice != null;
            const value = hasPrice ? qty * product.purchasePrice! : null;
            return (
              <tr
                key={product._id}
                className="border-b border-border print:border-gray-300"
              >
                <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
                  {idx + 1}
                </td>
                <td className="px-2 py-1.5 font-medium">{product.name}</td>
                <td className="px-2 py-1.5 text-right">{unit}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{qty}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {hasPrice
                    ? formatPricePLN(product.purchasePrice!)
                    : <span className="text-muted-foreground">{noPrice}</span>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {value != null
                    ? formatPricePLN(value)
                    : <span className="text-muted-foreground">{noPrice}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="border-t border-border pt-3 text-xs print:border-black">
        <div>
          <span className="font-semibold">
            {t("inventory.accountantReport.itemCount", {
              defaultValue: "Liczba pozycji",
            })}
            :
          </span>{" "}
          {products.length}
        </div>
        <div className="mt-1">
          <span className="font-semibold">
            {t("inventory.accountantReport.totalValue", {
              defaultValue: "Łączna wartość",
            })}
            :
          </span>{" "}
          {(() => {
            const total = products.reduce((sum, p) => {
              if (p.purchasePrice == null) return sum;
              const qty = historicalStock.get(p._id) ?? 0;
              return sum + qty * p.purchasePrice;
            }, 0);
            const hasAnyPrice = products.some((p) => p.purchasePrice != null);
            return hasAnyPrice
              ? <span className="font-semibold">{formatPricePLN(total)}</span>
              : <span className="text-muted-foreground">{t("inventory.accountantReport.notAvailable", { defaultValue: "niedostępna (brak cen zakupu)" })}</span>;
          })()}
        </div>
      </div>
    </div>
  );
}

function formatDatePL(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

function formatNowPL(): string {
  return new Date().toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface WarehouseAccountantReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationName: string | undefined;
  selectedDate: string;
  products: MappedProduct[];
  historicalStock: Map<string, number>;
  locationName?: string | null;
}

export function WarehouseAccountantReportDialog({
  open,
  onOpenChange,
  organizationName,
  selectedDate,
  products,
  historicalStock,
  locationName,
}: WarehouseAccountantReportDialogProps) {
  const { t } = useTranslation();
  const stockDateFormatted = formatDatePL(selectedDate);
  const generatedAt = formatNowPL();

  const bodyProps: ReportBodyProps = {
    organizationName,
    locationName,
    stockDateFormatted,
    generatedAt,
    products,
    historicalStock,
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Print-only version — hidden on screen, shown by @media print in index.css */}
      {open && (
        <div className="print-accountant-report">
          <ReportBody {...bodyProps} />
        </div>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle>
              {t("inventory.accountantReport.title", {
                defaultValue: "Raport dla księgowej",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("inventory.accountantReport.description", {
                defaultValue:
                  'Podgląd raportu przygotowanego do wydruku na A4. Kliknij "Drukuj", aby wydrukować lub zapisać jako PDF.',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-background">
            <ReportBody {...bodyProps} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.close", { defaultValue: "Zamknij" })}
            </Button>
            <Button onClick={handlePrint}>
              {t("inventory.accountantReport.print", {
                defaultValue: "Drukuj",
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
