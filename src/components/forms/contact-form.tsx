import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import type { CustomFieldType } from "@cvx/schema";

interface FieldDefinition {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  group?: string;
}

interface ContactFormData {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

interface ContactFormProps {
  initialData?: ContactFormData;
  customFieldDefinitions?: FieldDefinition[];
  customFieldValues?: Record<string, unknown>;
  onSubmit: (
    data: ContactFormData,
    customFields: Record<string, unknown>
  ) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  showSourceAndTags?: boolean;
  extraFields?: React.ReactNode;
}

export function ContactForm({
  initialData,
  customFieldDefinitions = [],
  customFieldValues: initialCustomFieldValues = {},
  onSubmit,
  onCancel,
  isSubmitting = false,
  showSourceAndTags = false,
  extraFields,
}: ContactFormProps) {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(initialData?.firstName ?? "");
  const [lastName, setLastName] = useState(initialData?.lastName ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [source, setSource] = useState(initialData?.source ?? "");
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    initialCustomFieldValues
  );

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(
      {
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        title: title || undefined,
        source: source || undefined,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes || undefined,
      },
      customFields
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            {t('contacts.form.firstNameRequired')} <span className="text-destructive">*</span>
          </Label>
          <input
            className={inputClasses}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('contacts.form.lastName')}</Label>
          <input
            className={inputClasses}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('contacts.form.email')}</Label>
          <input
            type="email"
            className={inputClasses}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('contacts.form.phone')}</Label>
          <input
            type="tel"
            className={inputClasses}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t('contacts.form.titleRole')}</Label>
          <input
            className={inputClasses}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        {showSourceAndTags && (
          <>
            <div className="space-y-1.5">
              <Label>{t('contacts.form.source')}</Label>
              <input
                className={inputClasses}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={t('contacts.form.sourcePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('contacts.form.tags')}</Label>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                      {tag}
                      <button
                        type="button"
                        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                        onClick={() => handleRemoveTag(tag)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <input
                className={inputClasses}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder={t('contacts.form.tagsPlaceholder')}
              />
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t('contacts.form.notes')}</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      {extraFields && (
        <div className="space-y-4 border-t pt-4">
          {extraFields}
        </div>
      )}

      {customFieldDefinitions.length > 0 && (
        <>
          <div className="border-t pt-6">
            <CustomFieldFormSection
              definitions={customFieldDefinitions}
              values={customFields}
              onChange={(key, val) =>
                setCustomFields((prev) => ({ ...prev, [key]: val }))
              }
            />
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!firstName.trim() || isSubmitting}>
          {isSubmitting
            ? t('common.saving')
            : initialData
              ? t('common.save')
              : t('contacts.createContact')}
        </Button>
      </div>
    </form>
  );
}
