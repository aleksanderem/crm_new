export interface FilterCondition {
  field: string;
  operator:
    | "equals"
    | "notEquals"
    | "contains"
    | "notContains"
    | "greaterThan"
    | "lessThan"
    | "between"
    | "isEmpty"
    | "isNotEmpty"
    | "before"
    | "after"
    | "hasAnyOf"
    | "hasAllOf";
  value: any;
  valueEnd?: any;
}

export interface FilterConfig {
  conditions: FilterCondition[];
  logic: "and" | "or";
}

export type TimeRange =
  | "today"
  | "last7days"
  | "last30days"
  | "thisMonth"
  | "last3months"
  | "thisYear"
  | "all";

export interface QuickFilterDef {
  id: string;
  label: string;
  options: { label: string; value: string }[];
}

export interface FieldDef {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean" | "multiSelect";
  options?: { label: string; value: string }[];
}

export interface SavedView {
  id: string;
  name: string;
  isSystem: boolean;
  isDefault: boolean;
  filters?: FilterConfig;
  columns?: string[];
  sortField?: string;
  sortDirection?: "asc" | "desc";
  /** ID of the currently selected item shown in sidebar (e.g., document ID) */
  selectedId?: string;
}

export interface BulkAction {
  label: string;
  value: string;
  variant?: "default" | "destructive";
  icon?: React.ReactNode;
}
