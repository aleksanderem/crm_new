import React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { EditableCell, type EditableCellConfig, type EditableCellType } from "./editable-cell";

export type OnSaveFn<T> = (row: T, value: any) => Promise<void> | void;

export interface CreateEditableColumnOptions<T> {
  onSave?: OnSaveFn<T>;
  disabled?: boolean | ((row: T) => boolean);
  displayFormatter?: (value: any) => string;
  className?: string;
}

export function createEditableColumn<T extends Record<string, any>>(
  accessorKey: string,
  header: string | React.ReactNode,
  config: EditableCellConfig,
  options: CreateEditableColumnOptions<T> = {}
): ColumnDef<T, any> {
  return {
    accessorKey,
    header,
    cell: ({ row }) => {
      const value = row.getValue(accessorKey as any);

      const disabled = typeof options.disabled === "function" ? options.disabled(row.original) : !!options.disabled;

      const handleChange = async (newValue: any) => {
        if (options.onSave) {
          await options.onSave(row.original, newValue);
        }
      };

      return (
        <EditableCell
          value={value}
          onChange={handleChange}
          config={config}
          className={options.className}
          disabled={disabled}
          displayFormatter={options.displayFormatter}
        />
      );
    },
  } as ColumnDef<T, any>;
}

// Presets for common field types
export const editablePresets = {
  text: (required = false, placeholder?: string): EditableCellConfig => ({
    type: "text" as EditableCellType,
    required,
    placeholder,
  }),

  email: (required = false): EditableCellConfig => ({
    type: "text" as EditableCellType,
    required,
    validate: (v: any) => {
      if (!v && required) return "Required";
      if (v && !/^\S+@\S+\.\S+$/.test(v)) return "Invalid email";
      return null;
    },
    placeholder: "name@example.com",
  }),

  phone: (required = false): EditableCellConfig => ({
    type: "text" as EditableCellType,
    required,
    validate: (v: any) => {
      if (!v && required) return "Required";
      if (v && !/^\+?[0-9 \-()]{6,}$/.test(v)) return "Invalid phone";
      return null;
    },
    placeholder: "+48 123 456 789",
  }),

  number: (required = false, min?: number, max?: number, step?: number): EditableCellConfig => ({
    type: "number" as EditableCellType,
    required,
    min,
    max,
    step,
  }),

  select: (options: { label: string; value: string }[], required = false): EditableCellConfig => ({
    type: "select" as EditableCellType,
    options,
    required,
  }),

  date: (required = false): EditableCellConfig => ({
    type: "date" as EditableCellType,
    required,
  }),

  time: (required = false): EditableCellConfig => ({
    type: "time" as EditableCellType,
    required,
  }),

  datetime: (required = false): EditableCellConfig => ({
    type: "datetime" as EditableCellType,
    required,
  }),

  boolean: (): EditableCellConfig => ({
    type: "boolean" as EditableCellType,
  }),
};

export default createEditableColumn;
