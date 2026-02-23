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

interface CompanyFormProps {
  initialData?: {
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
    website?: string;
    phone?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
    notes?: string;
  };
  customFieldDefinitions?: FieldDefinition[];
  customFieldValues?: Record<string, unknown>;
  onSubmit: (
    data: {
      name: string;
      domain?: string;
      industry?: string;
      size?: string;
      website?: string;
      phone?: string;
      address?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
      };
      notes?: string;
    },
    customFields: Record<string, unknown>
  ) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  extraFields?: React.ReactNode;
}

export function CompanyForm({
  initialData,
  customFieldDefinitions = [],
  customFieldValues: initialCustomFieldValues = {},
  onSubmit,
  onCancel,
  isSubmitting = false,
  extraFields,
}: CompanyFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name ?? "");
  const [domain, setDomain] = useState(initialData?.domain ?? "");
  const [industry, setIndustry] = useState(initialData?.industry ?? "");
  const [size, setSize] = useState(initialData?.size ?? "");
  const [website, setWebsite] = useState(initialData?.website ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [street, setStreet] = useState(initialData?.address?.street ?? "");
  const [city, setCity] = useState(initialData?.address?.city ?? "");
  const [state, setState] = useState(initialData?.address?.state ?? "");
  const [zip, setZip] = useState(initialData?.address?.zip ?? "");
  const [country, setCountry] = useState(initialData?.address?.country ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    initialCustomFieldValues
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasAddress = street || city || state || zip || country;
    onSubmit(
      {
        name,
        domain: domain || undefined,
        industry: industry || undefined,
        size: size || undefined,
        website: website || undefined,
        phone: phone || undefined,
        address: hasAddress
          ? {
              street: street || undefined,
              city: city || undefined,
              state: state || undefined,
              zip: zip || undefined,
              country: country || undefined,
            }
          : undefined,
        notes: notes || undefined,
      },
      customFields
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t('companies.form.name')} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('companies.form.domain')}</Label>
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t('companies.form.domainPlaceholder')}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('companies.form.industry')}</Label>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('companies.form.size')}</Label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger>
              <SelectValue placeholder={t('companies.form.sizePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1-10">1-10</SelectItem>
              <SelectItem value="11-50">11-50</SelectItem>
              <SelectItem value="51-200">51-200</SelectItem>
              <SelectItem value="201-500">201-500</SelectItem>
              <SelectItem value="501-1000">501-1000</SelectItem>
              <SelectItem value="1000+">1000+</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('companies.form.website')}</Label>
          <Input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t('companies.form.phone')}</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">{t('companies.form.address')}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('companies.form.street')}</Label>
            <Input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('companies.form.city')}</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('companies.form.state')}</Label>
            <Input
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('companies.form.zip')}</Label>
            <Input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('companies.form.country')}</Label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t('companies.form.notes')}</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {extraFields && (
        <div className="space-y-4 border-t pt-4">
          {extraFields}
        </div>
      )}

      {customFieldDefinitions.length > 0 && (
        <div className="border-t pt-6">
          <CustomFieldFormSection
            definitions={customFieldDefinitions}
            values={customFields}
            onChange={(key, val) =>
              setCustomFields((prev) => ({ ...prev, [key]: val }))
            }
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!name.trim() || isSubmitting}>
          {isSubmitting
            ? t('common.saving')
            : initialData
              ? t('common.save')
              : t('companies.createCompany')}
        </Button>
      </div>
    </form>
  );
}
