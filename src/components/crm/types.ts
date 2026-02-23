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
    | "after";
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
  type: "text" | "number" | "date" | "select" | "boolean";
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
}

export interface BulkAction {
  label: string;
  value: string;
  variant?: "default" | "destructive";
  icon?: React.ReactNode;
}
