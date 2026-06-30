import { useTranslation } from "react-i18next";
import { ShieldAlert } from "@/lib/ez-icons";

export function GabinetNoAccess() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <ShieldAlert className="h-6 w-6 text-muted-foreground" variant="stroke" />
      </div>
      <p className="mt-4 text-lg font-semibold">{t("permissions.noAccess")}</p>
    </div>
  );
}
