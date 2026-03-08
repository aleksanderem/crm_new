// ---------------------------------------------------------------------------
// Email block builder — shared types & constants
// ---------------------------------------------------------------------------

export type BlockType =
  | "text"
  | "heading"
  | "image"
  | "button"
  | "divider"
  | "columns"
  | "spacer";

export interface BlockStyles {
  backgroundColor?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  textColor?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right";
}

export interface EmailBlock {
  id: string;
  type: BlockType;
  content: Record<string, unknown>;
  styles?: BlockStyles;
}

// Content shapes per block type
export interface TextContent {
  html: string;
}

export interface HeadingContent {
  html: string;
}

export interface ImageContent {
  url: string;
  alt: string;
  align: "left" | "center" | "right";
  linkUrl?: string;
  width?: number;
}

export interface ButtonContent {
  label: string;
  url: string;
  align: "left" | "center" | "right";
  bgColor: string;
  textColor: string;
}

export interface DividerContent {
  color: string;
  thickness: number;
}

export interface ColumnsContent {
  left: EmailBlock[];
  right: EmailBlock[];
}

export interface SpacerContent {
  height: number;
}

// Block palette groups
export interface BlockPaletteItem {
  type: BlockType;
  label: string;
  group: "content" | "media" | "layout";
}

export const BLOCK_PALETTE: BlockPaletteItem[] = [
  { type: "text", label: "Text", group: "content" },
  { type: "heading", label: "Heading", group: "content" },
  { type: "image", label: "Image", group: "media" },
  { type: "button", label: "Button", group: "media" },
  { type: "columns", label: "Columns", group: "layout" },
  { type: "divider", label: "Divider", group: "layout" },
  { type: "spacer", label: "Spacer", group: "layout" },
];

export const SPACER_HEIGHTS = [8, 16, 24, 32, 48, 64] as const;

// Default content for each block type
export function createDefaultContent(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "text":
      return { html: "<p>Enter text here...</p>" };
    case "heading":
      return { html: "<h2>Heading</h2>" };
    case "image":
      return { url: "", alt: "", align: "center", linkUrl: "", width: 100 };
    case "button":
      return {
        label: "Click here",
        url: "https://",
        align: "center",
        bgColor: "#2563eb",
        textColor: "#ffffff",
      };
    case "divider":
      return { color: "#e5e7eb", thickness: 1 };
    case "columns":
      return { left: [], right: [] };
    case "spacer":
      return { height: 24 };
    default:
      return {};
  }
}

let blockIdCounter = 0;

export function generateBlockId(): string {
  blockIdCounter += 1;
  return `block-${Date.now()}-${blockIdCounter}`;
}

export function createBlock(type: BlockType): EmailBlock {
  return {
    id: generateBlockId(),
    type,
    content: createDefaultContent(type),
  };
}

// Variable source type (reused from email templates)
export interface VariableSource {
  key: string;
  label: string;
  fields: Array<{ key: string; label: string }>;
}
