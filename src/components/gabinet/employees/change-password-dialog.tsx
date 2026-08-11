import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordDialog({
  open,
  onOpenChange,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  changePasswordError,
  setChangePasswordError,
  changePasswordSubmitting,
  onSubmit,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  changePasswordError: string | null;
  setChangePasswordError: (v: string | null) => void;
  changePasswordSubmitting: boolean;
  onSubmit: () => Promise<void>;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!changePasswordSubmitting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("gabinet.employees.changePasswordTitle")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.employees.changePasswordDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("gabinet.employees.newPassword")}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setChangePasswordError(null);
              }}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("gabinet.employees.confirmPassword")}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setChangePasswordError(null);
              }}
              autoComplete="new-password"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("gabinet.employees.passwordRequirements")}
          </p>
          {changePasswordError && (
            <p className="text-sm text-destructive">{changePasswordError}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={changePasswordSubmitting}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={changePasswordSubmitting}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
