import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Pencil, Power, Settings } from "@/lib/ez-icons";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import type { TFunction } from "i18next";
import { ChangePasswordDialog } from "./change-password-dialog";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

export function AccountTabContent({
  employee,
  userEmail,
  role,
  onChangePassword,
  onEditEmployee,
  onDeactivate,
  t,
}: {
  employee: MappedGabinetEmployee;
  userEmail?: string | null;
  role?: string | null;
  onChangePassword: (newPassword: string) => Promise<void>;
  onEditEmployee: () => void;
  onDeactivate: () => void;
  t: TFunction;
}) {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setNewPassword("");
      setConfirmPassword("");
      setChangePasswordError(null);
    }
    setChangePasswordOpen(open);
  };

  const validatePasswordForm = (): string | null => {
    if (newPassword.length < 8) return t("gabinet.employees.passwordTooShort");
    if (!/[A-Z]/.test(newPassword)) return t("gabinet.employees.passwordNeedsUppercase");
    if (!/[0-9]/.test(newPassword)) return t("gabinet.employees.passwordNeedsDigit");
    if (newPassword !== confirmPassword) return t("gabinet.employees.passwordMismatch");
    return null;
  };

  const handleSubmitPasswordChange = async () => {
    const validationError = validatePasswordForm();
    if (validationError) {
      setChangePasswordError(validationError);
      return;
    }
    setChangePasswordSubmitting(true);
    setChangePasswordError(null);
    try {
      await onChangePassword(newPassword);
      toast.success(t("gabinet.employees.changePasswordSuccess"));
      handleOpenChange(false);
    } catch (e) {
      setChangePasswordError(formatActionError(e, t, {
        key: "gabinet.employees.errors.changePasswordFailed",
        defaultValue: "Nie udało się zmienić hasła.",
      }));
    } finally {
      setChangePasswordSubmitting(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            {t("gabinet.employees.tabs.account", "Konto")}
          </p>
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">{t("gabinet.employees.loginEmail", "Adres e-mail do logowania")}</span>
              <span className="text-sm font-medium">{employee.email || userEmail || "—"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-muted-foreground">{t("gabinet.employees.accountStatus", "Status konta")}</span>
              <Badge variant={employee.isActive ? "default" : "secondary"}>
                {employee.isActive ? t("gabinet.employees.accountActive", "Aktywny") : t("gabinet.employees.accountInactive", "Nieaktywny")}
              </Badge>
            </div>
          </div>
        </div>

        {(role === "admin" || role === "owner") && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              {t("gabinet.employees.adminActions", "Akcje administracyjne")}
            </p>
            <div className="rounded-lg border divide-y">
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setChangePasswordOpen(true)}
              >
                <Settings className="h-4 w-4 text-muted-foreground shrink-0" variant="stroke" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{t("gabinet.employees.changePassword")}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.employees.changePasswordDesc", "Ustaw nowe hasło do logowania")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" variant="stroke" />
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                onClick={onEditEmployee}
              >
                <Pencil className="h-4 w-4 text-muted-foreground shrink-0" variant="stroke" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{t("gabinet.employees.editEmployee")}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.employees.editEmployeeDesc", "Zmień dane i ustawienia pracownika")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" variant="stroke" />
              </button>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                onClick={onDeactivate}
              >
                <Power className="h-4 w-4 text-destructive shrink-0" variant="stroke" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-destructive">{t("gabinet.employees.deactivate")}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.employees.deactivateDesc", "Wyłącz dostęp pracownika do systemu")}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" variant="stroke" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onOpenChange={handleOpenChange}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        changePasswordError={changePasswordError}
        setChangePasswordError={setChangePasswordError}
        changePasswordSubmitting={changePasswordSubmitting}
        onSubmit={handleSubmitPasswordChange}
        t={t}
      />
    </>
  );
}
