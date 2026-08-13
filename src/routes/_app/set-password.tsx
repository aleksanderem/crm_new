import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "@convex-dev/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useConvexAction } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, EyeIcon, EyeOffIcon } from "@/lib/ez-icons";
import Logo from "@/assets/svg/logo";
import { Route as GabinetRoute } from "@/routes/_app/_auth/dashboard/_layout.gabinet.index";

export const Route = createFileRoute("/_app/set-password")({
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { data: user } = useQuery({
    ...convexQuery(api.app.getCurrentUser, {}),
    enabled: isAuthenticated,
  });
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { mutateAsync: setOwnPassword, isPending } = useMutation({
    mutationFn: useConvexAction(api.app.setOwnPassword),
  });

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      navigate({ to: "/login", replace: true });
      return;
    }
    // Redirect to dashboard if flag already cleared (e.g. back navigation).
    if (user !== undefined && !user?.mustChangePassword) {
      navigate({ to: GabinetRoute.fullPath, replace: true });
    }
  }, [isLoading, isAuthenticated, user, navigate]);

  if (isLoading || !isAuthenticated || !user?.mustChangePassword) {
    return null;
  }

  const passwordError = (() => {
    if (!newPassword) return null;
    if (newPassword.length < 8) return t("gabinet.employees.passwordTooShort", { defaultValue: "Hasło musi mieć co najmniej 8 znaków." });
    if (!/[A-Z]/.test(newPassword)) return t("gabinet.employees.passwordNoUppercase", { defaultValue: "Hasło musi zawierać co najmniej 1 wielką literę." });
    if (!/[0-9]/.test(newPassword)) return t("gabinet.employees.passwordNoDigit", { defaultValue: "Hasło musi zawierać co najmniej 1 cyfrę." });
    return null;
  })();

  const confirmError = confirmPassword && newPassword !== confirmPassword
    ? t("gabinet.employees.passwordMismatch", { defaultValue: "Hasła nie są identyczne." })
    : null;

  const isValid =
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setError(null);
    try {
      await setOwnPassword({ newPassword });
      navigate({ to: GabinetRoute.fullPath, replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unexpectedError", { defaultValue: "Wystąpił błąd. Spróbuj ponownie." }));
    }
  };

  return (
    <div className="h-dvh flex items-center justify-center sm:px-6 md:px-8">
      <div className="flex w-full flex-col gap-6 p-6 sm:max-w-sm">
        <div className="flex items-center gap-3">
          <Logo className="size-8.5 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
          <span className="text-xl font-semibold">Quera</span>
        </div>

        <div>
          <h2 className="mb-1.5 text-2xl font-semibold">
            {t("setPassword.heading", { defaultValue: "Ustaw nowe hasło" })}
          </h2>
          <p className="text-muted-foreground">
            {t("setPassword.subheading", { defaultValue: "Twoje konto zostało utworzone z hasłem jednorazowym. Ustaw własne hasło, aby kontynuować." })}
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor="new-password">
              {t("setPassword.newPassword", { defaultValue: "Nowe hasło" })}
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                placeholder="••••••••••••"
                autoComplete="new-password"
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowNew((v) => !v)}
                className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
              >
                {showNew ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </Button>
            </div>
            {passwordError
              ? <span className="text-xs text-destructive">{passwordError}</span>
              : <span className="text-xs text-muted-foreground">{t("gabinet.employees.passwordHint", { defaultValue: "Min. 8 znaków, 1 wielka litera, 1 cyfra." })}</span>
            }
          </div>

          <div className="space-y-1">
            <Label htmlFor="confirm-password">
              {t("setPassword.confirmPassword", { defaultValue: "Powtórz hasło" })}
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                placeholder="••••••••••••"
                autoComplete="new-password"
                className="pr-9"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowConfirm((v) => !v)}
                className="text-muted-foreground absolute inset-y-0 right-0 rounded-l-none hover:bg-transparent"
              >
                {showConfirm ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </Button>
            </div>
            {confirmError && <span className="text-xs text-destructive">{confirmError}</span>}
          </div>

          {error && <span className="block text-sm text-destructive">{error}</span>}

          <Button type="submit" className="w-full" disabled={isPending || !isValid}>
            {isPending
              ? <Loader2 className="animate-spin" />
              : t("setPassword.submit", { defaultValue: "Ustaw hasło i zaloguj się" })}
          </Button>
        </form>
      </div>
    </div>
  );
}
