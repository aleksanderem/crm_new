import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_app/patient/login")({
  validateSearch: z.object({
    org: z.string().optional(),
  }),
  component: PatientLogin,
});

function PatientLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { org: orgSlug } = Route.useSearch();

  const sendOtp = useMutation(api.gabinet.patientAuth.sendPortalOtp);
  const verifyOtp = useMutation(api.gabinet.patientAuth.verifyPortalOtp);

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  // Resolve org slug → organizationId via Convex
  const { data: orgData, isLoading: orgLoading } = useQuery(
    convexQuery(api.gabinet.patientAuth.getOrgBySlug, {
      slug: orgSlug ?? "",
    })
  );

  // If no slug provided, show invalid portal link error
  if (!orgSlug) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm text-center">
          <h1 className="text-xl font-semibold text-destructive">
            {t("patientPortal.login.invalidPortalLink")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("patientPortal.login.invalidPortalLinkDescription")}
          </p>
        </div>
      </div>
    );
  }

  // Org slug provided but not found in DB
  if (!orgLoading && orgData === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm text-center">
          <h1 className="text-xl font-semibold text-destructive">
            {t("patientPortal.login.invalidPortalLink")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("patientPortal.login.invalidPortalLinkDescription")}
          </p>
        </div>
      </div>
    );
  }

  const organizationId = orgData?._id;

  const handleSendOtp = async () => {
    if (!email || !organizationId) return;
    setLoading(true);
    try {
      await sendOtp({ email, organizationId });
      setStep("otp");
      toast.success(t("patientPortal.login.otpSent"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || !organizationId) return;
    setLoading(true);
    try {
      const result = await verifyOtp({ email, organizationId, otp });
      if (!result.success) {
        toast.error(result.error || t("patientPortal.login.errorGeneric"));
        return;
      }
      localStorage.setItem("patientPortalToken", result.sessionToken);
      localStorage.setItem("patientPortalPatientId", result.patientId);
      navigate({ to: "/patient" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("patientPortal.login.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">
            {orgData?.name ?? t("patientPortal.login.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("patientPortal.login.description")}</p>
        </div>

        {step === "email" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("common.email")}</Label>
              <Input
                type="email"
                className="h-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("patientPortal.login.emailPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleSendOtp()}
                disabled={orgLoading}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSendOtp}
              disabled={loading || !email || orgLoading || !organizationId}
            >
              {loading ? t("common.loading") : t("patientPortal.login.sendCode")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              {t("patientPortal.login.otpDescription", { email })}
            </p>
            <div className="space-y-1.5">
              <Label>{t("patientPortal.login.code")}</Label>
              <Input
                type="text"
                className="h-10 text-center tracking-widest text-lg"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                autoFocus
              />
            </div>
            <Button className="w-full" onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}>
              {loading ? t("common.loading") : t("patientPortal.login.verify")}
            </Button>
            <button
              className="w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setStep("email"); setOtp(""); }}
            >
              {t("patientPortal.login.changeEmail")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
