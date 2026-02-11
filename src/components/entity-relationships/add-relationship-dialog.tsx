import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Users, Building2, TrendingUp, FileText } from "lucide-react";

const entityTypes = [
  { value: "contact", label: "Contacts", icon: Users },
  { value: "company", label: "Companies", icon: Building2 },
  { value: "lead", label: "Leads", icon: TrendingUp },
  { value: "document", label: "Documents", icon: FileText },
] as const;

interface SearchResult {
  id: string;
  name: string;
  type: string;
}

interface AddRelationshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeType?: string;
  searchResults: SearchResult[];
  onSearch: (query: string, type: string) => void;
  onSelect: (targetType: string, targetId: string) => void;
}

export function AddRelationshipDialog({
  open,
  onOpenChange,
  excludeType,
  searchResults,
  onSearch,
  onSelect,
}: AddRelationshipDialogProps) {
  const [selectedType, setSelectedType] = useState<string>(
    entityTypes.find((t) => t.value !== excludeType)?.value ?? "contact"
  );

  const filteredTypes = entityTypes.filter((t) => t.value !== excludeType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link Entity</DialogTitle>
          <DialogDescription>
            Search and link a related entity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1">
          {filteredTypes.map((type) => (
            <Button
              key={type.value}
              variant={selectedType === type.value ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedType(type.value)}
            >
              <type.icon className="mr-1.5 h-3.5 w-3.5" />
              {type.label}
            </Button>
          ))}
        </div>

        <Command className="rounded-lg border">
          <CommandInput
            placeholder={`Search ${selectedType}s...`}
            onValueChange={(q) => onSearch(q, selectedType)}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {searchResults.map((result) => (
                <CommandItem
                  key={result.id}
                  value={result.name}
                  onSelect={() => {
                    onSelect(selectedType, result.id);
                    onOpenChange(false);
                  }}
                >
                  {result.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
