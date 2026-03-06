/**
 * Example: Using inline editing in CRM Contacts table
 *
 * This demonstrates how to convert a read-only table to support inline editing
 */

import { ColumnDef } from "@tanstack/react-table";
import { createEditableColumn, editablePresets } from "@/components/data-table/editable-columns";
import type { Contact } from "@/types/crm";

export function getContactColumnsWithInlineEdit(
  onUpdate: (contactId: string, field: keyof Contact, value: any) => Promise<void>
): ColumnDef<Contact, any>[] {
  return [
    // Non-editable ID column
    {
      accessorKey: "id",
      header: "ID",
      size: 80,
    },

    // Editable name columns
    createEditableColumn("firstName", "First Name", editablePresets.text(true), {
      onSave: async (contact, value) => {
        await onUpdate(contact._id, "firstName", value);
      },
    }),

    createEditableColumn("lastName", "Last Name", editablePresets.text(true), {
      onSave: async (contact, value) => {
        await onUpdate(contact._id, "lastName", value);
      },
    }),

    // Editable email with validation
    createEditableColumn("email", "Email", editablePresets.email(), {
      onSave: async (contact, value) => {
        await onUpdate(contact._id, "email", value);
      },
    }),

    // Editable phone
    createEditableColumn("phone", "Phone", editablePresets.phone(), {
      onSave: async (contact, value) => {
        await onUpdate(contact._id, "phone", value);
      },
    }),

    // Editable select field
    createEditableColumn("status", "Status", editablePresets.select([
      { label: "Active", value: "active" },
      { label: "Inactive", value: "inactive" },
      { label: "Pending", value: "pending" },
    ], true), {
      onSave: async (contact, value) => {
        await onUpdate(contact._id, "status", value);
      },
      displayFormatter: (value) => {
        const statusMap: Record<string, string> = {
          active: "✓ Active",
          inactive: "✗ Inactive",
          pending: "⏳ Pending",
        };
        return statusMap[value] || value;
      },
    }),

    // Editable date field
    createEditableColumn("createdAt", "Created", editablePresets.date(), {
      onSave: async (contact, value) => {
        await onUpdate(contact._id, "createdAt", value);
      },
      disabled: () => true, // Example: make read-only
    }),
  ];
}

/**
 * Example: Using inline editing in Gabinet Patients table
 */

import type { Patient } from "@/types/gabinet";

export function getPatientColumnsWithInlineEdit(
  onUpdate: (patientId: string, field: keyof Patient, value: any) => Promise<void>
): ColumnDef<Patient, any>[] {
  return [
    createEditableColumn("firstName", "Imię", editablePresets.text(true), {
      onSave: async (patient, value) => {
        await onUpdate(patient._id, "firstName", value);
      },
    }),

    createEditableColumn("lastName", "Nazwisko", editablePresets.text(true), {
      onSave: async (patient, value) => {
        await onUpdate(patient._id, "lastName", value);
      },
    }),

    createEditableColumn("email", "Email", editablePresets.email(), {
      onSave: async (patient, value) => {
        await onUpdate(patient._id, "email", value);
      },
    }),

    createEditableColumn("phone", "Telefon", editablePresets.phone(), {
      onSave: async (patient, value) => {
        await onUpdate(patient._id, "phone", value);
      },
    }),

    createEditableColumn("pesel", "PESEL", {
      type: "text",
      required: false,
      placeholder: "00000000000",
      validate: (value) => {
        if (value && !/^\d{11}$/.test(value)) {
          return "PESEL must be 11 digits";
        }
        return null;
      },
    }, {
      onSave: async (patient, value) => {
        await onUpdate(patient._id, "pesel", value);
      },
    }),

    createEditableColumn("dateOfBirth", "Data urodzenia", editablePresets.date(), {
      onSave: async (patient, value) => {
        await onUpdate(patient._id, "dateOfBirth", value);
      },
    }),

    // Boolean toggle
    createEditableColumn("isActive", "Aktywny", editablePresets.boolean(), {
      onSave: async (patient, value) => {
        await onUpdate(patient._id, "isActive", value);
      },
      displayFormatter: (value) => value ? "✓" : "✗",
    }),
  ];
}

/**
 * Usage example in a page component:
 *
 * ```tsx
 * import { CrmDataTable } from "@/components/crm/enhanced-data-table";
 * import { getContactColumnsWithInlineEdit } from "@/components/data-table/editable-examples";
 * import { useMutation } from "convex/react";
 * import { api } from "@cvx/_generated/api";
 *
 * function ContactsPage() {
 *   const updateContact = useMutation(api.contacts.update);
 *
 *   const handleInlineUpdate = async (contactId: string, field: keyof Contact, value: any) => {
 *     await updateContact({ id: contactId, [field]: value });
 *   };
 *
 *   const columns = getContactColumnsWithInlineEdit(handleInlineUpdate);
 *
 *   return (
 *     <CrmDataTable
 *       columns={columns}
 *       data={contacts}
 *       // ... other props
 *     />
 *   );
 * }
 * ```
 */
