import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PATIENT_BUILTIN_FIELDS } from "@/lib/documents/patient-mappable-fields";

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];

interface PendingFile { file: File; storageId: string | null; uploading: boolean; error: boolean }

export function TemplateScanDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const generateUploadUrl = useMutation(api.app.generateUploadUrl);
  const createJob = useAction(api.documentAnalysisJobs.createJob);
  const runJob = useAction(api.documentAnalysisJobs.runJob);

  const [files, setFiles] = useState<PendingFile[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const addFiles = useCallback(async (list: FileList | null) => {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => ACCEPTED.includes(f.type));
    if (accepted.length !== (list?.length ?? 0)) {
      toast.error(t("settings.formTemplates.scanUnsupportedType", "Obsługiwane formaty: PDF, JPG, PNG"));
    }
    for (const file of accepted) {
      setFiles((prev) => [...prev, { file, storageId: null, uploading: true, error: false }]);
      try {
        const uploadUrl = await generateUploadUrl();
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = (await res.json()) as { storageId: string };
        setFiles((prev) => prev.map((p) => (p.file === file ? { ...p, storageId, uploading: false } : p)));
      } catch {
        setFiles((prev) => prev.map((p) => (p.file === file ? { ...p, uploading: false, error: true } : p)));
      }
    }
  }, [generateUploadUrl, t]);

  const ready = files.filter((f) => f.storageId && !f.error);

  const handleAnalyze = async () => {
    if (ready.length === 0) return;
    setAnalyzing(true);
    try {
      const pages = ready.map((f, i) => ({ storageId: f.storageId!, mimeType: f.file.type, position: i + 1 }));
      const jobId = await createJob({
        organizationId,
        kind: "form_template",
        pages,
        context: JSON.stringify({ patientFields: PATIENT_BUILTIN_FIELDS.map((f) => ({ key: f.key, label: f.label })) }),
      });
      const res = await runJob({ organizationId, jobId });
      if (res.status === "error") {
        toast.error(t("settings.formTemplates.scanFailed", "Analiza nie powiodła się: {{error}}", { error: res.errorMessage }));
        return; // dialog zostaje otwarty — ponowienie = ponowny klik "Analizuj" (tworzy nowy job; runJob jest idempotentny, test w Task 4)
      }
      onOpenChange(false);
      void navigate({
        to: "/dashboard/settings/form-templates/new",
        search: { analysisJobId: jobId },
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!analyzing) { if (!o) setFiles([]); onOpenChange(o); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.formTemplates.scanTitle", "Nowy szablon ze skanu")}</DialogTitle>
          <DialogDescription>
            {t("settings.formTemplates.scanDescription", "Wgraj skan lub PDF istniejącego formularza. AI odtworzy treść i wykryje pola do wypełnienia — wynik zweryfikujesz w edytorze.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input type="file" multiple accept={ACCEPTED.join(",")} onChange={(e) => void addFiles(e.target.files)} />
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate">{f.file.name}</span>
              <span className="text-muted-foreground">
                {f.uploading
                  ? t("settings.formTemplates.scanUploading", "Wgrywanie…")
                  : f.error
                    ? t("settings.formTemplates.scanUploadError", "Błąd")
                    : "✓"}
              </span>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setFiles([]); onOpenChange(false); }} disabled={analyzing}>
            {t("common.cancel", "Anuluj")}
          </Button>
          <Button onClick={() => void handleAnalyze()} disabled={analyzing || ready.length === 0}>
            {analyzing
              ? t("settings.formTemplates.scanAnalyzing", "Analizuję…")
              : t("settings.formTemplates.scanAnalyze", "Analizuj ({{count}})", { count: ready.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
