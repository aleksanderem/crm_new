import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvexAction } from "@convex-dev/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { toast } from "sonner";
import { useOrganization } from "@/components/org-context";
import { Logo } from "@/ui/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Loader2 } from "@/lib/ez-icons";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import { TimePicker5Min } from "@/components/gabinet/calendar/time-picker-5min";

const STEPS = [
  "businessInfo",
  "treatments",
  "schedule",
  "invite",
  "complete",
] as const;

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/setup")({
  component: SetupWizard,
});

function SetupWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const [currentStep, setCurrentStep] = useState(0);

  // Form state
  const [orgName, setOrgName] = useState("");
  const [currency, setCurrency] = useState("PLN");
  const [treatments, setTreatments] = useState<{ name: string; price: string; duration: string }[]>([
    { name: "", price: "", duration: "60" },
  ]);
  const [schedule, setSchedule] = useState<Record<string, { start: string; end: string; enabled: boolean }>>({});

  // Fix #2 & #3: Wire up backend mutations and query.
  // `getSetupStatus` is a Supabase-backed action (#770), not a Convex query,
  // so it's called via `useAction` + react-query rather than `convexQuery`.
  const getSetupStatus = useAction(api.gabinet.onboarding.getSetupStatus);
  const { data: setupStatus } = useQuery({
    queryKey: ["gabinet.onboarding.getSetupStatus", organizationId],
    queryFn: () => getSetupStatus({ organizationId }),
    enabled: !!organizationId,
  });

  const { mutateAsync: completeSetup } = useMutation({
    mutationFn: useConvexAction(api.gabinet.onboarding.completeSetup),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  const createInvitation = useAction(api.invitations.create);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fix #3: Redirect if already completed
  if (setupStatus?.onboardingCompleted) {
    navigate({ to: DashboardRoute.fullPath });
    return null;
  }

  const currentStepKey = STEPS[currentStep];

  const canProceed = () => {
    switch (currentStepKey) {
      case "businessInfo":
        return orgName.trim().length > 0;
      case "treatments":
        return treatments.every((t) => t.name.trim().length > 0);
      case "schedule":
      case "invite":
      case "complete":
        return true;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === STEPS.length - 1) {
      setIsSubmitting(true);
      try {
        // dayOfWeek convention: 0=Sun, 1=Mon, ..., 6=Sat (matches JS Date.getDay())
        const workingHoursToSave = days
          .map((day, i) => ({
            dayOfWeek: (i + 1) % 7,
            startTime: schedule[day]?.start || "09:00",
            endTime: schedule[day]?.end || "17:00",
            isOpen: schedule[day]?.enabled === true,
          }))
          .filter((wh) => wh.isOpen);

        const treatmentsToSave = treatments
          .filter((t) => t.name.trim().length > 0)
          .map((t) => ({
            name: t.name.trim(),
            price: parseFloat(t.price) || 0,
            duration: parseInt(t.duration) || 60,
          }));

        await completeSetup({
          organizationId,
          organizationName: orgName.trim() || undefined,
          currency: currency || undefined,
          treatments: treatmentsToSave.length > 0 ? treatmentsToSave : undefined,
          workingHours: workingHoursToSave.length > 0 ? workingHoursToSave : undefined,
        });
        navigate({ to: DashboardRoute.fullPath });
      } catch (error) {
        console.error("Setup failed:", error);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (currentStepKey === "invite" && inviteEmail.trim()) {
        setIsSubmitting(true);
        try {
          await createInvitation({
            organizationId,
            email: inviteEmail.trim(),
            role: inviteRole,
          });
          toast.success(t("team.invitationSent"));
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          toast.error(message);
          setIsSubmitting(false);
          return;
        } finally {
          setIsSubmitting(false);
        }
      }
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const addTreatment = () => {
    setTreatments([...treatments, { name: "", price: "", duration: "60" }]);
  };

  const updateTreatment = (index: number, field: "name" | "price" | "duration", value: string) => {
    const updated = [...treatments];
    updated[index] = { ...updated[index], [field]: value };
    setTreatments(updated);
  };

  const removeTreatment = (index: number) => {
    setTreatments(treatments.filter((_, i) => i !== index));
  };

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  const updateSchedule = (day: string, field: "start" | "end" | "enabled", value: string | boolean) => {
    setSchedule({
      ...schedule,
      [day]: {
        ...schedule[day],
        [field]: value,
      },
    });
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Logo className="h-8 w-auto" />
          </div>
          <CardTitle>{t("onboarding.setupTitle")}</CardTitle>
          <CardDescription>
            {t("onboarding.stepOf", { step: currentStep + 1, total: STEPS.length })}
          </CardDescription>
        </CardHeader>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, index) => (
            <div
              key={index}
              className={`h-2 w-2 rounded-full transition-colors ${
                index === currentStep
                  ? "bg-primary"
                  : index < currentStep
                  ? "bg-primary/50"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        <CardContent>
          {/* Step 1: Business Info */}
          {currentStepKey === "businessInfo" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">{t("onboarding.organizationName")}</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder={t("onboarding.organizationNamePlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t("onboarding.currency")}</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN - Złoty</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="USD">USD - Dollar</SelectItem>
                    <SelectItem value="GBP">GBP - Pound</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 2: Treatments */}
          {currentStepKey === "treatments" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("onboarding.treatmentsDescription")}</p>
              {treatments.map((tr, index) => (
                <div key={index} className="flex gap-2">
                  <Label htmlFor={`tr-name-${index}`} className="sr-only">
                    {t("onboarding.treatmentName")} {index + 1}
                  </Label>
                  <Input
                    id={`tr-name-${index}`}
                    value={tr.name}
                    onChange={(e) => updateTreatment(index, "name", e.target.value)}
                    placeholder={t("onboarding.treatmentName")}
                    className="flex-1"
                  />
                  <Input
                    aria-label={t("onboarding.price")}
                    value={tr.price}
                    onChange={(e) => updateTreatment(index, "price", e.target.value)}
                    placeholder={t("onboarding.price")}
                    className="w-24"
                    type="number"
                    inputMode="decimal"
                  />
                  <Input
                    aria-label={t("onboarding.duration")}
                    value={tr.duration}
                    onChange={(e) => updateTreatment(index, "duration", e.target.value)}
                    placeholder={t("onboarding.duration")}
                    className="w-20"
                    type="number"
                    inputMode="numeric"
                  />
                  {treatments.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTreatment(index)}
                      aria-label={t("onboarding.removeTreatment")}
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addTreatment}>
                + {t("onboarding.addTreatment")}
              </Button>
            </div>
          )}

          {/* Step 4: Schedule */}
          {currentStepKey === "schedule" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("onboarding.scheduleDescription")}</p>
              {days.map((day) => (
                <div key={day} className="flex items-center gap-3">
                  {/* Fix #4: Replace bare <input type="checkbox"> with Shadcn Checkbox */}
                  <Checkbox
                    id={`day-${day}`}
                    checked={schedule[day]?.enabled || false}
                    onCheckedChange={(checked) => updateSchedule(day, "enabled", !!checked)}
                  />
                  <Label htmlFor={`day-${day}`} className="w-24 capitalize">
                    {t(`onboarding.day${day.charAt(0).toUpperCase() + day.slice(1)}`)}
                  </Label>
                  {schedule[day]?.enabled && (
                    <>
                      <TimePicker5Min
                        value={schedule[day]?.start || ""}
                        onChange={(v) => updateSchedule(day, "start", v)}
                        className="w-32"
                      />
                      <span className="text-muted-foreground">-</span>
                      <TimePicker5Min
                        value={schedule[day]?.end || ""}
                        onChange={(v) => updateSchedule(day, "end", v)}
                        className="w-32"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 5: Invite */}
          {currentStepKey === "invite" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("onboarding.inviteDescription")}</p>
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">{t("onboarding.inviteEmail")}</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("onboarding.inviteEmailPlaceholder")}
                />
              </div>
              {inviteEmail.trim() && (
                <div className="space-y-2">
                  <Label htmlFor="inviteRole">{t("team.role")}</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v as "admin" | "member" | "viewer")}
                  >
                    <SelectTrigger id="inviteRole">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">{t("team.roles.member")}</SelectItem>
                      <SelectItem value="admin">{t("team.roles.admin")}</SelectItem>
                      <SelectItem value="viewer">{t("team.roles.viewer")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Complete */}
          {currentStepKey === "complete" && (
            <div className="text-center space-y-4">
              <div className="text-6xl">🎉</div>
              <h3 className="text-xl font-semibold">{t("onboarding.completeTitle")}</h3>
              <p className="text-muted-foreground">{t("onboarding.completeDescription")}</p>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <Button
              variant="outline"
              onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("onboarding.back")}
            </Button>

            <div className="flex gap-2">
              {currentStep < STEPS.length - 1 && (
                <Button variant="ghost" onClick={handleSkip} disabled={isSubmitting}>
                  {t("onboarding.skip")}
                </Button>
              )}
              <Button onClick={handleNext} disabled={!canProceed() || isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : currentStep === STEPS.length - 1 ? (
                  t("onboarding.finish")
                ) : (
                  <>
                    {t("onboarding.next")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
