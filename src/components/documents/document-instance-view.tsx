import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentViewer } from "./document-viewer";
import { SignaturePad } from "./signature-pad";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "pending_signature"
  | "signed"
  | "archived";

interface DocumentInstanceViewProps {
  instanceId: Id<"documentInstances">;
  onClose?: () => void;
  onStatusChange?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentInstanceView({
  instanceId,
  onClose,
  onStatusChange,
}: DocumentInstanceViewProps) {
  const [signingSlotId, setSigningSlotId] = useState<string | null>(null);

  const { data: instance, isLoading } = useQuery(
    convexQuery(api.documentInstances.getById, { id: instanceId }),
  );

  const updateStatus = useMutation(api.documentInstances.updateStatus);
  const signMutation = useMutation(api.documentInstances.sign);

  const handleStatusChange = async (status: DocumentStatus) => {
    try {
      await updateStatus({ id: instanceId, status });
      toast.success("Status dokumentu został zaktualizowany");
      onStatusChange?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nie udało się zmienić statusu";
      toast.error(message);
    }
  };

  const handleSign = async (dataUrl: string) => {
    if (!signingSlotId) return;
    try {
      await signMutation({
        id: instanceId,
        slotId: signingSlotId,
        signatureData: dataUrl,
      });
      toast.success("Podpis został złożony");
      setSigningSlotId(null);
      onStatusChange?.();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Nie udało się złożyć podpisu";
      toast.error(message);
    }
  };

  // ----- Loading state -----
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <p className="text-sm text-muted-foreground">Dokument nie został znaleziony.</p>
      </div>
    );
  }

  return (
    <>
      <DocumentViewer
        instance={instance}
        onSign={(slotId) => setSigningSlotId(slotId)}
        onStatusChange={handleStatusChange}
      />

      {/* Signature dialog */}
      <Dialog open={!!signingSlotId} onOpenChange={(open) => !open && setSigningSlotId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Złóż podpis</DialogTitle>
          </DialogHeader>
          <SignaturePad
            onSign={handleSign}
            onCancel={() => setSigningSlotId(null)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
