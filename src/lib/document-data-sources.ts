/**
 * Shared TypeScript types for the Document Data Source system.
 * Used by frontend components (template editor, field config, etc.)
 */

export interface DataSourceFieldInfo {
  key: string;
  label: string;
  type: string;
}

export interface DataSourceInfo {
  key: string;
  label: string;
  module: string;
  fields: DataSourceFieldInfo[];
}

export interface FieldBinding {
  source: string;
  field: string;
}
