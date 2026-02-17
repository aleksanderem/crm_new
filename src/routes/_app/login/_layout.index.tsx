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
import { Route as OnboardingUsernameRoute } from "@/routes/_app/_auth/onboarding/_layout.username";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import { useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import Logo from "@/assets/svg/logo";

export const Route = createFileRoute("/_app/login/_layout/")({
  component: Login,
});

type LoginStep =
  | "choose"
  | "password"
  | "otp-email"
  | { otpVerify: string }
  | "forgot-password"
  | { resetPassword: string };

function Login() {
  const [step, setStep] = useState<LoginStep>("choose");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const navigate = useNavigate();

  useEffect(() => {
    if ((isLoading && !isAuthenticated) || !user) return;
    if (!isLoading && isAuthenticated && !user.username) {
      navigate({ to: OnboardingUsernameRoute.fullPath });
      return;
    }
    if (!isLoading && isAuthenticated) {
      navigate({ to: DashboardRoute.fullPath });
    }
  }, [user]);

  if (step === "choose") {
    return (
      <ChooseMethodForm
        onOtp={() => setStep("otp-email")}
        onPassword={() => setStep("password")}
      />
    );
  }
  if (step === "otp-email") {
    return <OtpEmailForm onSubmit={(email) => setStep({ otpVerify: email })} onBack={() => setStep("choose")} />;
  }
  if (typeof step === "object" && "otpVerify" in step) {
    return <OtpVerifyForm email={step.otpVerify} onBack={() => setStep("otp-email")} />;
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
      <span className="text-xl font-semibold">Kolabo</span>
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
  const { signIn } = useAuthActions();
  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">Witaj!</h2>
        <p className="text-muted-foreground">Wybierz metodę logowania:</p>
      </div>

      <div className="flex flex-wrap gap-4 sm:gap-6">
        <Button variant="outline" className="grow" onClick={onPassword}>
          Email i hasło
        </Button>
        <Button variant="outline" className="grow" onClick={onOtp}>
          Kod jednorazowy
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <Separator className="flex-1" />
        <p className="text-muted-foreground text-sm">Lub kontynuuj z</p>
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
        Kontynuując, akceptujesz{" "}
        <a className="text-foreground hover:underline" href="#">Regulamin</a> i{" "}
        <a className="text-foreground hover:underline" href="#">Politykę prywatności.</a>
      </p>
    </>
  );
}

/* ─── Step 2: Password (sign in / sign up) ─── */
function PasswordForm({ onBack, onForgotPassword }: { onBack: () => void; onForgotPassword: () => void }) {
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
            ? "Nieprawidłowy email lub hasło"
            : "Nie udało się utworzyć konta. Spróbuj ponownie."
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
          {isSignUp ? "Utwórz konto" : "Zaloguj się"}
        </h2>
        <p className="text-muted-foreground">
          {isSignUp ? "Wypełnij dane, aby rozpocząć" : "Wprowadź email i hasło"}
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
            Zarejestruj się z Github
          </Button>

          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <p className="text-muted-foreground text-sm">lub</p>
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
          validators={{ onSubmit: z.string().max(256).email("Adres email jest nieprawidłowy.") }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="userEmail">Email</Label>
              <Input
                id="userEmail"
                type="email"
                placeholder="Wprowadź adres email"
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
          validators={{ onSubmit: z.string().min(8, "Hasło musi mieć minimum 8 znaków.") }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="password">Hasło</Label>
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
                  {isVisible ? <EyeOffIcon /> : <EyeIcon />}
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
              Nie pamiętasz hasła?
            </button>
          </div>
        )}

        {error && <span className="block text-sm text-destructive">{error}</span>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : isSignUp ? "Utwórz konto" : "Zaloguj się"}
        </Button>
      </form>

      <p className="text-muted-foreground text-center">
        {isSignUp ? "Masz konto? " : "Nie masz konta? "}
        <button
          type="button"
          onClick={() => { setMode(isSignUp ? "signIn" : "signUp"); setError(null); }}
          className="text-foreground hover:underline"
        >
          {isSignUp ? "Zaloguj się" : "Zarejestruj się"}
        </button>
      </p>

      <button type="button" onClick={onBack} className="text-muted-foreground text-center text-sm hover:text-foreground">
        Wróć do wyboru metody
      </button>
    </>
  );
}

/* ─── OTP: enter email ─── */
function OtpEmailForm({
  onSubmit,
  onBack,
}: {
  onSubmit: (email: string) => void;
  onBack: () => void;
}) {
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
        await signIn("resend-otp", value);
        onSubmit(value.email);
      } catch {
        setError("Nie udało się wysłać kodu. Sprawdź adres email i spróbuj ponownie.");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">Kod jednorazowy</h2>
        <p className="text-muted-foreground">Wyślemy kod weryfikacyjny na Twój email</p>
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
          validators={{ onSubmit: z.string().max(256).email("Adres email jest nieprawidłowy.") }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="otpEmail">Email</Label>
              <Input
                id="otpEmail"
                type="email"
                placeholder="Wprowadź adres email"
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
          {isSubmitting ? <Loader2 className="animate-spin" /> : "Wyślij kod"}
        </Button>
      </form>

      <Button variant="ghost" className="w-full" onClick={onBack}>
        Wróć do wyboru metody
      </Button>
    </>
  );
}

/* ─── OTP: verify code (verify-email-03 style) ─── */
function OtpVerifyForm({ email, onBack }: { email: string; onBack: () => void }) {
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
        setError("Nieprawidłowy lub wygasły kod. Spróbuj ponownie lub wyślij nowy kod.");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">Sprawdź skrzynkę!</h2>
        <p className="text-muted-foreground">
          Wysłaliśmy kod weryfikacyjny na{" "}
          <span className="text-foreground font-semibold">{email}</span>.
          Wprowadź go poniżej.
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
            onSubmit: z.string().transform((s) => s.trim()).pipe(z.string().min(8, "Kod musi mieć minimum 8 znaków.")),
          }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="otpCode">Kod weryfikacyjny</Label>
              <Input
                id="otpCode"
                placeholder="Wprowadź kod z emaila"
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
        Nie dostałeś kodu?{" "}
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
              setError("Nie udało się wysłać nowego kodu. Spróbuj ponownie.");
            }
          }}
        >
          Wyślij ponownie
        </button>
      </p>
      {resent && (
        <p className="text-center text-sm text-green-600">Nowy kod został wysłany.</p>
      )}

      <Button variant="ghost" className="w-full" onClick={onBack}>
        Wróć
      </Button>
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
        setError("Nie udało się wysłać linku. Sprawdź adres email.");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">Nie pamiętasz hasła?</h2>
        <p className="text-muted-foreground">Wyślemy Ci instrukcje resetowania hasła.</p>
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
          validators={{ onSubmit: z.string().max(256).email("Adres email jest nieprawidłowy.") }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="resetEmail">Email</Label>
              <Input
                id="resetEmail"
                type="email"
                placeholder="Wprowadź adres email"
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
          {isSubmitting ? <Loader2 className="animate-spin" /> : "Wyślij link resetujący"}
        </Button>
      </form>

      <Button variant="ghost" className="w-full" onClick={onBack}>
        Wróć do logowania
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
        setError("Hasła nie są identyczne.");
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
        setError("Nieprawidłowy kod lub nie udało się zmienić hasła. Spróbuj ponownie.");
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <>
      <LogoHeader />

      <div>
        <h2 className="mb-1.5 text-2xl font-semibold">Ustaw nowe hasło</h2>
        <p className="text-muted-foreground">
          Wprowadź kod z emaila wysłanego na{" "}
          <span className="text-foreground font-semibold">{email}</span>{" "}
          oraz nowe hasło (min. 8 znaków).
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
              <Label htmlFor="resetCode">Kod z emaila</Label>
              <Input
                id="resetCode"
                placeholder="Wprowadź kod"
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
          validators={{ onSubmit: z.string().min(8, "Hasło musi mieć minimum 8 znaków.") }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="newPassword">Nowe hasło</Label>
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
                  {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
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
          validators={{ onSubmit: z.string().min(8, "Hasło musi mieć minimum 8 znaków.") }}
          children={(field) => (
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Potwierdź hasło</Label>
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
                  {isConfirmVisible ? <EyeOffIcon /> : <EyeIcon />}
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
          {isSubmitting ? <Loader2 className="animate-spin" /> : "Ustaw nowe hasło"}
        </Button>
      </form>

      <Button variant="ghost" className="w-full" onClick={onBack}>
        Wróć
      </Button>
    </>
  );
}
