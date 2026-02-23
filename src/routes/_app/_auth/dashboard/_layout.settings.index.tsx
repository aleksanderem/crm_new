import { createFileRoute } from "@tanstack/react-router";
import { useDoubleCheck } from "@/ui/use-double-check";
import { Input } from "@/components/ui/input";
import { Button } from "@/ui/button";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "~/convex/_generated/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { zodValidator } from "@tanstack/zod-form-adapter";
import * as validators from "@/utils/validators";
import { useSignOut } from "@/utils/misc";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/settings/")(
  {
    component: DashboardSettings,
    beforeLoad: () => ({
      title: "Settings",
      headerTitle: "Settings",
      headerDescription: "Manage your account settings.",
    }),
  },
);

export default function DashboardSettings() {
  const { t } = useTranslation();
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const signOut = useSignOut();
  const { mutateAsync: updateUsername } = useMutation({
    mutationFn: useConvexMutation(api.app.updateUsername),
  });
  const { mutateAsync: deleteCurrentUserAccount } = useMutation({
    mutationFn: useConvexMutation(api.app.deleteCurrentUserAccount),
  });
  const { doubleCheck, getButtonProps } = useDoubleCheck();

  const usernameForm = useForm({
    validatorAdapter: zodValidator(),
    defaultValues: {
      username: user?.username,
    },
    onSubmit: async ({ value }) => {
      await updateUsername({ username: value.username || "" });
    },
  });

  const handleDeleteAccount = async () => {
    await deleteCurrentUserAccount({});
    signOut();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      {/* Username */}
      <form
        className="flex w-full flex-col items-start rounded-lg border border-border bg-card"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          usernameForm.handleSubmit();
        }}
      >
        <div className="flex w-full flex-col gap-4 rounded-lg p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-medium text-foreground">{t("profile.username.title")}</h2>
            <p className="text-sm font-normal text-muted-foreground">
              {t("profile.username.description")}
            </p>
          </div>
          <usernameForm.Field
            name="username"
            validators={{
              onSubmit: validators.username,
            }}
            children={(field) => (
              <Input
                placeholder={t("profile.username.placeholder")}
                autoComplete="off"
                required
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                className={`w-80 bg-transparent ${
                  field.state.meta?.errors.length > 0 &&
                  "border-destructive focus-visible:ring-destructive"
                }`}
              />
            )}
          />
          {usernameForm.state.fieldMeta.username?.errors.length > 0 && (
            <p className="text-sm text-destructive dark:text-destructive-foreground">
              {usernameForm.state.fieldMeta.username?.errors.join(" ")}
            </p>
          )}
        </div>
        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-t border-border bg-secondary px-6 dark:bg-card">
          <p className="text-sm font-normal text-muted-foreground">
            {t("profile.username.maxChars")}
          </p>
          <Button type="submit" size="sm">
            {t("profile.username.save")}
          </Button>
        </div>
      </form>

      {/* Delete Account */}
      <div className="flex w-full flex-col items-start rounded-lg border border-destructive bg-card">
        <div className="flex flex-col gap-2 p-6">
          <h2 className="text-xl font-medium text-foreground">{t("profile.deleteAccount.title")}</h2>
          <p className="text-sm font-normal text-muted-foreground">
            {t("profile.deleteAccount.description")}
          </p>
        </div>
        <div className="flex min-h-14 w-full items-center justify-between rounded-lg rounded-t-none border-t border-border bg-red-500/10 px-6 dark:bg-red-500/10">
          <p className="text-sm font-normal text-muted-foreground">
            {t("profile.deleteAccount.warning")}
          </p>
          <Button
            size="sm"
            variant="destructive"
            {...getButtonProps({
              onClick: doubleCheck ? handleDeleteAccount : undefined,
            })}
          >
            {doubleCheck ? t("profile.deleteAccount.confirm") : t("profile.deleteAccount.button")}
          </Button>
        </div>
      </div>
    </div>
  );
}
