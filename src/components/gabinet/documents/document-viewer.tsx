import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";

interface DocumentViewerProps {
  title: string;
  type: string;
  status: string;
  content: string;
  signatureData?: string;
  signedAt?: number;
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  pending_signature: "outline",
  signed: "default",
  archived: "secondary",
};

export function DocumentViewer({ title, type, status, content, signatureData, signedAt }: DocumentViewerProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">{title}</h3>
          <span className="text-sm text-muted-foreground capitalize">{type.replace("_", " ")}</span>
        </div>
        <Badge variant={STATUS_COLORS[status] ?? "secondary"}>{status.replace("_", " ")}</Badge>
      </div>

      <div className="rounded-lg border bg-white p-6 text-sm leading-relaxed whitespace-pre-wrap">
        {content}
      </div>

      {signatureData && (
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground mb-2">{t("gabinet.documents.signature")}</p>
          <img src={signatureData} alt="Signature" className="h-20 object-contain" />
          {signedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("gabinet.documents.signedOn")} {new Date(signedAt).toLocaleString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
