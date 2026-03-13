import { cn } from "@/utils/misc";

export interface TagItem {
  label: string;
  count: number;
  color: string;
}

interface TypeTagsProps {
  tags: TagItem[];
}

export function TypeTags({ tags }: TypeTagsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium", tag.color)}
        >
          {tag.label} {tag.count}
        </span>
      ))}
    </div>
  );
}
