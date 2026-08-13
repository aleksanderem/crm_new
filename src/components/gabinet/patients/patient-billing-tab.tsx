import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText } from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";

type Receipt = {
  _id: string;
  receiptNumber: string;
  receiptType?: string | null;
  issuedAt: number;
  totalGross?: number | null;
  pdfUrl?: string | null;
  paymentId: string;
};

export function PatientBillingTab({
  patientReceipts,
  canGenerateReceipt,
  generatingReceiptFor,
  handleDownloadReceipt,
  t,
}: {
  patientReceipts: Receipt[] | undefined;
  canGenerateReceipt: boolean;
  generatingReceiptFor: string | null;
  handleDownloadReceipt: (receiptId: string) => Promise<void>;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <div className="space-y-4">
      {!patientReceipts || patientReceipts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.patients.billing.noReceipts")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 text-sm font-medium">
                  {t("gabinet.patients.billing.receiptNumber")}
                </th>
                <th className="text-left p-3 text-sm font-medium">
                  {t("gabinet.patients.billing.type")}
                </th>
                <th className="text-left p-3 text-sm font-medium">
                  {t("gabinet.patients.billing.issuedAt")}
                </th>
                <th className="text-right p-3 text-sm font-medium">
                  {t("gabinet.patients.billing.totalGross")}
                </th>
                <th className="text-right p-3 text-sm font-medium">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {patientReceipts.map((receipt) => (
                <tr
                  key={receipt._id}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="p-3 text-sm font-mono">{receipt.receiptNumber}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px]">
                      {t(
                        `gabinet.patients.billing.receiptTypes.${receipt.receiptType ?? "original"}`,
                      )}
                    </Badge>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(receipt.issuedAt).toLocaleDateString("pl-PL")}
                  </td>
                  <td className="p-3 text-right font-medium tabular-nums">
                    {receipt.totalGross != null
                      ? formatCurrencyPLN(receipt.totalGross)
                      : "—"}
                  </td>
                  <td className="p-3 text-right">
                    {canGenerateReceipt && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={generatingReceiptFor === receipt._id}
                        onClick={() => handleDownloadReceipt(receipt._id)}
                      >
                        {generatingReceiptFor === receipt._id
                          ? t("gabinet.patients.billing.generating")
                          : t("gabinet.patients.billing.download")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
