import { ColumnDef } from "@tanstack/react-table";
import { EditableCell, EditableCellConfig } from "./editable-cell";

/**
 * Helper to create an editable column definition
 */
export function createEditableColumn<TData>(
  accessorKey: keyof TData,
  header: string,
  config: EditableCellConfig,
  options?: {
    onSave: (row: TData, value: any) => Promise<void> | void;
    displayFormatter?: (value: any, row: TData) => string;
    disabled?: (row: TData) => boolean;
    size?: number;
  }
): ColumnDef<TData, any> {
  return {
    accessorKey: accessorKey as string,
    header,
    size: options?.size,
    cell: ({ row }) => {
      const value = row.original[accessorKey as keyof TData];
      const disabled = options?.disabled?.(row.original) ?? false;

      return (
        <EditableCell
          value={value}
          onChange={async (newValue) => {
            if (options?.onSave) {
              await options.onSave(row.original, newValue);
            }
          }}
          config={config}
          disabled={disabled}
          displayFormatter={
            options?.displayFormatter
              ? (v) => options.displayFormatter!(v, row.original)
              : undefined
          }
        />
      );
    },
  };
}

/**
 * Batch create editable columns
 */
export function createEditableColumns<TData>(
  columns: Array<{
    accessorKey: keyof TData;
    header: string;
    config: EditableCellConfig;
    onSave?: (row: TData, value: any) => Promise<void> | void;
    displayFormatter?: (value: any, row: TData) => string;
    disabled?: (row: TData) => boolean;
    size?: number;
  }>,
  commonOnSave?: (row: TData, field: keyof TData, value: any) => Promise<void> | void
): ColumnDef<TData, any>[] {
  return columns.map((col) =>
    createEditableColumn(col.accessorKey, col.header, col.config, {
      onSave: col.onSave ?? (commonOnSave ? (row, value) => commonOnSave(row, col.accessorKey, value) : undefined),
      displayFormatter: col.displayFormatter,
      disabled: col.disabled,
      size: col.size,
    })
  );
}

/**
 * Common editable field presets
 */
export const editablePresets = {
  text: (required = false): EditableCellConfig => ({
    type: "text",
    required,
    placeholder: "Enter text...",
  }),

  number: (options?: { min?: number; max?: number; step?: number; required?: boolean }): EditableCellConfig => ({
    type: "number",
    min: options?.min,
    max: options?.max,
    step: options?.step,
    required: options?.required,
    placeholder: "Enter number...",
  }),

  email: (): EditableCellConfig => ({
    type: "text",
    required: false,
    placeholder: "email@example.com",
    validate: (value) => {
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return "Invalid email format";
      }
      return null;
    },
  }),

  phone: (): EditableCellConfig => ({
    type: "text",
    required: false,
    placeholder: "+48 123 456 789",
  }),

  select: (options: { label: string; value: string }[], required = false): EditableCellConfig => ({
    type: "select",
    options,
    required,
  }),

  boolean: (): EditableCellConfig => ({
    type: "boolean",
  }),

  date: (required = false): EditableCellConfig => ({
    type: "date",
    required,
  }),

  time: (required = false): EditableCellConfig => ({
    type: "time",
    required,
  }),

  datetime: (required = false): EditableCellConfig => ({
    type: "datetime",
    required,
  }),

  currency: (required = false): EditableCellConfig => ({
    type: "number",
    required,
    min: 0,
    step: 0.01,
    placeholder: "0.00",
    validate: (value) => {
      if (value !== "" && value !== null && isNaN(Number(value))) {
        return "Must be a valid number";
      }
      return null;
    },
  }),
};
