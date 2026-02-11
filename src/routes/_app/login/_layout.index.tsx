import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Input } from "@/ui/input";
import { Button } from "@/ui/button";
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import { useEffect, useState } from "react";
import { Route as OnboardingUsernameRoute } from "@/routes/_app/_auth/onboarding/_layout.username";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import { useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexAuth } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";

export const Route = createFileRoute("/_app/login/_layout/")({
  component: Login,
});

type LoginStep = "choose" | "otp-email" | { otpVerify: string } | "password";

function Login() {
  const [step, setStep] = useState<LoginStep>("choose");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const navigate = useNavigate();

  useEffect(() => {
    if ((isLoading && !isAuthenticated) || !user) {
      return;
    }
    if (!isLoading && isAuthenticated && !user.username) {
      navigate({ to: OnboardingUsernameRoute.fullPath });
      return;
    }
    if (!isLoading && isAuthenticated) {
      navigate({ to: DashboardRoute.fullPath });
      return;
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
    return <PasswordForm onBack={() => setStep("choose")} />;
  }
  return null;
}

function ChooseMethodForm({
  onOtp,
  onPassword,
}: {
  onOtp: () => void;
  onPassword: () => void;
}) {
  const { signIn } = useAuthActions();
  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Witaj w CRM Kolabo
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          Wybierz metodę logowania
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <Button className="w-full" onClick={onPassword}>
          Email i hasło
        </Button>

        <Button variant="outline" className="w-full bg-transparent" onClick={onOtp}>
          Kod jednorazowy (email)
        </Button>

        <div className="relative flex w-full items-center justify-center">
          <span className="absolute w-full border-b border-border" />
          <span className="z-10 bg-card px-2 text-xs font-medium uppercase text-primary/60">
            Lub
          </span>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2 bg-transparent"
          onClick={() => signIn("github", { redirectTo: "/login" })}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 text-primary/80 group-hover:text-primary"
            viewBox="0 0 24 24"
          >
            <path
              fill="currentColor"
              fillRule="nonzero"
              d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
            />
          </svg>
          Github
        </Button>
      </div>

      <p className="px-12 text-center text-sm font-normal leading-normal text-primary/60">
        Kontynuując, akceptujesz{" "}
        <a className="underline hover:text-primary">Regulamin</a> i{" "}
        <a className="underline hover:text-primary">Politykę prywatności.</a>
      </p>
    </div>
  );
}

function PasswordForm({ onBack }: { onBack: () => void }) {
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await signIn("password", {
          email: value.email,
          password: value.password,
          flow: mode,
        });
      } catch (e: any) {
        setError(
          mode === "signIn"
            ? "Nieprawidłowy email lub hasło"
            : "Nie udało się utworzyć konta. Spróbuj ponownie.",
        );
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          {mode === "signIn" ? "Zaloguj się" : "Utwórz konto"}
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          {mode === "signIn"
            ? "Wprowadź email i hasło"
            : "Wypełnij dane, aby utworzyć konto"}
        </p>
      </div>

      <form
        className="flex w-full flex-col items-start gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <form.Field
          name="email"
          validators={{
            onSubmit: z.string().max(256).email("Adres email jest nieprawidłowy."),
          }}
          children={(field) => (
            <div className="flex w-full flex-col gap-1.5">
              <Input
                placeholder="Email"
                type="email"
                autoComplete="email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent ${
                  field.state.meta?.errors.length > 0
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
              />
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">
                  {field.state.meta.errors.join(" ")}
                </span>
              )}
            </div>
          )}
        />

        <form.Field
          name="password"
          validators={{
            onSubmit: z
              .string()
              .min(8, "Hasło musi mieć minimum 8 znaków."),
          }}
          children={(field) => (
            <div className="flex w-full flex-col gap-1.5">
              <Input
                placeholder="Hasło"
                type="password"
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent ${
                  field.state.meta?.errors.length > 0
                    ? "border-destructive focus-visible:ring-destructive"
                    : ""
                }`}
              />
              {field.state.meta?.errors.length > 0 && (
                <span className="text-sm text-destructive">
                  {field.state.meta.errors.join(" ")}
                </span>
              )}
            </div>
          )}
        />

        {error && (
          <span className="text-sm text-destructive">{error}</span>
        )}

        <Button type="submit" className="w-full">
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : mode === "signIn" ? (
            "Zaloguj się"
          ) : (
            "Utwórz konto"
          )}
        </Button>
      </form>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
          className="text-sm text-primary/60 underline hover:text-primary"
        >
          {mode === "signIn"
            ? "Nie masz konta? Zarejestruj się"
            : "Masz konto? Zaloguj się"}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-primary/60 hover:text-primary"
        >
          Wróć
        </button>
      </div>
    </div>
  );
}

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
    defaultValues: {
      email: "",
    },
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
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <h3 className="text-center text-2xl font-medium text-primary">
          Kod jednorazowy
        </h3>
        <p className="text-center text-base font-normal text-primary/60">
          Wyślemy kod weryfikacyjny na Twój email
        </p>
      </div>
      <form
        className="flex w-full flex-col items-start gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="flex w-full flex-col gap-1.5">
          <label htmlFor="email" className="sr-only">
            Email
          </label>
          <form.Field
            name="email"
            validators={{
              onSubmit: z
                .string()
                .max(256)
                .email("Adres email jest nieprawidłowy."),
            }}
            children={(field) => (
              <Input
                placeholder="Email"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`bg-transparent ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
              />
            )}
          />
        </div>

        <div className="flex flex-col">
          {form.state.fieldMeta.email?.errors.length > 0 && (
            <span className="mb-2 text-sm text-destructive dark:text-destructive-foreground">
              {form.state.fieldMeta.email?.errors.join(" ")}
            </span>
          )}
          {error && (
            <span className="mb-2 text-sm text-destructive">
              {error}
            </span>
          )}
        </div>

        <Button type="submit" className="w-full">
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            "Wyślij kod"
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-primary/60 hover:text-primary"
      >
        Wróć
      </button>
    </div>
  );
}

function OtpVerifyForm({ email, onBack }: { email: string; onBack: () => void }) {
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const form = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      code: "",
    },
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
    <div className="mx-auto flex h-full w-full max-w-96 flex-col items-center justify-center gap-6">
      <div className="mb-2 flex flex-col gap-2">
        <p className="text-center text-2xl text-primary">Sprawdź skrzynkę!</p>
        <p className="text-center text-base font-normal text-primary/60">
          Wysłaliśmy kod weryfikacyjny na Twój email.
          <br />
          Wprowadź go poniżej.
        </p>
      </div>
      <form
        className="flex w-full flex-col items-start gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="flex w-full flex-col gap-1.5">
          <label htmlFor="code" className="sr-only">
            Kod
          </label>
          <form.Field
            name="code"
            validators={{
              onSubmit: z
                .string()
                .transform((s) => s.trim())
                .pipe(z.string().min(8, "Kod musi mieć minimum 8 znaków.")),
            }}
            children={(field) => {
              return (
                <Input
                  placeholder="Kod"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className={`bg-transparent ${
                    (field.state.meta?.errors.length > 0 || error) &&
                    "border-destructive focus-visible:ring-destructive"
                  }`}
                />
              );
            }}
          />
        </div>

        <div className="flex flex-col">
          {form.state.fieldMeta.code?.errors.length > 0 && (
            <span className="mb-2 text-sm text-destructive dark:text-destructive-foreground">
              {form.state.fieldMeta.code?.errors.join(" ")}
            </span>
          )}
          {error && (
            <span className="mb-2 text-sm text-destructive">
              {error}
            </span>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="animate-spin" />
          ) : (
            "Kontynuuj"
          )}
        </Button>
      </form>

      <div className="flex w-full flex-col">
        <p className="text-center text-sm font-normal text-primary/60">
          Nie dostałeś kodu?
        </p>
        <Button
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
          variant="ghost"
          className="w-full hover:bg-transparent"
        >
          Wyślij ponownie
        </Button>
        {resent && (
          <p className="text-center text-sm text-green-600">
            Nowy kod został wysłany. Użyj najnowszego kodu.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-primary/60 hover:text-primary"
      >
        Wróć
      </button>
    </div>
  );
}
