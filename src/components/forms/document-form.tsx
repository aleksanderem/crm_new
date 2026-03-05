import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DOCUMENT_CATEGORIES = [
  "proposal",
  "contract",
  "invoice",
  "presentation",
  "report",
  "other",
] as const;

type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

const DOCUMENT_STATUSES = ["draft", "sent", "accepted", "lost"] as const;
type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface DocumentFormData {
  name: string;
  description?: string;
  category?: DocumentCategory;
  status?: DocumentStatus;
  amount?: number;
}

interface DocumentFormProps {
  initialData?: Partial<DocumentFormData>;
  onSubmit: (data: DocumentFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function DocumentForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: DocumentFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [category, setCategory] = useState<DocumentCategory | "">(
    initialData?.category ?? ""
  );
  const [status, setStatus] = useState<DocumentStatus>(
    initialData?.status ?? "draft"
  );
  const [amount, setAmount] = useState<string>(
    initialData?.amount?.toString() ?? ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      category: category || undefined,
      status,
      amount: amount ? parseFloat(amount) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t("documents.form.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("documents.form.namePlaceholder")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("documents.form.category")}</Label>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as DocumentCategory)}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("documents.form.categoryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`documents.categories.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("documents.form.status")}</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as DocumentStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`documents.statuses.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("documents.form.amount")}</Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("documents.form.description")}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("documents.form.descriptionPlaceholder")}
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
