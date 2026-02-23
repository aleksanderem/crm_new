import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Trash2, Download, FileText } from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/$documentId"
)({
  component: DocumentDetail,
});

function formatFileSize(bytes?: number): string {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentDetail() {
  const { documentId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const removeDocument = useMutation(api.documents.remove);

  const { data: doc, isLoading } = useQuery(
    convexQuery(api.documents.getById, {
      organizationId,
      documentId: documentId as Id<"documents">,
    })
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!doc) {
    return <div>Document not found.</div>;
  }

  const handleDelete = async () => {
    if (window.confirm("Delete this document?")) {
      await removeDocument({
        organizationId,
        documentId: documentId as Id<"documents">,
      });
      navigate({ to: "/dashboard/documents" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={doc.name}
        description={doc.description}
        actions={
          <div className="flex items-center gap-2">
            {doc.fileUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={doc.fileUrl} target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{doc.name}</p>
              <p className="text-sm text-muted-foreground">
                {doc.mimeType ?? "Unknown type"} ·{" "}
                {formatFileSize(doc.fileSize)}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm">
                {doc.category ? (
                  <Badge variant="outline" className="capitalize">
                    {doc.category}
                  </Badge>
                ) : (
                  "Uncategorized"
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Uploaded</p>
              <p className="text-sm">
                {new Date(doc.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {doc.description && (
            <>
              <Separator />
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="mt-1 text-sm">{doc.description}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
