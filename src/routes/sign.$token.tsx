import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SignaturePad } from "@/components/documents/signature-pad";
import {
  FileSignature,
  Check,
  ShieldCheck,
  AlertTriangle,
} from "@/lib/ez-icons";

export const Route = createFileRoute("/sign/$token")({
  component: SigningPage,
});

function SigningPage() {
  const { token } = Route.useParams();
  const data = useQuery(api.signatureRequests.getByToken, { token });

  if (data === undefined)
    return (
      <PageShell>
        <Loading />
      </PageShell>
    );
  if (data === null)
    return (
      <PageShell>
        <ErrorState message="Nie znaleziono dokumentu." />
      </PageShell>
    );
  if (data.expired)
    return (
      <PageShell>
        <ErrorState message="Ten link do podpisu wygasł lub został już wykorzystany." />
      </PageShell>
    );
  if (!data.request || !data.document)
    return (
      <PageShell>
        <ErrorState message="Wystąpił błąd." />
      </PageShell>
    );

  return (
    <PageShell>
      <SigningFlow
        token={token}
        request={data.request}
        document={data.document}
        organizationName={data.organization?.name}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Layout shell
// ---------------------------------------------------------------------------

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-8">{children}</div>
    </div>
  );
}

function Loading() {
  return (
    <Card>
      <CardContent className="flex items-center justify-center py-16">
        <p className="text-muted-foreground animate-pulse">
          Ładowanie dokumentu...
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

// ---------------------------------------------------------------------------
// Main signing flow
// ---------------------------------------------------------------------------

interface SigningFlowProps {
  token: string;
  request: {
    slotId: string;
    signerName?: string;
    signerEmail?: string;
    signerPhone?: string;
    verificationMethod: string;
    status: string;
  };
  document: {
    title: string;
    renderedContent: string | undefined;
    status: string;
  };
  organizationName?: string;
}

function SigningFlow({
  token,
  request,
  document,
  organizationName,
}: SigningFlowProps) {
  const signExternal = useMutation(api.signatureRequests.signExternal);
  const verifyOtp = useMutation(api.signatureRequests.verifyOtp);
  const requestOtp = useAction(api.sms.requestOtp);

  const [step, setStep] = useState<"review" | "verify" | "sign" | "done">(
    "review",
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);

  const needsOtp =
    request.verificationMethod === "sms" ||
    request.verificationMethod === "email_otp";

  const handleSendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await requestOtp({ token });
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message ?? "Nie udało się wysłać kodu");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await verifyOtp({ token, code: otpCode });
      setOtpVerified(true);
      setStep("sign");
    } catch (err: any) {
      setError(err.message ?? "Nieprawidłowy kod");
    } finally {
      setLoading(false);
    }
  };

  const handleSign = useCallback(
    async (signatureData: string) => {
      setError(null);
      setLoading(true);
      try {
        await signExternal({ token, signatureData });
        setStep("done");
      } catch (err: any) {
        setError(err.message ?? "Nie udało się podpisać dokumentu");
      } finally {
        setLoading(false);
      }
    },
    [signExternal, token],
  );

  const handleClickSign = async () => {
    await handleSign("acknowledged");
  };

  if (step === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 py-16">
          <div className="rounded-full bg-green-100 p-4 dark:bg-green-900/30">
            <Check className="h-12 w-12 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-xl font-semibold">Dokument podpisany</h2>
          <p className="text-center text-muted-foreground">
            Dziękujemy! Twój podpis został zapisany.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="space-y-2">
            {organizationName && (
              <p className="text-sm text-muted-foreground">
                {organizationName}
              </p>
            )}
            <CardTitle className="text-xl">
              <FileSignature className="mr-2 inline h-5 w-5" />
              {document.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Podpisujesz jako:{" "}
              <span className="font-medium text-foreground">
                {request.signerName ?? request.signerEmail}
              </span>
            </p>
          </div>
        </CardHeader>
      </Card>

      {/* Document content */}
      <Card>
        <CardContent className="pt-6">
          <div
            className="prose prose-sm max-w-none rounded-lg border bg-white p-6 leading-relaxed dark:bg-muted/30"
            dangerouslySetInnerHTML={{ __html: document.renderedContent ?? "" }}
          />
        </CardContent>
      </Card>

      {/* Signing section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Podpis
            <Badge variant="outline">
              {request.verificationMethod === "click"
                ? "Kliknięcie"
                : request.verificationMethod === "sms"
                  ? "SMS OTP"
                  : "Email OTP"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: OTP verification (if needed) */}
          {needsOtp && !otpVerified && (
            <div className="space-y-4">
              {!otpSent ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {request.verificationMethod === "sms"
                      ? `Wyślemy kod weryfikacyjny SMS na numer ${request.signerPhone ?? "brak numeru"}`
                      : `Wyślemy kod weryfikacyjny na adres ${request.signerEmail ?? "brak emaila"}`}
                  </p>
                  <Button onClick={handleSendOtp} disabled={loading}>
                    {loading ? "Wysyłanie..." : "Wyślij kod"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Wpisz kod weryfikacyjny, który otrzymałeś:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="000000"
                      maxLength={6}
                      className="w-32 text-center font-mono text-lg tracking-widest"
                    />
                    <Button
                      onClick={handleVerifyOtp}
                      disabled={loading || otpCode.length !== 6}
                    >
                      {loading ? "Weryfikacja..." : "Weryfikuj"}
                    </Button>
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto"
                    onClick={handleSendOtp}
                    disabled={loading}
                  >
                    Wyślij ponownie
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Actual signing (click or canvas) */}
          {(!needsOtp || otpVerified) && (
            <div className="space-y-4">
              {/* Acknowledgment checkbox */}
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(!!v)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Potwierdzam zapoznanie się z treścią dokumentu i wyrażam zgodę
                  na jego podpisanie.
                </span>
              </label>

              {/* Signature pad toggle */}
              {!showSignaturePad ? (
                <div className="flex gap-2">
                  <Button
                    onClick={handleClickSign}
                    disabled={!acknowledged || loading}
                  >
                    {loading ? "Podpisywanie..." : "Podpisz dokument"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowSignaturePad(true)}
                    disabled={!acknowledged}
                  >
                    Złóż podpis odręczny
                  </Button>
                </div>
              ) : (
                <SignaturePad
                  onSign={(dataUrl) => handleSign(dataUrl)}
                  onCancel={() => setShowSignaturePad(false)}
                />
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
