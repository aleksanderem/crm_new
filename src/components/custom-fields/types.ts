import type { Doc } from "@cvx/_generated/dataModel";
import type { CustomFieldType } from "@cvx/schema";

// Re-use the Convex document type for field definitions
export type FieldDefinition = Doc<"customFieldDefinitions">;

// Lightweight interface for form components that don't need the full Doc type
export interface FieldDefinitionLike {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  group?: string;
}

export type BulkCustomFieldValues = Record<string, Record<string, unknown>>;
export type CustomFieldFormValues = Record<string, unknown>;
