import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/documents/signature-pad";
import { DocumentFormFiller } from "@/components/documents/document-form-filler";
import {
  extractFormFields,
  renderDocument,
} from "@/components/documents/document-renderer";
import {
  FileSignature,
  Check,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  ClipboardList,
} from "@/lib/ez-icons";

// ---------------------------------------------------------------------------
// Route definition — public page, no auth required
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/sign/form/$token")({
  component: FormSigningPage,
});

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

function FormSigningPage() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const getBySigningToken = useAction(
    api.documents.documents.getBySigningToken,
  );
  const { data, isLoading } = useQuery({
    queryKey: ["documents.documents.getBySigningToken", token],
    queryFn: () => getBySigningToken({ token }),
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <PageShell>
        <LoadingState />
      </PageShell>
    );
  }

  if (!data?.document || !data?.template) {
    return (
      <PageShell>
        <ErrorState
          message={t(
            "documents.signing.notFound",
            "Nie znaleziono dokumentu lub link wygasł.",
          )}
        />
      </PageShell>
    );
  }

  if (data.document.status === "signed") {
    return (
      <PageShell>
        <SuccessState />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <DocumentSigningFlow
        token={token}
        document={data.document}
        template={data.template}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  // body has `overflow: hidden; height: 100dvh` globally, so this shell must
  // be the scroll container — otherwise long forms (e.g. medical interview)
  // overflow without any way to scroll. See #1687.
  return (
    <div className="h-dvh overflow-y-auto bg-muted/30">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">{children}</div>
    </div>
  );
}

function LoadingState() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex items-center justify-center gap-3 py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">
          {t("documents.signing.loading", "Ładowanie dokumentu...")}
        </p>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
        <p className="text-center text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

function SuccessState() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
        <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/30">
          <Check className="h-12 w-12 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-xl font-semibold">
          {t("documents.signing.success", "Dokument podpisany")}
        </h2>
        <p className="text-center text-muted-foreground">
          {t(
            "documents.signing.successMessage",
            "Dziękujemy! Twój podpis został zapisany.",
          )}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared signing section (used by both flows)
// ---------------------------------------------------------------------------

function SignatureSection({
  token,
  signingMethod,
  onDone,
  resolvedHtml,
}: {
  token: string;
  signingMethod: "click" | "sms" | "email_otp" | "draw";
  onDone: () => void;
  resolvedHtml?: string;
}) {
  const { t } = useTranslation();
  const recordSignature = useAction(
    api.documents.documents.recordSignature,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSign = useCallback(
    async (signatureData: string) => {
      setError(null);
      setLoading(true);
      try {
        await recordSignature({
          token,
          signatureData,
          signedByName: "",
          resolvedHtml,
        });
        onDone();
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [recordSignature, token, resolvedHtml, onDone],
  );

  const handleClickSign = useCallback(async () => {
    await handleSign("click_confirmed");
  }, [handleSign]);

  const handleDrawSign = useCallback(
    (dataUrl: string) => {
      void handleSign(dataUrl);
    },
    [handleSign],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("documents.signing.signatureTitle", "Podpis")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="-mx-2 flex min-h-11 select-none items-start gap-3 rounded-md px-2 py-2.5 cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(!!v)}
            className="mt-0.5"
          />
          <span className="text-sm">
            {t(
              "documents.signing.acknowledge",
              "Potwierdzam zapoznanie się z treścią dokumentu i wyrażam zgodę na jego podpisanie.",
            )}
          </span>
        </label>

        {signingMethod === "draw" ? (
          <div className="space-y-3">
            {!showSignaturePad ? (
              <Button
                onClick={() => setShowSignaturePad(true)}
                disabled={!acknowledged}
              >
                {t("documents.signing.openPad", "Złóż podpis odręczny")}
              </Button>
            ) : (
              <SignaturePad
                onSign={handleDrawSign}
                onCancel={() => setShowSignaturePad(false)}
              />
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleClickSign}
              disabled={!acknowledged || loading}
            >
              {loading
                ? t("documents.signing.signing", "Podpisywanie...")
                : t("documents.signing.signButton", "Podpisz dokument")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSignaturePad(true)}
              disabled={!acknowledged}
            >
              {t("documents.signing.openPad", "Złóż podpis odręczny")}
            </Button>
          </div>
        )}

        {signingMethod !== "draw" && showSignaturePad && (
          <SignaturePad
            onSign={handleDrawSign}
            onCancel={() => setShowSignaturePad(false)}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FlowProps {
  token: string;
  document: {
    _id: string;
    title: string;
    responseData: string;
    status: string;
    organizationId: string;
  };
  template: {
    _id: string;
    name: string;
    formJson: string;
    templateType?: string;
    contentJson?: string;
    signatureConfig?: {
      method: "click" | "sms" | "email_otp" | "draw";
      signerRole: string;
    };
  };
}

// ---------------------------------------------------------------------------
// Document signing flow — two-step: fill form → sign
// ---------------------------------------------------------------------------

function DocumentSigningFlow({ token, document, template }: FlowProps) {
  const { t } = useTranslation();
  const submitFormFields = useAction(
    api.documents.documents.submitDocumentFormFields,
  );

  // Parse responseData — extract scope data, stored form field values, and HTML
  const { prefilledData, existingHtml, existingFormFieldValues } = useMemo(() => {
    try {
      const parsed = JSON.parse(document.responseData);

      // Extract saved form field values (employee-filled) for merging later
      const savedFieldVals: Record<string, string> = {};
      if (parsed.formFieldValues && typeof parsed.formFieldValues === "object") {
        for (const [k, v] of Object.entries(
          parsed.formFieldValues as Record<string, unknown>,
        )) {
          if (v != null) savedFieldVals[k] = String(v);
        }
      }

      // If form was already filled, re-render from template + stored values
      // (uses latest renderDocument logic for proper checkbox/select rendering).
      // scopeData may be missing for documents submitted before this fix —
      // in that case variables show as [path] placeholders.
      if (parsed.formFieldValues && template.contentJson) {
        const scopeData: Record<string, string> = {};
        if (parsed.scopeData && typeof parsed.scopeData === "object") {
          for (const [k, v] of Object.entries(
            parsed.scopeData as Record<string, unknown>,
          )) {
            if (v != null) scopeData[k] = String(v);
          }
        }
        try {
          const html = renderDocument(
            template.contentJson,
            scopeData,
            savedFieldVals,
          );
          return { prefilledData: scopeData, existingHtml: html, existingFormFieldValues: savedFieldVals };
        } catch {
          // Fallback to stored HTML if re-render fails
          return {
            prefilledData: {} as Record<string, string>,
            existingHtml: parsed.html as string | undefined,
            existingFormFieldValues: savedFieldVals,
          };
        }
      }

      if (parsed.html) {
        return {
          prefilledData: {} as Record<string, string>,
          existingHtml: parsed.html as string | undefined,
          existingFormFieldValues: savedFieldVals,
        };
      }

      // No html yet — this is the scope data map for pre-filling variables
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v != null) flat[k] = String(v);
      }
      return { prefilledData: flat, existingHtml: undefined, existingFormFieldValues: savedFieldVals };
    } catch {
      return {
        prefilledData: {} as Record<string, string>,
        existingHtml: undefined,
        existingFormFieldValues: {} as Record<string, string>,
      };
    }
  }, [document.responseData, template.contentJson]);

  // Extract form fields from template contentJson — only client fields for the signing page
  const formFields = useMemo(() => {
    if (!template.contentJson) return [];
    try {
      const all = extractFormFields(JSON.parse(template.contentJson));
      return all.filter((f) => f.filledBy === "client");
    } catch {
      return [];
    }
  }, [template.contentJson]);

  // Check if client form fields need filling — not just whether HTML exists.
  // Employee fields may already be in existingFormFieldValues, but client
  // fields won't be until the client fills them on this page.
  const needsFormFill =
    formFields.length > 0 &&
    formFields.some(
      (f) =>
        !existingFormFieldValues[f.fieldId] ||
        existingFormFieldValues[f.fieldId].trim() === "",
    );

  const [step, setStep] = useState<"fill" | "sign" | "done">(
    needsFormFill ? "fill" : "sign",
  );
  const [renderedHtml, setRenderedHtml] = useState<string | undefined>(
    existingHtml,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Render HTML for no-form-fields case or when form is already filled
  const preRenderedHtml = useMemo(() => {
    if (renderedHtml) return renderedHtml;
    if (formFields.length === 0 && template.contentJson) {
      try {
        return renderDocument(template.contentJson, prefilledData);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [renderedHtml, formFields.length, template.contentJson, prefilledData]);

  const handleFormComplete = useCallback(
    async (fieldValues: Record<string, string>) => {
      if (!template.contentJson) return;
      setSubmitting(true);
      setError(null);
      try {
        // Merge employee-filled values with new client-filled values
        const allFieldValues = { ...existingFormFieldValues, ...fieldValues };
        const html = renderDocument(
          template.contentJson,
          prefilledData,
          allFieldValues,
        );
        await submitFormFields({
          token,
          renderedHtml: html,
          formFieldValues: JSON.stringify(allFieldValues),
          scopeData: JSON.stringify(prefilledData),
        });
        setRenderedHtml(html);
        setStep("sign");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [template.contentJson, prefilledData, existingFormFieldValues, submitFormFields, token],
  );

  if (step === "done") return <SuccessState />;

  const signingMethod = template.signatureConfig?.method ?? "click";
  const displayHtml = renderedHtml ?? preRenderedHtml;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              {document.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {step === "fill"
                ? t(
                    "documents.signing.fillPrompt",
                    "Uzupełnij wymagane pola, a następnie przejdź do podpisu.",
                  )
                : t(
                    "documents.signing.reviewPrompt",
                    "Zapoznaj się z dokumentem, a następnie złóż podpis.",
                  )}
            </p>
          </div>
        </CardHeader>
      </Card>

      {/* Step 1: Form fill (only for draft documents with form fields) */}
      {step === "fill" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {t("documents.signing.formTitle", "Formularz")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submitting && (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  {t("common.saving", "Zapisywanie...")}
                </span>
              </div>
            )}
            {!submitting && (
              <DocumentFormFiller
                formFields={formFields}
                filledByFilter="client"
                onComplete={handleFormComplete}
                onCancel={() => {
                  // No cancel action on public page — just a no-op
                }}
              />
            )}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Document preview + signature */}
      {step === "sign" && displayHtml && (
        <>
          <Card>
            <CardContent className="pt-6">
              <div
                className="prose prose-sm max-w-none rounded-lg border bg-white p-6 text-gray-900 [&_*]:!text-gray-900 [&_a]:!text-blue-700 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:p-2"
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
            </CardContent>
          </Card>

          <SignatureSection
            token={token}
            signingMethod={signingMethod}
            onDone={() => setStep("done")}
            resolvedHtml={displayHtml}
          />
        </>
      )}

      {/* Fallback: no HTML available */}
      {step === "sign" && !displayHtml && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              {t(
                "documents.signing.renderError",
                "Nie udało się wyrenderować dokumentu. Skontaktuj się z gabinetem.",
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
