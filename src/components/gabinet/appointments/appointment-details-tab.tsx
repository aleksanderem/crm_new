import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  DollarSign,
  Heart,
  Inbox,
  MessageSquare,
  Send,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Stethoscope,
  UserCircle,
} from "@/lib/ez-icons";
import { formatCurrencyPLN } from "@/lib/format-currency";
import {
  plateJsonToText,
  RichTextEditor,
} from "@/components/gabinet/rich-text-editor";
import { TreatmentPicker } from "@/components/gabinet/appointment-shared/treatment-picker";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";

type TreatmentListItem = {
  _id: string;
  name: string;
  duration: number;
  price?: number;
  currency?: string;
};

type JunctionTreatment = {
  id: string;
  treatmentId: string;
  variantId?: string | null;
  variantName?: string | null;
  priceAtBooking?: number | null;
};

type TreatmentVariant = {
  _id: string;
  name: string;
  resolvedPrice: number | null;
  resolvedDuration: number | null;
};

type SmsSummary = {
  labelKey: string;
  tone: "default" | "destructive" | "secondary" | "outline";
};

type SmsEvent = Record<string, unknown>;

export function AppointmentDetailsTab({
  appointment,
  treatment,
  employee,
  junctionTreatments,
  treatmentsList,
  smsSummary,
  latestOutboundSms,
  latestInboundSms,
  internalNotes,
  isSavingNotes,
  canEdit,
  isSavingTreatment,
  editTreatmentId,
  editVariantId,
  editTreatmentVariants,
  treatmentPickerOpen,
  treatmentSearch,
  onTreatmentPickerOpenChange,
  onTreatmentSearchChange,
  onTreatmentSelect,
  onVariantSelect,
  onInternalNotesChange,
  onSaveInternalNotes,
  onMarkContraindicationReviewed,
  calculateDuration,
  getEmployeeName,
  getEmployeeInitials,
  t,
}: {
  appointment: Record<string, unknown>;
  treatment: Record<string, unknown> | null | undefined;
  employee: Record<string, unknown> | null | undefined;
  junctionTreatments: JunctionTreatment[];
  treatmentsList: TreatmentListItem[] | undefined;
  smsSummary: SmsSummary;
  latestOutboundSms: SmsEvent | undefined;
  latestInboundSms: SmsEvent | undefined;
  internalNotes: string;
  isSavingNotes: boolean;
  canEdit: boolean;
  isSavingTreatment: boolean;
  editTreatmentId: string;
  editVariantId: string;
  editTreatmentVariants: TreatmentVariant[] | undefined;
  treatmentPickerOpen: boolean;
  treatmentSearch: string;
  onTreatmentPickerOpenChange: (open: boolean) => void;
  onTreatmentSearchChange: (search: string) => void;
  onTreatmentSelect: (id: string) => void;
  onVariantSelect: (id: string) => void;
  onInternalNotesChange: (val: string) => void;
  onSaveInternalNotes: () => void;
  onMarkContraindicationReviewed: () => void;
  calculateDuration: () => number;
  getEmployeeName: () => string;
  getEmployeeInitials: () => string;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Treatment Info Card */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4" variant="stroke" />
            {t("gabinet.treatments.treatment")}
          </CardTitle>
        </CardHeader>
        {junctionTreatments.length > 1 ? (
          /* Multi-treatment: one row per junction entry, totals at bottom */
          <CardContent className="space-y-0 divide-y divide-border px-6 py-0">
            {junctionTreatments.map((jt) => {
              const tr = treatmentsList?.find((t) => t._id === jt.treatmentId);
              const name = tr?.name ?? (treatment?.name as string | undefined) ?? "-";
              const price = jt.priceAtBooking ?? tr?.price ?? null;
              return (
                <div
                  key={jt.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <span className="text-sm font-medium">{name}</span>
                      {jt.variantName && (
                        <span className="block text-xs text-muted-foreground">{jt.variantName}</span>
                      )}
                    </div>
                  </div>
                  {price != null && (
                    <span className="text-sm text-muted-foreground">
                      {formatCurrencyPLN(price)}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between py-3 font-semibold">
              <span className="text-sm">
                {t("gabinet.appointments.totalDuration", "Łącznie")} ·{" "}
                {calculateDuration()} min
              </span>
              <span className="text-sm">
                {formatCurrencyPLN(
                  junctionTreatments.reduce((sum, jt) => {
                    const tr = treatmentsList?.find(
                      (t) => t._id === jt.treatmentId,
                    );
                    return sum + (jt.priceAtBooking ?? tr?.price ?? 0);
                  }, 0),
                )}
              </span>
            </div>
          </CardContent>
        ) : (
          /* Single / legacy treatment */
          <CardContent className="space-y-3 px-6 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t("common.name")}
              </Label>
              {canEdit ? (
                <>
                  <TreatmentPicker
                    treatments={treatmentsList}
                    value={editTreatmentId}
                    onSelect={(id) => {
                      onTreatmentSelect(id);
                      onTreatmentPickerOpenChange(false);
                      onTreatmentSearchChange("");
                    }}
                    open={treatmentPickerOpen}
                    onOpenChange={onTreatmentPickerOpenChange}
                    search={treatmentSearch}
                    onSearchChange={onTreatmentSearchChange}
                    formatPrice={(price, currency) =>
                      formatCurrencyPLN(price ?? 0, currency ?? "PLN")
                    }
                    placeholder={t("gabinet.appointments.selectTreatment")}
                    searchPlaceholder={t("gabinet.appointments.searchTreatment")}
                    emptyText={t("common.noResults")}
                    closeLabel={t("common.close")}
                    selectedLabel={
                      junctionTreatments[0]?.variantName
                        ? `${(treatment?.name as string | undefined) ?? ""} — ${junctionTreatments[0].variantName}`
                        : (treatment?.name as string | undefined)
                    }
                    triggerIcon={
                      <Stethoscope className="size-4 shrink-0 text-primary" />
                    }
                    disabled={isSavingTreatment}
                  />
                  {editTreatmentVariants && editTreatmentVariants.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t("gabinet.treatments.variant", "Wariant")}
                      </Label>
                      <Select
                        value={editVariantId || "__none__"}
                        onValueChange={(v) => onVariantSelect(v === "__none__" ? "" : v)}
                        disabled={isSavingTreatment}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            {t("gabinet.appointments.noVariant", "Bez wariantu")}
                          </SelectItem>
                          {editTreatmentVariants.map((v) => (
                            <SelectItem key={v._id} value={v._id}>
                              <div className="flex flex-col">
                                <span>{v.name}</span>
                                {v.resolvedPrice != null && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatCurrencyPLN(v.resolvedPrice)}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 shrink-0 text-primary" />
                  <div>
                    <span className="text-sm font-medium">
                      {(treatment?.name as string | undefined) ?? "-"}
                    </span>
                    {junctionTreatments[0]?.variantName && (
                      <span className="block text-xs text-muted-foreground">
                        {junctionTreatments[0].variantName}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.treatments.duration")}
              </span>
              <span className="font-medium">{calculateDuration()} min</span>
            </div>
            {(junctionTreatments[0]?.priceAtBooking ?? treatment?.price) != null && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t("common.price")}
                </span>
                <span className="font-medium">
                  {formatCurrencyPLN(
                    (junctionTreatments[0]?.priceAtBooking ?? treatment?.price) as number,
                    (treatment?.currency as string | undefined) ?? "PLN",
                  )}
                </span>
              </div>
            )}
            {treatment?.description && (
              <div className="pt-2">
                <span className="text-sm text-muted-foreground">
                  {t("common.description")}
                </span>
                <p className="text-sm mt-1">
                  {plateJsonToText(treatment.description as string)}
                </p>
              </div>
            )}
            {treatment?.contraindications && (
              <div className="pt-2 p-3 bg-destructive/10 rounded-lg">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 text-destructive">
                    <ShieldAlert className="h-4 w-4" variant="stroke" />
                    <span className="text-sm font-medium">
                      {t("gabinet.treatments.contraindications")}
                    </span>
                  </div>
                  {(appointment.contraindicationAlertsReviewed as boolean | undefined) ? (
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle className="h-3.5 w-3.5" variant="stroke" />
                      <span>
                        {t(
                          "gabinet.appointmentDetail.contraindicationDiscussed",
                          "Omówiono",
                        )}
                      </span>
                    </div>
                  ) : canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={onMarkContraindicationReviewed}
                    >
                      {t(
                        "gabinet.appointmentDetail.markContraindicationAsDiscussed",
                        "Oznacz jako omówione",
                      )}
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm">
                  {plateJsonToText(treatment.contraindications as string)}
                </p>
              </div>
            )}
            {!!(treatment as Record<string, unknown>)?.aftercare && (
              <div className="pt-2 p-3 bg-primary/10 rounded-lg">
                <div className="flex items-center gap-2 text-primary mb-1">
                  <Heart className="h-4 w-4" variant="stroke" />
                  <span className="text-sm font-medium">
                    {t("gabinet.treatments.aftercare")}
                  </span>
                </div>
                <p className="text-sm">
                  {plateJsonToText(
                    (treatment as Record<string, unknown>).aftercare as string,
                  )}
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Employee Info Card */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserCircle className="h-4 w-4" variant="stroke" />
            {t("gabinet.employees.employee")}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-6 py-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback>{getEmployeeInitials()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{getEmployeeName()}</p>
              <p className="text-sm text-muted-foreground">
                {employee?.email as string | undefined}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SMS Confirmation Card */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" variant="stroke" />
            {t("gabinet.appointmentDetail.sms.title")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("gabinet.appointmentDetail.sms.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={smsSummary.tone}>{t(smsSummary.labelKey)}</Badge>
            <Badge
              variant="outline"
              className={appointmentStatusBadgeClass(appointment.status as string)}
            >
              {t(`gabinet.appointments.statuses.${appointment.status}`)}
            </Badge>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Send className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointmentDetail.sms.lastOutbound")}
              </div>
              {latestOutboundSms ? (
                <>
                  <p className="text-sm">
                    {latestOutboundSms.rawBody as string}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.appointmentDetail.sms.processingStatus")}:{" "}
                    {t(
                      `gabinet.appointmentDetail.sms.processingStatuses.${latestOutboundSms.processingStatus}`,
                    )}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.appointmentDetail.sms.noOutbound")}
                </p>
              )}
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Inbox className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointmentDetail.sms.lastInbound")}
              </div>
              {latestInboundSms ? (
                <>
                  <p className="text-sm">
                    {latestInboundSms.rawBody as string}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.appointmentDetail.sms.parsedIntent")}:{" "}
                    {t(
                      `gabinet.appointmentDetail.sms.intents.${latestInboundSms.parsedIntent ?? "unknown"}`,
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.appointmentDetail.sms.processingStatus")}:{" "}
                    {t(
                      `gabinet.appointmentDetail.sms.processingStatuses.${latestInboundSms.processingStatus}`,
                    )}
                  </p>
                  {latestInboundSms.processingError && (
                    <p className="text-xs text-muted-foreground">
                      {t("gabinet.appointmentDetail.sms.processingReason")}:{" "}
                      {latestInboundSms.processingError as string}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.appointmentDetail.sms.noInbound")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prepayment Status Card */}
      {(appointment.prepaymentRequired as boolean | undefined) && (
        <Card>
          <CardHeader className="px-6 py-3 border-b">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4" variant="stroke" />
              {t("gabinet.appointments.prepayment")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("gabinet.appointments.prepaymentAmount")}
              </span>
              <span className="font-medium">
                {formatCurrencyPLN((appointment.prepaymentAmount as number | undefined) ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("common.status")}
              </span>
              <Badge
                variant={
                  appointment.prepaymentStatus === "paid"
                    ? "default"
                    : "secondary"
                }
              >
                {appointment.prepaymentStatus === "paid"
                  ? t("gabinet.appointments.prepaymentPaid")
                  : t("gabinet.appointments.prepaymentPending")}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Internal Notes Card */}
      <Card>
        <CardHeader className="px-6 py-3 border-b">
          <CardTitle className="text-sm flex items-center gap-2">
            <StickyNote className="h-4 w-4" variant="stroke" />
            {t("gabinet.appointments.internalNotes")}
          </CardTitle>
          <CardDescription className="text-xs">
            {t("gabinet.appointments.internalNotesDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-6 py-4">
          <RichTextEditor
            placeholder={t("gabinet.appointments.internalNotesPlaceholder")}
            value={internalNotes}
            onChange={(val) => onInternalNotesChange(val ?? "")}
          />
          {canEdit && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={onSaveInternalNotes}
                disabled={isSavingNotes}
              >
                {isSavingNotes ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
