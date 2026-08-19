import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Pencil } from "@/lib/ez-icons";
import type { TFunction } from "i18next";

export function SectionHeader({
  title,
  sectionKey,
  icon,
  editing,
  saving,
  canEdit = true,
  onStartEdit,
  onCancelEdit,
  onSaveSection,
  t,
}: {
  title: string;
  sectionKey: string;
  icon: ReactNode;
  editing: string | null;
  saving: boolean;
  canEdit?: boolean;
  onStartEdit: (s: string) => void;
  onCancelEdit: () => void;
  onSaveSection: (s: string) => Promise<void>;
  t: TFunction;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h4 className="text-base font-semibold">{title}</h4>
      </div>
      {editing !== sectionKey ? (
        canEdit && (
          <Button variant="ghost" size="sm" onClick={() => onStartEdit(sectionKey)}>
            <Pencil className="h-3.5 w-3.5 mr-1" variant="stroke" />
            {t("common.edit")}
          </Button>
        )
      ) : (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            {t("common.cancel")}
          </Button>
          <Button size="sm" onClick={() => onSaveSection(sectionKey)} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | undefined | null;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value || "—"}</p>
      </div>
    </div>
  );
}
