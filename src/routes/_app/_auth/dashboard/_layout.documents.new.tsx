import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentUploadForm } from "@/components/forms/document-upload-form";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/new"
)({
  component: NewDocument,
});

function NewDocument() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createDocument = useMutation(api.documents.create);
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div>
      <PageHeader title="Upload Document" />
      <Card>
        <CardContent className="pt-6">
          <DocumentUploadForm
            isSubmitting={isSubmitting}
            onCancel={() => navigate({ to: "/dashboard/documents" })}
            onSubmit={async (data) => {
              setIsSubmitting(true);
              try {
                let fileId: string | undefined;
                let fileUrl: string | undefined;
                let mimeType: string | undefined;
                let fileSize: number | undefined;

                if (data.file) {
                  const uploadUrl = await generateUploadUrl();
                  const result = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": data.file.type },
                    body: data.file,
                  });
                  const { storageId } = await result.json();
                  fileId = storageId;
                  mimeType = data.file.type;
                  fileSize = data.file.size;
                }

                const id = await createDocument({
                  organizationId,
                  name: data.name,
                  description: data.description,
                  category: data.category,
                  fileId,
                  fileUrl,
                  mimeType,
                  fileSize,
                });
                navigate({ to: `/dashboard/documents/${id}` });
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
