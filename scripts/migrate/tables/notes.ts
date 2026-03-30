/**
 * Migration config: Convex `notes` → PostgreSQL `notes`
 *
 * Depends on: users (created_by), organizations
 * Self-referencing: parent_note_id → notes(id) — insert parent first
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const notesConfig: TableMigrationConfig = {
  sourceTable: "notes",
  targetTable: "notes",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("entityType", "entity_type"),
    field("entityId", "entity_id"),
    field("content", "content"),
    refField("createdBy", "created_by"),
    field("isPinned", "is_pinned"),
    refField("parentNoteId", "parent_note_id"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(notesConfig);

export default notesConfig;
