import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExtractedFormField } from "./document-renderer";
import { prepareDocumentForInlineForm } from "./document-renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InlineDocumentFormProps {
  contentJson: string;
  scopeData: Record<string, string>;
  /** All field values already stored on the document (employee + any pre-filled
   *  client values from a previous session). Client-field IDs are excluded from
   *  the document render so they appear as interactive portals instead. */
  existingFieldValues: Record<string, string>;
  /** Only client-facing form fields (filledBy === "client"). */
  formFields: ExtractedFormField[];
  /** Current client-filled values managed by the parent. */
  values: Record<string, string>;
  onValueChange: (fieldId: string, value: string) => void;
}

interface PortalTarget {
  element: Element;
  field: ExtractedFormField;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Renders the document as HTML with interactive client form fields injected
 * inline at their exact positions via React portals. This replaces the old
 * pattern of showing a static preview + a separate "Formularz" card below it.
 */
export function InlineDocumentForm({
  contentJson,
  scopeData,
  existingFieldValues,
  formFields,
  values,
  onValueChange,
}: InlineDocumentFormProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [portals, setPortals] = useState<PortalTarget[]>([]);

  // Client field IDs that should become interactive portals
  const clientFieldIds = useMemo(
    () => new Set(formFields.map((f) => f.fieldId)),
    [formFields],
  );

  // Employee-only values: used to resolve employee fields in the HTML while
  // leaving client-field spans intact for portal injection.
  const employeeValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(existingFieldValues).filter(
          ([k]) => !clientFieldIds.has(k),
        ),
      ),
    [existingFieldValues, clientFieldIds],
  );

  // HTML with variables + employee fields resolved; client fields replaced
  // with <span id="ff_portal_FIELDID"> marker elements.
  const markedHtml = useMemo(
    () => prepareDocumentForInlineForm(contentJson, scopeData, employeeValues),
    [contentJson, scopeData, employeeValues],
  );

  // After the DOM is updated, locate each marker span and record it as a
  // portal target. useLayoutEffect runs before the browser paints, so there
  // is no visible flash of empty markers.
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const targets: PortalTarget[] = [];
    for (const field of formFields) {
      const escapedId = CSS.escape(field.fieldId);
      const el = containerRef.current.querySelector(
        `#ff_portal_${escapedId}`,
      );
      if (el) targets.push({ element: el, field });
    }
    setPortals(targets);
  }, [markedHtml, formFields]);

  return (
    <>
      <div
        ref={containerRef}
        className="prose prose-sm max-w-none text-gray-900 [&_*]:!text-gray-900 [&_a]:!text-blue-700 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:p-2"
        dangerouslySetInnerHTML={{ __html: markedHtml }}
      />
      {portals.map(({ element, field }) =>
        createPortal(
          <InlineFieldControl
            key={field.fieldId}
            field={field}
            value={
              values[field.fieldId] ??
              (field.fieldType === "checkbox" ? "false" : "")
            }
            onChange={(v) => onValueChange(field.fieldId, v)}
          />,
          element,
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-field interactive control (rendered via portal into the marker span)
// ---------------------------------------------------------------------------

function InlineFieldControl({
  field,
  value,
  onChange,
}: {
  field: ExtractedFormField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.fieldType === "checkbox") {
    return (
      <label
        style={{
          display: "inline-flex",
          alignItems: "flex-start",
          gap: "10px",
          cursor: "pointer",
          userSelect: "none",
          width: "100%",
          padding: "6px 0",
        }}
      >
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          style={{
            marginTop: "2px",
            width: "16px",
            height: "16px",
            minWidth: "16px",
            cursor: "pointer",
            accentColor: "#7C6AE8",
          }}
        />
        <span style={{ fontSize: "14px", lineHeight: "1.5", color: "#111827" }}>
          {field.label}
          {field.required && (
            <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>
          )}
        </span>
      </label>
    );
  }

  if (field.fieldType === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || field.label}
        required={field.required}
        rows={3}
        style={{
          display: "block",
          width: "100%",
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          padding: "6px 10px",
          fontSize: "14px",
          color: "#111827",
          background: "#fff",
        }}
      />
    );
  }

  if (field.fieldType === "select") {
    const opts = field.options
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        style={{
          display: "inline-block",
          border: "1px solid #d1d5db",
          borderRadius: "4px",
          padding: "4px 8px",
          fontSize: "14px",
          color: "#111827",
          background: "#fff",
          minWidth: "140px",
        }}
      >
        <option value="">{field.placeholder || "Wybierz..."}</option>
        {opts.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  // text / date / default
  return (
    <input
      type={field.fieldType === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || field.label}
      required={field.required}
      style={{
        display: "inline-block",
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        padding: "4px 8px",
        fontSize: "14px",
        color: "#111827",
        background: "#fff",
        minWidth: "140px",
      }}
    />
  );
}
