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
  /** Field ID that failed validation — highlighted with a red outline. */
  invalidFieldId?: string | null;
}

interface PortalTarget {
  element: Element;
  field: ExtractedFormField;
  isStandalone: boolean;
}

// ---------------------------------------------------------------------------
// Standalone detection — mirrors the isFieldStandalone check in
// document-renderer.tsx but operates on portal marker spans rather than
// original form-field spans. A marker is "standalone" when its parent block
// has no other meaningful text content, meaning the field label IS the
// question (not just a blank inside a sentence).
// ---------------------------------------------------------------------------

function isMarkerStandalone(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  for (const node of Array.from(parent.childNodes)) {
    if (node === el) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim()) return false;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const sibling = node as Element;
      // Other portal markers on the same line are acceptable siblings
      if (sibling.id?.startsWith("ff_portal_")) continue;
      if (sibling.tagName === "BR") continue;
      if ((sibling.textContent ?? "").trim()) return false;
    }
  }
  return true;
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
  invalidFieldId,
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
      if (el) {
        targets.push({
          element: el,
          field,
          isStandalone: isMarkerStandalone(el),
        });
      }
    }
    setPortals(targets);
  }, [markedHtml, formFields]);

  return (
    <>
      <div
        ref={containerRef}
        className="prose prose-sm max-w-none text-gray-900 [&_*]:text-gray-900 [&_a]:!text-blue-700 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:p-2"
        dangerouslySetInnerHTML={{ __html: markedHtml }}
      />
      {portals.map(({ element, field, isStandalone }) =>
        createPortal(
          <InlineFieldControl
            key={field.fieldId}
            field={field}
            value={
              values[field.fieldId] ??
              (field.fieldType === "checkbox" ? "false" : "")
            }
            onChange={(v) => onValueChange(field.fieldId, v)}
            isStandalone={isStandalone}
            isInvalid={field.fieldId === invalidFieldId}
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

export function InlineFieldControl({
  field,
  value,
  onChange,
  isStandalone,
  isInvalid,
}: {
  field: ExtractedFormField;
  value: string;
  onChange: (value: string) => void;
  isStandalone?: boolean;
  isInvalid?: boolean;
}) {
  const invalidOutline = isInvalid ? "2px solid #ef4444" : undefined;

  // Show the field label as a visible question prompt for standalone fields
  // where the label IS the question (not just a blank inside a sentence).
  // Checkboxes are excluded — they always show their label inline.
  const showLabel = isStandalone && !!field.label && field.fieldType !== "checkbox";

  // For non-standalone required fields (inline inside a sentence), show a red
  // asterisk after the control — the label is not shown, so without this the
  // client has no indication the field is required until validation fires.
  const inlineRequiredMarker = !isStandalone && field.required && field.fieldType !== "checkbox" ? (
    <span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>
  ) : null;

  const labelNode = showLabel ? (
    <span
      style={{
        display: "block",
        fontSize: "14px",
        fontWeight: "500",
        color: "#111827",
        marginBottom: "4px",
      }}
    >
      {field.label}
      {field.required && (
        <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>
      )}
    </span>
  ) : null;

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
          outline: invalidOutline,
          borderRadius: "4px",
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
      <span style={{ display: "block", width: "100%" }}>
        {labelNode}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder || (showLabel ? "" : field.label)}
          required={field.required}
          rows={3}
          style={{
            display: "block",
            width: "100%",
            border: isInvalid ? "1px solid #ef4444" : "1px solid #d1d5db",
            borderRadius: "4px",
            padding: "6px 10px",
            fontSize: "14px",
            color: "#111827",
            background: "#fff",
            outline: isInvalid ? "1px solid #ef4444" : undefined,
          }}
        />
        {inlineRequiredMarker}
      </span>
    );
  }

  if (field.fieldType === "select") {
    const opts = field.options
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return (
      <span style={{ display: showLabel ? "block" : "inline-block" }}>
        {labelNode}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          style={{
            display: "inline-block",
            border: isInvalid ? "1px solid #ef4444" : "1px solid #d1d5db",
            borderRadius: "4px",
            padding: "4px 8px",
            fontSize: "14px",
            color: "#111827",
            background: "#fff",
            minWidth: "140px",
            outline: isInvalid ? "1px solid #ef4444" : undefined,
          }}
        >
          <option value="">{field.placeholder || "Wybierz..."}</option>
          {opts.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {inlineRequiredMarker}
      </span>
    );
  }

  if (field.fieldType === "button_select") {
    const opts = field.options
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return (
      <span style={{ display: "block", width: "100%", outline: invalidOutline, borderRadius: "4px" }}>
        {labelNode}
        <span
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {opts.map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                style={{
                  padding: "10px 20px",
                  border: selected ? "2px solid #7C6AE8" : "2px solid #d1d5db",
                  borderRadius: "8px",
                  background: selected ? "#ede9ff" : "#fff",
                  color: selected ? "#4C3D9E" : "#111827",
                  fontSize: "14px",
                  fontWeight: selected ? "600" : "400",
                  cursor: "pointer",
                  minHeight: "44px",
                  minWidth: "80px",
                  transition: "border-color 0.15s, background 0.15s",
                  lineHeight: "1.4",
                  textAlign: "center",
                  wordBreak: "break-word",
                }}
              >
                {opt}
              </button>
            );
          })}
        </span>
      </span>
    );
  }

  // text / date / default
  return (
    <span style={{ display: showLabel ? "block" : "inline-block" }}>
      {labelNode}
      <input
        type={field.fieldType === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder || (showLabel ? "" : field.label)}
        required={field.required}
        style={{
          display: "inline-block",
          border: isInvalid ? "1px solid #ef4444" : "1px solid #d1d5db",
          borderRadius: "4px",
          padding: "4px 8px",
          fontSize: "14px",
          color: "#111827",
          background: "#fff",
          minWidth: "140px",
          outline: isInvalid ? "1px solid #ef4444" : undefined,
        }}
      />
      {inlineRequiredMarker}
    </span>
  );
}
