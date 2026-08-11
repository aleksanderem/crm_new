import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText } from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { EmptyState } from "@/components/layout/empty-state";

type Receipt = {
  _id: string;
  receiptNumber: string;
  issuedAt: number;
  totalGross?: number | null;
  paymentMethod: string;
  receiptType: string;
  status: string;
  pdfUrl?: string | null;
};

export function AppointmentReceiptsTab({
  appointmentReceipts,
  language,
  t,
}: {
  appointmentReceipts: Receipt[];
  language: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" variant="stroke" />
            {t("gabinet.receipts.receiptHistory", "Paragony")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t(
              "gabinet.receipts.receiptHistoryDesc",
              "Wszystkie paragony powiązane z tą wizytą",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 py-4">
          {appointmentReceipts.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t("gabinet.receipts.noReceipts", "Brak paragonów")}
              description={t(
                "gabinet.receipts.noReceiptsDesc",
                "Paragony pojawią się tutaj po dokonaniu płatności.",
              )}
            />
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-medium">
                      {t("gabinet.receipts.receiptNumber", "Nr paragonu")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("gabinet.receipts.issuedAt", "Data wystawienia")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("gabinet.receipts.totalGross", "Kwota brutto")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("gabinet.payments.method", "Metoda")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("common.type", "Typ")}
                    </th>
                    <th className="text-left p-3 text-sm font-medium">
                      {t("common.status", "Status")}
                    </th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {appointmentReceipts.map((receipt) => (
                    <tr
                      key={receipt._id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="p-3 font-mono text-sm font-medium">
                        {receipt.receiptNumber}
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(receipt.issuedAt).toLocaleDateString(
                          language,
                        )}
                      </td>
                      <td className="p-3 font-medium">
                        {receipt.totalGross != null
                          ? formatCurrencyPLN(receipt.totalGross)
                          : "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {t(
                            `gabinet.payments.methods.${receipt.paymentMethod.split("+")[0]}`,
                            receipt.paymentMethod,
                          )}
                          {receipt.paymentMethod.includes("+") && (
                            <span className="ml-1 text-muted-foreground">+</span>
                          )}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={
                            receipt.receiptType === "correction"
                              ? "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-400"
                              : ""
                          }
                        >
                          {receipt.receiptType === "correction"
                            ? t(
                                "gabinet.receipts.types.correction",
                                "Korekta",
                              )
                            : t(
                                "gabinet.receipts.types.original",
                                "Oryginalny",
                              )}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge
                          variant={
                            receipt.status === "void"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {receipt.status === "void"
                            ? t(
                                "gabinet.receipts.statuses.void",
                                "Anulowany",
                              )
                            : t(
                                "gabinet.receipts.statuses.issued",
                                "Wystawiony",
                              )}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {receipt.pdfUrl && (
                          <a
                            href={receipt.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="outline">
                              {t(
                                "gabinet.receipts.download",
                                "Pobierz paragon",
                              )}
                            </Button>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
