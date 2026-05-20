import type { ReactNode } from "react";

/** Extract plain text from a stored string (Plate JSON or plain text). */
export function plateJsonToText(raw: string | null | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const extractText = (node: any): string => {
        if (typeof node.text === "string") return node.text;
        if (Array.isArray(node.children)) return node.children.map(extractText).join("");
        return "";
      };
      return parsed.map((block: any) => extractText(block)).join("\n");
    }
  } catch {
    // Not JSON — return as-is
  }
  return raw;
}

interface PlateTextProps {
  /** Raw stored string (Plate JSON or plain text). */
  value: string | null | undefined;
  /** Rendered when the extracted text is empty. */
  fallback?: ReactNode;
}

/**
 * Renders a Plate-JSON or plain-text value as plain text. Use this anywhere a
 * rich-text field (e.g. notes, description, contraindications) is displayed
 * inside JSX so the raw JSON string never leaks into the DOM.
 */
export function PlateText({ value, fallback = null }: PlateTextProps) {
  const text = plateJsonToText(value).trim();
  if (!text) return <>{fallback}</>;
  return <>{text}</>;
}
