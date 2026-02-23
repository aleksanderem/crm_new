import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/patient/login")({
  component: PatientLogin,
});

function PatientLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sendOtp = useMutation(api["gabinet/patientAuth"].sendPortalOtp);
  const verifyOtp = useMutation(api["gabinet/patientAuth"].verifyPortalOtp);

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const result = await sendOtp({ email });
      setSessionId(result.sessionId);
      setStep("otp");
      toast.success(t("patientPortal.login.otpSent"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || !sessionId) return;
    setLoading(true);
    try {
      const result = await verifyOtp({ sessionId, otp });
      localStorage.setItem("patientPortalToken", result.token);
      localStorage.setItem("patientPortalSessionId", result.sessionId);
      navigate({ to: "/patient" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">{t("patientPortal.login.title")}</h1>
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
              />
            </div>
            <Button className="w-full" onClick={handleSendOtp} disabled={loading || !email}>
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
