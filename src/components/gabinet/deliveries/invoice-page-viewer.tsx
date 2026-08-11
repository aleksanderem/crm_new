import { useTranslation } from "react-i18next";
import { FileText } from "@/lib/ez-icons";

export function InvoicePageViewer({
  pages,
  t,
}: {
  pages: Array<{ url: string | null; mimeType: string; position: number }>;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <div className="space-y-2">
      {pages.map((page, idx) => {
        if (!page.url) return null;
        const isImage = page.mimeType.startsWith("image/");
        return (
          <a
            key={idx}
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block rounded-md border overflow-hidden hover:border-ring transition-colors"
            title={`${t("gabinet.deliveries.invoicePage", "Strona")} ${page.position + 1}`}
          >
            {isImage ? (
              <img
                src={page.url}
                alt={`${t("gabinet.deliveries.invoicePage", "Strona")} ${page.position + 1}`}
                className="w-full object-contain"
              />
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors">
                <FileText className="h-8 w-8 text-muted-foreground shrink-0" variant="stroke" />
                <div>
                  <p className="font-medium text-sm">
                    {t("gabinet.deliveries.invoicePdf", "Faktura PDF")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.deliveries.openInNewTab", "Kliknij, aby otworzyć")}
                  </p>
                </div>
              </div>
            )}
          </a>
        );
      })}
    </div>
  );
}
