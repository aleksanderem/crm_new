// ---------------------------------------------------------------------------
// Email block ↔ HTML converters
// ---------------------------------------------------------------------------

import type {
  EmailBlock,
  TextContent,
  HeadingContent,
  ImageContent,
  ButtonContent,
  DividerContent,
  ColumnsContent,
  SpacerContent,
} from "@/lib/email-block-types";
import { generateBlockId } from "@/lib/email-block-types";

// ---------------------------------------------------------------------------
// Blocks → HTML (email-safe, inline styles, table-based columns)
// ---------------------------------------------------------------------------

const FONT_STACK =
  "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;";

function textAlignStyle(align: string): string {
  return `text-align: ${align};`;
}

function renderTextBlock(content: TextContent): string {
  return `<div style="${FONT_STACK} font-size: 14px; line-height: 1.6; color: #333333; padding: 8px 0;">${content.html}</div>`;
}

function renderHeadingBlock(content: HeadingContent): string {
  return `<div style="${FONT_STACK} color: #111111; padding: 8px 0;">${content.html}</div>`;
}

function renderImageBlock(content: ImageContent): string {
  const align = content.align || "center";
  const width = content.width ? `${content.width}%` : "100%";
  const imgTag = `<img src="${escapeAttr(content.url)}" alt="${escapeAttr(content.alt)}" style="max-width: 100%; width: ${width}; height: auto; display: block; border: 0;" />`;
  const linked = content.linkUrl
    ? `<a href="${escapeAttr(content.linkUrl)}" target="_blank" rel="noopener noreferrer">${imgTag}</a>`
    : imgTag;

  return `<div style="${textAlignStyle(align)} padding: 8px 0;">${linked}</div>`;
}

function renderButtonBlock(content: ButtonContent): string {
  const align = content.align || "center";
  return `<div style="${textAlignStyle(align)} padding: 12px 0;">
  <a href="${escapeAttr(content.url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: ${escapeAttr(content.bgColor)}; color: ${escapeAttr(content.textColor)}; ${FONT_STACK} font-size: 14px; font-weight: 600; text-decoration: none; padding: 10px 24px; border-radius: 4px; mso-padding-alt: 0;">
    ${escapeHtml(content.label)}
  </a>
</div>`;
}

function renderDividerBlock(content: DividerContent): string {
  return `<div style="padding: 12px 0;"><hr style="border: none; height: ${content.thickness}px; background-color: ${escapeAttr(content.color)}; margin: 0;" /></div>`;
}

function renderColumnsBlock(content: ColumnsContent): string {
  const leftHtml = (content.left || []).map(renderBlock).join("");
  const rightHtml = (content.right || []).map(renderBlock).join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
  <tr>
    <td width="50%" valign="top" style="padding: 0 8px 0 0;">${leftHtml}</td>
    <td width="50%" valign="top" style="padding: 0 0 0 8px;">${rightHtml}</td>
  </tr>
</table>`;
}

function renderSpacerBlock(content: SpacerContent): string {
  return `<div style="height: ${content.height}px; line-height: ${content.height}px; font-size: 1px;">&nbsp;</div>`;
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "text":
      return renderTextBlock(block.content as TextContent);
    case "heading":
      return renderHeadingBlock(block.content as HeadingContent);
    case "image":
      return renderImageBlock(block.content as ImageContent);
    case "button":
      return renderButtonBlock(block.content as ButtonContent);
    case "divider":
      return renderDividerBlock(block.content as DividerContent);
    case "columns":
      return renderColumnsBlock(block.content as ColumnsContent);
    case "spacer":
      return renderSpacerBlock(block.content as SpacerContent);
    default:
      return "";
  }
}

export interface EmailLayoutData {
  headerBlocks?: EmailBlock[];
  footerBlocks?: EmailBlock[];
  backgroundColor?: string;
  contentBackgroundColor?: string;
  primaryColor?: string;
  logoUrl?: string;
  companyName?: string;
  footerText?: string;
}

export function blocksToHtml(blocks: EmailBlock[], layout?: EmailLayoutData): string {
  const bg = layout?.backgroundColor ?? "transparent";
  const contentBg = layout?.contentBackgroundColor ?? "transparent";
  const header = layout?.headerBlocks?.map(renderBlock).join("\n") ?? "";
  const footer = layout?.footerBlocks?.map(renderBlock).join("\n") ?? "";
  const inner = blocks.map(renderBlock).join("\n");
  return `<div style="background-color: ${bg}; padding: 16px 0;">
<div style="max-width: 600px; margin: 0 auto; background-color: ${contentBg}; ${FONT_STACK}">
${header}
${inner}
${footer}
</div>
</div>`;
}

// ---------------------------------------------------------------------------
// HTML → Blocks (basic: wraps entire HTML in a single text block)
// ---------------------------------------------------------------------------

export function htmlToBlocks(html: string): EmailBlock[] {
  if (!html || !html.trim()) return [];

  return [
    {
      id: generateBlockId(),
      type: "text",
      content: { html },
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
