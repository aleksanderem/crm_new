import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CrmDataTable,
  type CrmColumn,
  type CrmDataTableProps,
} from "@/components/crm/enhanced-data-table";
import { Folder, FolderOpen, ChevronDown, ChevronRight } from "@/lib/ez-icons";

interface DocumentsGroupedViewProps<TData>
  extends Omit<CrmDataTableProps<TData>, "data" | "columns"> {
  columns: CrmColumn<TData>[];
  documents: TData[];
  /**
   * Returns the folder path for a document (e.g. "Gabinet/Zgody") or
   * `undefined` if the document is not in any folder.
   */
  getFolderPath: (doc: TData) => string | undefined;
}

interface FolderGroup<TData> {
  /** Full folder path or `undefined` for ungrouped. */
  folderPath: string | undefined;
  /** Display label — last segment of the path, or "Bez katalogu". */
  label: string;
  docs: TData[];
}

/**
 * Wraps {@link CrmDataTable} with folder-based grouping. Documents inherit
 * their group from their template's `folderPath`. When no folders are in use
 * the view collapses to a flat table for parity with the original layout.
 */
export function DocumentsGroupedView<TData>({
  documents,
  getFolderPath,
  columns,
  ...tableProps
}: DocumentsGroupedViewProps<TData>) {
  const { t } = useTranslation();

  const noFolderLabel = t("settings.formTemplates.noFolder", "Bez katalogu");

  const groups = useMemo<FolderGroup<TData>[]>(() => {
    const map = new Map<string, FolderGroup<TData>>();
    for (const doc of documents) {
      const path = getFolderPath(doc);
      const key = path ?? "__none__";
      let group = map.get(key);
      if (!group) {
        group = {
          folderPath: path,
          label: path ? (path.split("/").pop() ?? path) : noFolderLabel,
          docs: [],
        };
        map.set(key, group);
      }
      group.docs.push(doc);
    }
    return Array.from(map.values()).sort((a, b) => {
      // Folders first, ungrouped last
      if (a.folderPath === undefined && b.folderPath !== undefined) return 1;
      if (a.folderPath !== undefined && b.folderPath === undefined) return -1;
      return (a.folderPath ?? "").localeCompare(b.folderPath ?? "");
    });
  }, [documents, getFolderPath, noFolderLabel]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Fall back to flat table when no actual folders are in use — preserves the
  // pre-grouping layout for organizations that haven't filed templates yet.
  const hasFolders = groups.some((g) => g.folderPath !== undefined);
  if (!hasFolders) {
    return <CrmDataTable<TData> data={documents} columns={columns} {...tableProps} />;
  }

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const key = group.folderPath ?? "__none__";
        const isCollapsed = collapsed.has(key);
        return (
          <div key={key} className="space-y-2">
            <button
              type="button"
              onClick={() => toggle(key)}
              className="flex w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors"
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" variant="stroke" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" variant="stroke" />
              )}
              {isCollapsed ? (
                <Folder className="h-4 w-4 text-amber-500" />
              ) : (
                <FolderOpen className="h-4 w-4 text-amber-500" />
              )}
              <span className="flex-1 text-left">
                {group.folderPath ?? group.label}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                ({group.docs.length})
              </span>
            </button>
            {!isCollapsed && (
              <CrmDataTable<TData>
                data={group.docs}
                columns={columns}
                {...tableProps}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
