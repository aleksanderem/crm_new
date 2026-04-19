import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import {
  useSupabaseCustomFieldDefinitions,
} from "@/hooks/use-supabase-custom-fields";
import type { FieldDefinition } from "@/components/custom-fields/types";

interface UseCustomFieldFormOptions {
  organizationId: string;
  entityType: string;
  activityTypeKey?: string;
}

interface UseCustomFieldFormResult {
  definitions: FieldDefinition[] | undefined;
  values: Record<string, unknown>;
  onChange: (fieldKey: string, value: unknown) => void;
  resetValues: () => void;
  loadValuesFromEntity: (cfValues: Record<string, unknown>) => void;
  saveValues: (entityId: string) => Promise<void>;
}

export function useCustomFieldForm({
  organizationId,
  entityType,
  activityTypeKey,
}: UseCustomFieldFormOptions): UseCustomFieldFormResult {
  const [values, setValues] = useState<Record<string, unknown>>({});

  const { data: rawDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    entityType,
    { activityTypeKey },
  );

  // Cast to FieldDefinition to preserve downstream compatibility
  const definitions = rawDefs as FieldDefinition[] | undefined;

  // Mutations still go through Convex (dual-write handles Supabase sync)
  // @ts-ignore — Convex useMutation hits TS2589 deep instantiation limit
  const setCustomFields = useAction(api.customFields.setValues);

  const onChange = useCallback((fieldKey: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldKey]: value }));
  }, []);

  const resetValues = useCallback(() => {
    setValues({});
  }, []);

  const loadValuesFromEntity = useCallback(
    (cfValues: Record<string, unknown>) => {
      if (!definitions) {
        setValues({});
        return;
      }
      const mapped: Record<string, unknown> = {};
      for (const def of definitions) {
        const val = cfValues[def._id];
        if (val !== undefined) {
          mapped[def.fieldKey] = val;
        }
      }
      setValues(mapped);
    },
    [definitions]
  );

  const saveValues = useCallback(
    async (entityId: string) => {
      if (!definitions) return;
      const fieldsToSave = definitions
        .filter((d) => values[d.fieldKey] !== undefined && values[d.fieldKey] !== "")
        .map((d) => ({
          fieldDefinitionId: d._id as Id<"customFieldDefinitions">,
          value: values[d.fieldKey],
        }));
      if (fieldsToSave.length > 0) {
        await setCustomFields({
          organizationId: organizationId as Id<"organizations">,
          entityType: entityType as any,
          entityId,
          fields: fieldsToSave,
        });
      }
    },
    [definitions, values, setCustomFields, organizationId, entityType]
  );

  return { definitions, values, onChange, resetValues, loadValuesFromEntity, saveValues };
}
