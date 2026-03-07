import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Id } from "@cvx/_generated/dataModel";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/lib/ez-icons";
import { DocumentInstanceView } from "@/components/documents/document-instance-view";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/instance/$instanceId"
)({
  component: DocumentInstancePage,
});

function DocumentInstancePage() {
  const { instanceId } = Route.useParams();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/dashboard/documents" })}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Powrót do dokumentów
        </Button>
      </div>

      <DocumentInstanceView
        instanceId={instanceId as Id<"documentInstances">}
      />
    </div>
  );
}
