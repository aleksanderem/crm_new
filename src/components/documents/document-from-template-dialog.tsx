import { useState, useCallback } from "react";
import type { Id } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/lib/ez-icons";
import { TemplatePicker } from "./template-picker";
import { DocumentFromTemplate } from "./document-from-template";

// --- Types ---

type Step = "pick_template" | "fill_document";

interface DocumentFromTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  module: string;
  sources: Record<string, string>;
  onComplete?: (instanceId: Id<"documentInstances">) => void;
}

// --- Component ---

export function DocumentFromTemplateDialog({
  open,
  onOpenChange,
  organizationId,
  module,
  sources,
  onComplete,
}: DocumentFromTemplateDialogProps) {
  const [step, setStep] = useState<Step>("pick_template");
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<Id<"documentTemplates"> | null>(null);

  const reset = useCallback(() => {
    setStep("pick_template");
    setSelectedTemplateId(null);
  }, []);

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) {
        reset();
      }
      onOpenChange(value);
    },
    [onOpenChange, reset],
  );

  const handleTemplateSelect = useCallback(
    (templateId: Id<"documentTemplates">) => {
      setSelectedTemplateId(templateId);
      setStep("fill_document");
    },
    [],
  );

  const handleComplete = useCallback(
    (instanceId: Id<"documentInstances">) => {
      handleOpenChange(false);
      onComplete?.(instanceId);
    },
    [handleOpenChange, onComplete],
  );

  const handleBack = useCallback(() => {
    setStep("pick_template");
    setSelectedTemplateId(null);
  }, []);

  // Step 1: Template selection — delegate to TemplatePicker (which is its own Dialog)
  if (step === "pick_template") {
    return (
      <TemplatePicker
        open={open}
        onOpenChange={handleOpenChange}
        organizationId={organizationId}
        module={module}
        availableSources={sources}
        onSelect={handleTemplateSelect}
      />
    );
  }

  // Step 2: Document form + preview — render in our own large Dialog
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-1.5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleBack}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Powrot do wyboru szablonu</span>
            </Button>
            <div>
              <DialogTitle>Nowy dokument z szablonu</DialogTitle>
              <DialogDescription>
                Wypelnij pola i zapisz dokument jako szkic.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto">
          {selectedTemplateId && (
            <DocumentFromTemplate
              organizationId={organizationId}
              templateId={selectedTemplateId}
              sources={sources}
              onComplete={handleComplete}
              onCancel={() => handleOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { DocumentFromTemplateDialogProps };
