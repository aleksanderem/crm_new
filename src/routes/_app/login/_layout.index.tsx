import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { z } from "zod";
import { Loader2 } from "@/lib/ez-icons";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Route as OnboardingUsernameRoute } from "@/routes/_app/_auth/onboarding/_layout.username";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import { Route as GabinetRoute } from "@/routes/_app/_auth/dashboard/_layout.gabinet.index";
import { useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useAnonSupabaseInvitationByToken } from "@/hooks/use-supabase-invitations";
import Logo from "@/assets/svg/logo";

export const Route = createFileRoute("/_app/login/_layout/")({
  component: Login,
  // Invite-flow context: when the user lands here from `/invite/<token>`,
  // we pre-fill the email and route them back to `/invite/<token>` after
  // auth so the invitation is accepted automatically.
  validateSearch: z.object({
    inviteToken: z.string().optional(),
    email: z.string().optional(),
  }),
});

type LoginStep =
  | "choose"
  | "password"
  | "otp-email"
  | { otpVerify: string }
  | "forgot-password"
  | { resetPassword: string };

function Login() {
  const { t } = useTranslation();
  const { inviteToken, email: inviteEmail } = Route.useSearch();
  const isInviteFlow = Boolean(inviteToken);

  // In invite flow we skip the choose-method screen and jump straight to OTP
  // (passwordless email auth — works equally for new and existing accounts,
  // so the user doesn't have to know whether they have a password yet).
  const [step, setStep] = useState<LoginStep>(
    isInviteFlow ? "otp-email" : "choose",
  );
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery({
    ...convexQuery(api.app.getCurrentUser, {}),
    enabled: isAuthenticated,
  });

  // Fetch invitation context for the banner shown above the OTP form.
  // Uses the anon Supabase client (no JWT needed) via the get_invitation_by_token
  // SECURITY DEFINER function, since this page renders outside SupabaseProvider.
  const { data: inviteData } = useAnonSupabaseInvitationByToken(inviteToken ?? "", {
    enabled: Boolean(inviteToken),
  });

  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    // Redirect back to the invite page before any other check. The invite
    // page handles its own auth/loading state, and checking !user first would
    // send new sign-ups to /dashboard, silently dropping the invite token.
    if (inviteToken) {
      navigate({ to: "/invite/$token", params: { token: inviteToken }, replace: true });
      return;
    }
    if (!user) {
      // No user record yet — let the dashboard's auth gate handle it
      navigate({ to: DashboardRoute.fullPath, replace: true });
      return;
    }
    if (!user.username) {
      navigate({ to: OnboardingUsernameRoute.fullPath, replace: true });
      return;
    }
    navigate({ to: GabinetRoute.fullPath, replace: true });
  }, [isLoading, isAuthenticated, user, navigate, inviteToken]);

  // Optional banner rendered above every step when in invite flow
  const inviteBanner = isInviteFlow && inviteData ? (
    <div className="mb-4 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
      <div className="font-medium">
        {inviteData.inviterName ?? t("login.invite.inviterFallback")} {t("login.invite.invitedBy")}{" "}
        <strong>{inviteData.orgName ?? t("login.invite.orgFallback")}</strong>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {t("login.invite.codeInstruction", { email: inviteData.invitation.email })}
      </div>
    </div>
  ) : null;

  if (step === "choose") {
    return (
      <ChooseMethodForm
        onOtp={() => setStep("otp-email")}
        onPassword={() => setStep("password")}
      />
    );
  }
  if (step === "otp-email") {
    return (
      <>
        {inviteBanner}
        <OtpEmailForm
          initialEmail={inviteEmail}
          lockEmail={isInviteFlow}
          onSubmit={(email) => setStep({ otpVerify: email })}
          onBack={isInviteFlow ? undefined : () => setStep("choose")}
        />
      </>
    );
  }
  if (typeof step === "object" && "otpVerify" in step) {
    return (
      <>
        {inviteBanner}
        <OtpVerifyForm email={step.otpVerify} onBack={() => setStep("otp-email")} />
      </>
    );
  }
  if (step === "password") {
    return <PasswordForm onBack={() => setStep("choose")} onForgotPassword={() => setStep("forgot-password")} />;
  }
  if (step === "forgot-password") {
    return <ForgotPasswordForm onSubmit={(email) => setStep({ resetPassword: email })} onBack={() => setStep("password")} />;
  }
  if (typeof step === "object" && "resetPassword" in step) {
    return <ResetPasswordForm email={step.resetPassword} onBack={() => setStep("forgot-password")} onSuccess={() => setStep("password")} />;
  }
  return null;
}

/* ─── Logo header reused across forms ─── */
function LogoHeader() {
  return (
    <div className="flex items-center gap-3">
      <Logo className="size-8.5 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
      <span className="text-xl font-semibold">Quera</span>
    </div>
  );
}

/* ─── Step 1: Choose method ─── */
function ChooseMethodForm({
  onOtp,
  onPassword,
}: {
  onOtp: () => void;
  onPassword: () => void;
}) {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">{t("login.chooseMethod.heading")}</h2>
        <p className="text-muted-foreground">{t("login.chooseMethod.subheading")}</p>
      </div>

      <div className="flex flex-wrap gap-4 sm:gap-6">
        <Button variant="outline" className="grow" onClick={onPassword}>
          {t("login.chooseMethod.passwordBtn")}
        </Button>
        <Button variant="outline" className="grow" onClick={onOtp}>
          {t("login.chooseMethod.otpBtn")}
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <p className="text-muted-foreground text-sm">{t("login.chooseMethod.orContinue")}</p>
        <Separator className="flex-1" />
      </div>

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => signIn("github", { redirectTo: "/login" })}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
          />
        </svg>
        Github
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {t("login.chooseMethod.legalLead")}{" "}
        <a className="text-foreground hover:underline" href="/terms">{t("login.chooseMethod.legalTerms")}</a>{" "}{t("login.chooseMethod.legalAnd")}{" "}
        <a className="text-foreground hover:underline" href="/privacy">{t("login.chooseMethod.legalPrivacy")}</a>
      </p>
    </>
  );
}

/* ─── Step 2: Password (sign in / sign up) ─── */
function PasswordForm({ onBack, onForgotPassword }: { onBack: () => void; onForgotPassword: () => void }) {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", {
          email: value.email,
          password: value.password,
          flow: mode,
        });
      } catch {
        setError(
          mode === "signIn"
            ? t("login.password.errInvalid")
            : t("login.password.errSignUp")
        );
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const isSignUp = mode === "signUp";

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">
          {isSignUp ? t("login.password.signUpHeading") : t("login.password.signInHeading")}
        </h2>
        <p className="text-muted-foreground">
          {isSignUp ? t("login.password.signUpSubheading") : t("login.password.signInSubheading")}
        </p>
      </div>

      {isSignUp && (
        <>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => signIn("github", { redirectTo: "/login" })}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
              />
            </svg>
            {t("login.password.githubSignUp")}
          </Button>

          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <p className="text-muted-foreground text-sm">{t("login.common.lab.or")}</p>
            <Separator className="flex-1" />
          </div>
        </>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="email"
          validators={{ onSubmit: z.string().max(256).email(t("login.validation.emailInvalid")) }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="userEmail">{t("login.fields.email")}</Label>
              <Input
                id="userEmail"
                type="email"
                placeholder={t("login.fields.emailPlaceholder")}
                autoComplete="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={field.state.meta?.errors.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        <form.Field
          name="password"
          validators={{ onSubmit: z.string().min(8, t("login.validation.passwordMin")) }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="password">{t("login.fields.password")}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={isVisible ? "text" : "password"}
                  placeholder="••••••••••••"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  className={`pr-9 ${field.state.meta?.errors.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsVisible((prev) => !prev)}
                  className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
                >
                  {isVisible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </Button>
              </div>
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        {!isSignUp && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm hover:underline"
            >
              {t("login.password.forgotLink")}
            </button>
          </div>
        )}

        {error && <span className="block text-sm text-destructive">{error}</span>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : isSignUp ? t("login.password.signUpHeading") : t("login.password.signInHeading")}
        </Button>
      </form>

      <p className="text-muted-foreground text-center">
        {isSignUp ? t("login.password.hasAccount") : t("login.password.noAccount")}
        <button
          type="button"
          onClick={() => { setMode(isSignUp ? "signIn" : "signUp"); setError(null); }}
          className="text-foreground hover:underline"
        >
          {isSignUp ? t("login.password.toggleToSignIn") : t("login.password.toggleToSignUp")}
        </button>
      </p>

      <button type="button" onClick={onBack} className="text-muted-foreground text-center text-sm hover:text-foreground">
        {t("login.password.backToMethod")}
      </button>
    </>
  );
}

/* ─── OTP: enter email ─── */
function OtpEmailForm({
  onSubmit,
  onBack,
  initialEmail,
  lockEmail,
}: {
  onSubmit: (email: string) => void;
  onBack?: () => void;
  initialEmail?: string;
  lockEmail?: boolean;
}) {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: { email: initialEmail ?? "" },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("resend-otp", value);
        onSubmit(value.email);
      } catch {
        setError(t("login.otp.errSendFailed"));
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">{t("login.otp.heading")}</h2>
        <p className="text-muted-foreground">{t("login.otp.subheading")}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="email"
          validators={{ onSubmit: z.string().max(256).email(t("login.validation.emailInvalid")) }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="otpEmail">{t("login.fields.email")}</Label>
              <Input
                id="otpEmail"
                type="email"
                placeholder={t("login.fields.emailPlaceholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                readOnly={lockEmail}
                disabled={lockEmail}
                className={field.state.meta?.errors.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        {error && <span className="block text-sm text-destructive">{error}</span>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : t("login.otp.sendCode")}
        </Button>
      </form>

      {onBack && (
        <Button variant="ghost" className="w-full" onClick={onBack}>
          {t("login.password.backToMethod")}
        </Button>
      )}
    </>
  );
}

/* ─── OTP: verify code (verify-email-03 style) ─── */
function OtpVerifyForm({ email, onBack }: { email: string; onBack: () => void }) {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: { code: "" },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("resend-otp", { email, code: value.code.trim() });
      } catch {
        setError(t("login.otp.errVerify"));
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">{t("login.otp.checkInbox")}</h2>
        <p className="text-muted-foreground">
          {t("login.otp.sentMessage")}{" "}
          <span className="text-foreground font-semibold">{email}</span>.
          {t("login.otp.enterBelow")}
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="code"
          validators={{
            onSubmit: z.string().transform((s) => s.trim()).pipe(z.string().min(8, t("login.validation.codeMin"))),
          }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="otpCode">{t("login.fields.code")}</Label>
              <Input
                id="otpCode"
                placeholder={t("login.fields.codePlaceholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={
                  field.state.meta?.errors.length > 0 || error
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }
              />
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        {error && <span className="block text-sm text-destructive">{error}</span>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : "Kontynuuj"}
        </Button>
      </form>

      <p className="text-muted-foreground text-center text-sm">
        {t("login.otp.didntGetCode")}{" "}
        <button
          type="button"
          className="text-foreground hover:underline"
          onClick={async () => {
            setError(null);
            setResent(false);
            try {
              await signIn("resend-otp", { email });
              setResent(true);
            } catch {
              setError(t("login.otp.errResend"));
            }
          }}
        >
          {t("login.otp.resend")}
        </button>
      </p>
      {resent && (
        <p className="text-center text-sm text-green-600">{t("login.otp.codeResent")}</p>
      )}

      <Button variant="ghost" className="w-full" onClick={onBack}>{t("login.otp.back")}</Button>
    </>
  );
}

/* ─── Forgot password (forgot-password-03 style) ─── */
function ForgotPasswordForm({
  onSubmit,
  onBack,
}: {
  onSubmit: (email: string) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", { email: value.email, flow: "reset" });
        onSubmit(value.email);
      } catch {
        setError(t("login.forgot.errSendLink"));
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">{t("login.forgot.heading")}</h2>
        <p className="text-muted-foreground">{t("login.forgot.subheading")}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="email"
          validators={{ onSubmit: z.string().max(256).email(t("login.validation.emailInvalid")) }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="resetEmail">{t("login.fields.email")}</Label>
              <Input
                id="resetEmail"
                type="email"
                placeholder={t("login.fields.emailPlaceholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={field.state.meta?.errors.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        {error && <span className="block text-sm text-destructive">{error}</span>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : t("login.forgot.sendLink")}
        </Button>
      </form>

      <Button variant="ghost" className="w-full" onClick={onBack}>
        {t("login.forgot.backToLogin")}
      </Button>
    </>
  );
}

/* ─── Reset password (reset-password-03 style) ─── */
function ResetPasswordForm({
  email,
  onBack,
  onSuccess,
}: {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: { code: "", newPassword: "", confirmPassword: "" },
    onSubmit: async ({ value }) => {
      if (value.newPassword !== value.confirmPassword) {
        setError(t("login.reset.errPasswordMismatch"));
        return;
      }
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", {
          email,
          code: value.code.trim(),
          newPassword: value.newPassword,
          flow: "reset-verification",
        });
        onSuccess();
      } catch {
        setError(t("login.reset.errResetFailed"));
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">{t("login.reset.heading")}</h2>
        <p className="text-muted-foreground">
          {t("login.reset.instruction")}{" "}
          <span className="text-foreground font-semibold">{email}</span>{" "}
          {t("login.reset.passwordHint")}
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="code"
          validators={{ onSubmit: z.string().min(1, "Kod jest wymagany.") }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="resetCode">{t("login.fields.resetCode")}</Label>
              <Input
                id="resetCode"
                placeholder={t("login.fields.resetCodePlaceholder")}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={field.state.meta?.errors.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        <form.Field
          name="newPassword"
          validators={{ onSubmit: z.string().min(8, t("login.validation.passwordMin")) }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="newPassword">{t("login.fields.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={isPasswordVisible ? "text" : "password"}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  className={`pr-9 ${field.state.meta?.errors.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                  className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
                >
                  {isPasswordVisible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </Button>
              </div>
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        <form.Field
          name="confirmPassword"
          validators={{ onSubmit: z.string().min(8, t("login.validation.passwordMin")) }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">{t("login.fields.confirmPassword")}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={isConfirmVisible ? "text" : "password"}
                  placeholder="••••••••••••"
                  autoComplete="new-password"
                  className={`pr-9 ${field.state.meta?.errors.length > 0 ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsConfirmVisible((prev) => !prev)}
                  className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
                >
                  {isConfirmVisible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </Button>
              </div>
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">{field.state.meta.errors.join(" ")}</span>
              )}
            </div>
          )}
        />

        {error && <span className="block text-sm text-destructive">{error}</span>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : t("login.reset.submitBtn")}
        </Button>
      </form>

      <Button variant="ghost" className="w-full" onClick={onBack}>{t("login.otp.back")}</Button>
    </>
  );
}
