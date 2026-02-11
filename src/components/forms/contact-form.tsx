import { useState } from "react";
import { Button } from "@/components/ui/button";
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

interface ContactFormProps {
  initialData?: {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    title?: string;
    notes?: string;
  };
  customFieldDefinitions?: FieldDefinition[];
  customFieldValues?: Record<string, unknown>;
  onSubmit: (
    data: {
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      title?: string;
      notes?: string;
    },
    customFields: Record<string, unknown>
  ) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ContactForm({
  initialData,
  customFieldDefinitions = [],
  customFieldValues: initialCustomFieldValues = {},
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ContactFormProps) {
  const [firstName, setFirstName] = useState(initialData?.firstName ?? "");
  const [lastName, setLastName] = useState(initialData?.lastName ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    initialCustomFieldValues
  );

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(
      {
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        title: title || undefined,
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
            First Name <span className="text-destructive">*</span>
          </Label>
          <input
            className={inputClasses}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Last Name</Label>
          <input
            className={inputClasses}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <input
            type="email"
            className={inputClasses}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <input
            type="tel"
            className={inputClasses}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Title / Role</Label>
          <input
            className={inputClasses}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>

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
          Cancel
        </Button>
        <Button type="submit" disabled={!firstName.trim() || isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : initialData
              ? "Update Contact"
              : "Create Contact"}
        </Button>
      </div>
    </form>
  );
}
