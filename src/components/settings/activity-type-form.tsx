import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { IconPicker } from "@/components/ui/icon-picker";
import { cn } from "@/lib/utils";

interface ActivityTypeFormData {
  name: string;
  key: string;
  icon: string;
  color: string;
}

interface ActivityTypeFormProps {
  initialData?: Partial<ActivityTypeFormData>;
  onSubmit: (data: ActivityTypeFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

function generateKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ą/g, "a")
    .replace(/ć/g, "c")
    .replace(/ę/g, "e")
    .replace(/ł/g, "l")
    .replace(/ń/g, "n")
    .replace(/ó/g, "o")
    .replace(/ś/g, "s")
    .replace(/ź/g, "z")
    .replace(/ż/g, "z")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ActivityTypeForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ActivityTypeFormProps) {
  const { t } = useTranslation();

  const colorOptions = useMemo(() => [
    { name: t('activityTypeForm.colors.blue'), value: "#3b82f6" },
    { name: t('activityTypeForm.colors.green'), value: "#22c55e" },
    { name: t('activityTypeForm.colors.red'), value: "#ef4444" },
    { name: t('activityTypeForm.colors.yellow'), value: "#eab308" },
    { name: t('activityTypeForm.colors.purple'), value: "#a855f7" },
    { name: t('activityTypeForm.colors.pink'), value: "#ec4899" },
    { name: t('activityTypeForm.colors.orange'), value: "#f97316" },
    { name: t('activityTypeForm.colors.gray'), value: "#6b7280" },
  ], [t]);

  const [name, setName] = useState(initialData?.name ?? "");
  const [icon, setIcon] = useState(initialData?.icon ?? "phone");
  const [color, setColor] = useState(initialData?.color ?? colorOptions[0].value);

  const key = useMemo(() => initialData?.key ?? generateKey(name), [name, initialData?.key]);

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, key, icon, color });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1.5">
        <Label>
          {t('activityTypeForm.name')} <span className="text-destructive">*</span>
        </Label>
        <input
          className={inputClasses}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('activityTypeForm.namePlaceholder')}
          required
        />
        {name && (
          <p className="text-xs text-muted-foreground">
            {t('activityTypeForm.key')}: <code className="rounded bg-muted px-1">{key}</code>
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>{t('activityTypeForm.icon')}</Label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="space-y-1.5">
        <Label>{t('activityTypeForm.color')}</Label>
        <div className="flex gap-2">
          {colorOptions.map((c) => (
            <button
              key={c.value}
              type="button"
              title={c.name}
              className={cn(
                "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                color === c.value ? "border-foreground scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: c.value }}
              onClick={() => setColor(c.value)}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('activityTypeForm.cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim() || isSubmitting}>
          {isSubmitting ? t('activityTypeForm.saving') : initialData ? t('activityTypeForm.save') : t('activityTypeForm.create')}
        </Button>
      </div>
    </form>
  );
}
