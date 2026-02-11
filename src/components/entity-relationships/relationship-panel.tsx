import { Link } from "@tanstack/react-router";
import { Users, Building2, TrendingUp, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const entityIcons: Record<string, typeof Users> = {
  contact: Users,
  company: Building2,
  lead: TrendingUp,
  document: FileText,
};

const entityRoutes: Record<string, string> = {
  contact: "/dashboard/contacts",
  company: "/dashboard/companies",
  lead: "/dashboard/leads",
  document: "/dashboard/documents",
};

interface Relationship {
  _id: string;
  targetType: string;
  targetId: string;
  targetName: string;
  relationshipType?: string;
}

interface RelationshipPanelProps {
  relationships: Relationship[];
  onRemove?: (id: string) => void;
  onAdd?: () => void;
}

export function RelationshipPanel({
  relationships,
  onRemove,
  onAdd,
}: RelationshipPanelProps) {
  // Group by target type
  const grouped = relationships.reduce<Record<string, Relationship[]>>(
    (acc, rel) => {
      if (!acc[rel.targetType]) acc[rel.targetType] = [];
      acc[rel.targetType].push(rel);
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Relationships</h4>
        {onAdd && (
          <Button variant="ghost" size="sm" onClick={onAdd}>
            Add
          </Button>
        )}
      </div>

      {relationships.length === 0 ? (
        <p className="text-sm text-muted-foreground">No linked entities.</p>
      ) : (
        Object.entries(grouped).map(([type, rels]) => {
          const Icon = entityIcons[type] ?? Users;
          return (
            <div key={type}>
              <p className="mb-1.5 text-xs font-medium uppercase text-muted-foreground">
                {type}s
              </p>
              <div className="space-y-1">
                {rels.map((rel) => (
                  <div
                    key={rel._id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted"
                  >
                    <Link
                      to={`${entityRoutes[rel.targetType]}/${rel.targetId}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {rel.targetName}
                    </Link>
                    {onRemove && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => onRemove(rel._id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
            </div>
          );
        })
      )}
    </div>
  );
}
