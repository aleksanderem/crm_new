import type {
  EmailBlock,
  TextContent,
  HeadingContent,
  ImageContent,
  ButtonContent,
  DividerContent,
  ColumnsContent,
  SpacerContent,
  VariableSource,
} from "@/lib/email-block-types";
import { TextBlock } from "./blocks/text-block";
import { HeadingBlock } from "./blocks/heading-block";
import { ImageBlock } from "./blocks/image-block";
import { ButtonBlock } from "./blocks/button-block";
import { DividerBlock } from "./blocks/divider-block";
import { ColumnsBlock } from "./blocks/columns-block";
import { SpacerBlock } from "./blocks/spacer-block";

interface BlockRendererProps {
  block: EmailBlock;
  isSelected: boolean;
  onContentChange: (content: Record<string, unknown>) => void;
  variableSources?: VariableSource[];
}

export function BlockRenderer({
  block,
  isSelected,
  onContentChange,
  variableSources,
}: BlockRendererProps) {
  switch (block.type) {
    case "text":
      return (
        <TextBlock
          content={block.content as unknown as TextContent}
          onChange={(c) =>
            onContentChange(c as unknown as Record<string, unknown>)
          }
          isSelected={isSelected}
          variableSources={variableSources}
        />
      );
    case "heading":
      return (
        <HeadingBlock
          content={block.content as unknown as HeadingContent}
          onChange={(c) =>
            onContentChange(c as unknown as Record<string, unknown>)
          }
          isSelected={isSelected}
        />
      );
    case "image":
      return (
        <ImageBlock
          content={block.content as unknown as ImageContent}
          onChange={(c) =>
            onContentChange(c as unknown as Record<string, unknown>)
          }
          isSelected={isSelected}
        />
      );
    case "button":
      return (
        <ButtonBlock
          content={block.content as unknown as ButtonContent}
          onChange={(c) =>
            onContentChange(c as unknown as Record<string, unknown>)
          }
          isSelected={isSelected}
        />
      );
    case "divider":
      return (
        <DividerBlock
          content={block.content as unknown as DividerContent}
          onChange={(c) =>
            onContentChange(c as unknown as Record<string, unknown>)
          }
          isSelected={isSelected}
        />
      );
    case "columns":
      return (
        <ColumnsBlock
          content={block.content as unknown as ColumnsContent}
          onChange={(c) =>
            onContentChange(c as unknown as Record<string, unknown>)
          }
          isSelected={isSelected}
          variableSources={variableSources}
        />
      );
    case "spacer":
      return (
        <SpacerBlock
          content={block.content as unknown as SpacerContent}
          onChange={(c) =>
            onContentChange(c as unknown as Record<string, unknown>)
          }
          isSelected={isSelected}
        />
      );
    default:
      return (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          Unknown block type: {block.type}
        </div>
      );
  }
}
