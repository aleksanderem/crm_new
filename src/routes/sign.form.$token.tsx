import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/documents/signature-pad";
import { SurveyFormViewer } from "@/components/documents/survey-form-viewer";
import {
  FileSignature,
  Check,
  ShieldCheck,
  AlertTriangle,
  Loader2,
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
  const getBySigningToken = api.documents.documents.getBySigningToken;
  const data = useQuery(getBySigningToken, { token });

  // Loading state — Convex returns undefined while loading
  if (data === undefined) {
    return (
      <PageShell>
        <LoadingState />
      </PageShell>
    );
  }

  // The query throws on not-found / expired / already signed,
  // so if we reach here we have a valid document + template
  if (!data?.document || !data?.template) {
    return (
      <PageShell>
        <ErrorState message={t("documents.signing.notFound", "Nie znaleziono dokumentu lub link wygasł.")} />
      </PageShell>
    );
  }

  // Document already signed
  if (data.document.status === "signed") {
    return (
      <PageShell>
        <SuccessState />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SigningFlow
        token={token}
        document={data.document}
        template={data.template}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Layout shell — clean, centered, mobile-friendly
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
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
          {t("documents.signing.successMessage", "Dziękujemy! Twój podpis został zapisany.")}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Signing flow
// ---------------------------------------------------------------------------

interface SigningFlowProps {
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
    signatureConfig?: {
      method: "click" | "sms" | "email_otp" | "draw";
      signerRole: string;
    };
  };
}

function SigningFlow({ token, document, template }: SigningFlowProps) {
  const { t } = useTranslation();
  const recordSignature = useMutation(
    api.documents.documents.recordSignature,
  );

  const [step, setStep] = useState<"review" | "sign" | "done">("review");
  const [acknowledged, setAcknowledged] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signingMethod = template.signatureConfig?.method ?? "click";

  // Parse the response data for the SurveyJS viewer
  let responseData: Record<string, unknown> = {};
  try {
    responseData = JSON.parse(document.responseData);
  } catch {
    // Invalid JSON — show empty form
  }

  const handleSign = useCallback(
    async (signatureData: string) => {
      setError(null);
      setLoading(true);
      try {
        await recordSignature({
          token,
          signatureData,
          signedByName: "",
        });
        setStep("done");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Wystąpił nieoczekiwany błąd";
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [recordSignature, token],
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

  if (step === "done") {
    return <SuccessState />;
  }

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
              {t("documents.signing.reviewPrompt", "Zapoznaj się z dokumentem, a następnie złóż podpis.")}
            </p>
          </div>
        </CardHeader>
      </Card>

      {/* Document content — SurveyJS form in read-only mode */}
      <Card>
        <CardContent className="pt-6">
          <SurveyFormViewer
            formJson={template.formJson}
            responseData={responseData}
          />
        </CardContent>
      </Card>

      {/* Signing section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            {t("documents.signing.signatureTitle", "Podpis")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "review" && (
            <div className="space-y-4">
              {/* Acknowledgment checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
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

              {/* Signing actions based on method */}
              {signingMethod === "draw" ? (
                // Draw method — show signature pad directly
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
                // Click method (default) — simple button
                <div className="flex gap-2">
                  <Button
                    onClick={handleClickSign}
                    disabled={!acknowledged || loading}
                  >
                    {loading
                      ? t("documents.signing.signing", "Podpisywanie...")
                      : t("documents.signing.signButton", "Podpisz dokument")}
                  </Button>
                  {signingMethod === "click" && (
                    <Button
                      variant="outline"
                      onClick={() => setShowSignaturePad(true)}
                      disabled={!acknowledged}
                    >
                      {t("documents.signing.openPad", "Złóż podpis odręczny")}
                    </Button>
                  )}
                </div>
              )}

              {/* Draw pad shown inline for click method when toggled */}
              {signingMethod === "click" && showSignaturePad && (
                <SignaturePad
                  onSign={handleDrawSign}
                  onCancel={() => setShowSignaturePad(false)}
                />
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
