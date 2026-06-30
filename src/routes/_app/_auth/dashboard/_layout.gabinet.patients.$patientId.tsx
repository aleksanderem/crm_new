import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetPatient } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import {
  useSupabaseGabinetAppointmentsByPatient,
  useSupabaseGabinetAppointmentPackagePositions,
  useSupabaseGabinetAppointmentRecurringPositions,
} from "@/hooks/use-supabase-gabinet-appointments";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { useSupabaseGabinetLoyaltyBalance, useSupabaseGabinetLoyaltyTransactions } from "@/hooks/use-supabase-gabinet-loyalty";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import {
  useSupabaseGabinetPackageUsageByPatient,
  useSupabaseGabinetTreatmentPackagesList,
} from "@/hooks/use-supabase-gabinet-packages";
import { useSupabasePaymentsByPatient } from "@/hooks/use-supabase-payments";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Heart,
  Star,
  Trophy,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CreditCard,
  Pencil,
  WalletIcon,
  RefreshCw,
  Sparkles,
  ChevronDown,
} from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

import { useTranslation } from "react-i18next";
import { usePermission, useRole, PermissionGate } from "@/hooks/use-permission";
import { PatientPackagesCard } from "@/components/gabinet/patient-packages-card";
import { PatientTreatmentsCard } from "@/components/gabinet/patient-treatments-card";
import { PatientPhotosTab } from "@/components/gabinet/patient-photos-tab";
import { plateJsonToText } from "@/components/gabinet/rich-text-editor";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";
import { displayReferralSource } from "@/lib/options";
import { formatPhoneNumber } from "@/lib/phone";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { formatBirthDate } from "@/lib/format-date";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/patients/$patientId",
)({
  component: () => <PermissionGate feature="gabinet_patients" action="view"><PatientDetail /></PermissionGate>,
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const updatePatient = useAction(api.gabinet.patients.update);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const removePatient = useAction(api.gabinet.patients.remove);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const gdprErasePatient = useAction(api.gabinet.patients.gdprErase);
  const updatePaymentAction = useAction(api.payments.update);
  const createPaymentAction = useAction(api.payments.create);
  const cancelPaymentAction = useAction(api.payments.cancel);
  const getPatientCreditAction = useAction(api.payments.getPatientCredit);
  const refundCreditAction = useAction(api.payments.refundCredit);
  const requestRefundAuthAction = useAction(
    api.payments.requestRefundAuthorization,
  );
  const trackView = useAction(api.recentlyViewed.track);
  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);
  const queryClient = useQueryClient();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gdprDialogOpen, setGdprDialogOpen] = useState(false);
  const [gdprConfirmText, setGdprConfirmText] = useState("");
  const [isGdprSubmitting, setIsGdprSubmitting] = useState(false);
  // Issue #1928: collapse the "Last appointments" overview card by default on
  // mobile so other sections (medical info, status tiles) aren't pushed below
  // the fold. On desktop (md+) the section stays expanded — see JSX below.
  const [lastAppointmentsExpanded, setLastAppointmentsExpanded] = useState(false);

  // Tag and category definitions for the edit drawer PatientForm
  // (kept in sync with the patients list create-form props).
  const { tags: orgTags } = useTagDefinitions(organizationId);
  const { categories: patientCategories } = useCategoryDefinitions(
    organizationId,
    "gabinetPatient",
  );

  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentEditAmount, setPaymentEditAmount] = useState("");
  const [paymentEditMethod, setPaymentEditMethod] = useState<
    "cash" | "card" | "transfer" | "package" | "other"
  >("cash");
  const [paymentEditNotes, setPaymentEditNotes] = useState("");
  const [isPaymentEditSubmitting, setIsPaymentEditSubmitting] = useState(false);

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<
    "cash" | "card" | "transfer" | "other"
  >("cash");
  const [refundNotes, setRefundNotes] = useState("");
  const [isRefundSubmitting, setIsRefundSubmitting] = useState(false);

  // Issue #1690: Add Payment from patient page (no appointment required —
  // funds go straight into the credit balance via creditEarned).
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addPaymentAmount, setAddPaymentAmount] = useState("");
  const [addPaymentMethod, setAddPaymentMethod] = useState<
    "cash" | "card" | "transfer" | "other"
  >("cash");
  const [addPaymentNotes, setAddPaymentNotes] = useState("");
  const [addPaymentAppointmentId, setAddPaymentAppointmentId] =
    useState<string>("");
  const [isAddPaymentSubmitting, setIsAddPaymentSubmitting] = useState(false);

  // Cancel-payment confirm state.
  const [cancellingPaymentId, setCancellingPaymentId] = useState<string | null>(
    null,
  );
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelSubmitting, setIsCancelSubmitting] = useState(false);

  const { data: patient, isLoading } = useSupabaseGabinetPatient(
    organizationId,
    patientId,
  );

  useEffect(() => {
    if (patient && organizationId) {
      const label = `${patient.firstName} ${patient.lastName}`.trim();
      trackView({ organizationId, entityType: "gabinetPatients", entityId: patient._id, entityLabel: label });
    }
  }, [patient?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collapse app sidebar to icon-only so EntityDetailLayout sidebar has room
  const { setShellSidebarMode } = useSidebarSlot();
  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetPatient",
    patientId,
  );

  const { data: patientAppointments } = useSupabaseGabinetAppointmentsByPatient(
    organizationId,
    patientId,
  );

  const { data: loyaltyBalance } = useSupabaseGabinetLoyaltyBalance(
    organizationId,
    patientId,
  );

  const { data: loyaltyTransactions } = useSupabaseGabinetLoyaltyTransactions(
    organizationId,
    patientId,
  );

  const { data: treatmentsData } = useSupabaseGabinetTreatmentsList(organizationId);

  const { data: patientPayments } = useSupabasePaymentsByPatient(
    organizationId,
    patientId,
  );

  const { data: patientPackageUsage } = useSupabaseGabinetPackageUsageByPatient(
    organizationId,
    patientId,
  );

  const { data: treatmentPackages } = useSupabaseGabinetTreatmentPackagesList(
    organizationId,
  );

  const { data: patientDocuments } = useQuery({
    queryKey: [
      "documents.documents.listByEntity",
      organizationId,
      "patient",
      patientId,
    ],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType: "patient",
        entityId: patientId,
      }),
    enabled: !!organizationId && !!patientId,
  });

  const creditQueryKey = [
    "payments.getPatientCredit",
    organizationId,
    patientId,
  ] as const;
  const { data: patientCredit, refetch: refetchPatientCredit } = useQuery({
    queryKey: creditQueryKey,
    queryFn: () =>
      getPatientCreditAction({
        organizationId,
        patientId,
      }),
    enabled: !!organizationId && !!patientId,
  });

  // Issue #1690: refund and delete actions are gated by the new
  // gabinet_payments feature. Members of the org without `refund` permission
  // get a "request authorization" flow that pings owners/admins instead.
  const { allowed: canRefundCredit } = usePermission(
    "gabinet_payments",
    "refund",
  );
  const { allowed: canCancelPayment } = usePermission(
    "gabinet_payments",
    "delete",
  );
  const { allowed: canCreatePayment } = usePermission(
    "gabinet_payments",
    "create",
  );
  const { allowed: canViewPayments } = usePermission(
    "gabinet_payments",
    "view",
  );
  const { allowed: canViewPhotos } = usePermission(
    "gabinet_photos",
    "view",
  );
  const { role } = useRole();
  const canGdprErase = role === "owner" || role === "admin";

  const getPaymentForLabel = (payment: {
    appointmentId?: string;
    packageUsageId?: string;
    notes?: string;
  }): string => {
    if (payment.appointmentId) {
      const apt = patientAppointments?.find((a) => a._id === payment.appointmentId);
      const treatmentName = apt?.treatmentId
        ? treatmentsData?.find((tr) => tr._id === apt.treatmentId)?.name
        : undefined;
      if (treatmentName) return treatmentName;
    }
    if (payment.packageUsageId) {
      const usage = patientPackageUsage?.find((u) => u._id === payment.packageUsageId);
      const pkgName = usage
        ? treatmentPackages?.find((p) => p._id === usage.packageId)?.name
        : undefined;
      if (pkgName) return pkgName;
    }
    if (payment.notes) return payment.notes;
    return "—";
  };

  // Treatment-number indicator IDs ("X/Y" like in the calendar — issue #1086).
  // Package usage takes precedence; recurring series is the fallback.
  const packageUsageIds = Array.from(
    new Set(
      (patientAppointments ?? [])
        .map((a) => a.packageUsageId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const recurringGroupIds = Array.from(
    new Set(
      (patientAppointments ?? [])
        .map((a) => a.recurringGroupId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: packagePositions } =
    useSupabaseGabinetAppointmentPackagePositions(
      organizationId,
      packageUsageIds,
    );
  const { data: recurringPositions } =
    useSupabaseGabinetAppointmentRecurringPositions(
      organizationId,
      recurringGroupIds,
    );

  const getVisitCountLabel = (
    apt: MappedGabinetAppointment,
  ): { label: string; title: string } | null => {
    const pkgPos = apt.packageUsageId
      ? packagePositions?.get(apt._id)
      : undefined;
    if (pkgPos) {
      return {
        label: `${pkgPos.position}/${pkgPos.total}`,
        title: t(
          "gabinet.calendar.indicators.packageVisit",
          "Wizyta pakietowa",
        ),
      };
    }
    if (apt.isRecurring && apt.recurringRule) {
      const rule = apt.recurringRule as { count?: number };
      if (typeof rule.count === "number" && rule.count > 0) {
        const dynamicPos = apt.recurringGroupId
          ? recurringPositions?.get(apt._id)
          : undefined;
        const pos = dynamicPos ?? (apt.recurringIndex ?? 0) + 1;
        return {
          label: `${pos}/${rule.count}`,
          title: t(
            "gabinet.calendar.indicators.recurringVisit",
            "Wizyta cykliczna",
          ),
        };
      }
    }
    return null;
  };

  // Build fields for EntityDetailLayout sidebar
  const detailFields: DetailField[] = (() => {
    if (!patient) return [];
    const fields: DetailField[] = [];
    if (patient.email) fields.push({ label: t("common.email"), value: patient.email, fieldKey: "email" });
    if (patient.phone) fields.push({ label: t("common.phone"), value: formatPhoneNumber(patient.phone), fieldKey: "phone" });
    if (patient.gender) fields.push({ label: t("gabinet.patients.gender"), value: t(`gabinet.patients.genderOptions.${patient.gender}`), fieldKey: "gender" });
    if (patient.pesel) fields.push({ label: t("gabinet.patients.pesel"), value: patient.pesel, fieldKey: "pesel" });
    if (patient.address) {
      const patientAddr = patient.address as { street?: string; postalCode?: string; city?: string };
      const addr = [patientAddr.street, patientAddr.postalCode, patientAddr.city].filter(Boolean).join(", ");
      if (addr) fields.push({ label: t("gabinet.patients.address"), value: addr, fieldKey: "address" });
    }
    if (patient.referralSource) fields.push({ label: t("gabinet.patients.referralSource"), value: displayReferralSource(patient.referralSource, t), fieldKey: "referral" });
    if (patient.dateOfBirth) fields.push({ label: t("gabinet.patients.dateOfBirth"), value: formatBirthDate(patient.dateOfBirth), fieldKey: "dob" });
    if (patient.bloodType) fields.push({ label: t("gabinet.patients.bloodType"), value: <Badge variant="outline" className="text-[10px]">{patient.bloodType}</Badge>, fieldKey: "bloodType" });
    if (patient.allergies) fields.push({ label: t("gabinet.patients.allergies"), value: patient.allergies, fieldKey: "allergies" });
    return fields;
  })();

  // Sidebar extra: statistics + medical notes + packages
  const sidebarExtra = patient ? (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {t("gabinet.treatmentDetail.statistics")}
        </p>
        <div className="rounded-md border p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar size={12} variant="stroke" />
              {t("gabinet.patients.totalAppointments")}
            </span>
            <span className="text-xs font-semibold tabular-nums">{patientAppointments?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Trophy size={12} variant="stroke" />
              {t("gabinet.loyalty.balance")}
            </span>
            <span className="text-xs font-semibold tabular-nums">{loyaltyBalance?.balance ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CreditCard size={12} variant="stroke" />
              {t("gabinet.payments.totalSpent")}
            </span>
            <span className="text-xs font-semibold tabular-nums">
              {formatCurrencyPLN(
                (patientPayments ?? [])
                  .filter((p) => p.status === "completed")
                  .reduce((sum, p) => sum + (p.amount ?? 0), 0),
              )}
            </span>
          </div>
          {(() => {
            const unpaidCount = (patientPayments ?? []).filter(
              (p) => p.status === "pending" && p.kind !== "credit_refund",
            ).length;
            if (!unpaidCount) return null;
            return (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle size={12} variant="stroke" />
                  {t("gabinet.payments.unpaidAppointments")}
                </span>
                <span className="text-xs font-semibold tabular-nums text-destructive">
                  {unpaidCount}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
      {(() => {
        const medicalNotesText = plateJsonToText(patient.medicalNotes ?? undefined).trim();
        if (!medicalNotesText) return null;
        return (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("gabinet.patients.medicalNotes")}
            </p>
            <div className="rounded-md border p-2.5">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {medicalNotesText}
              </p>
            </div>
          </div>
        );
      })()}
      <PatientPackagesCard
        patientId={patientId}
        organizationId={organizationId}
      />
      <PatientTreatmentsCard
        patientId={patientId}
        organizationId={organizationId}
      />
    </div>
  ) : null;

  const fullName = patient
    ? `${patient.firstName} ${patient.lastName}`.trim()
    : "";

  const handleEditSubmit = async (formData: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    pesel?: string | null;
    dateOfBirth?: string | null;
    gender?: "male" | "female" | "other";
    address?: { street?: string; city?: string; postalCode?: string } | null;
    medicalNotes?: string | null;
    allergies?: string | null;
    bloodType?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    referralSource?: string | null;
    tagIds?: Id<"tagDefinitions">[];
    categoryId?: Id<"categoryDefinitions">;
  }) => {
    setIsSubmitting(true);
    try {
      await updatePatient({
        organizationId,
        patientId,
        ...formData,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.detail(organizationId, patientId) });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      setEditDrawerOpen(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.patients.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian klienta.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditPaymentDialog = (payment: {
    _id: string;
    amount: number;
    paymentMethod: string;
    notes?: string;
  }) => {
    setEditingPaymentId(payment._id);
    setPaymentEditAmount(String(payment.amount));
    const method = payment.paymentMethod as
      | "cash"
      | "card"
      | "transfer"
      | "package"
      | "other";
    setPaymentEditMethod(
      method === "cash" ||
        method === "card" ||
        method === "transfer" ||
        method === "package" ||
        method === "other"
        ? method
        : "cash",
    );
    setPaymentEditNotes(payment.notes ?? "");
  };

  const closeEditPaymentDialog = () => {
    setEditingPaymentId(null);
    setPaymentEditAmount("");
    setPaymentEditNotes("");
  };

  const handleUpdatePayment = async () => {
    if (!editingPaymentId) return;
    const normalized = paymentEditAmount.replace(",", ".").trim();
    const amount = parseFloat(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("gabinet.payments.amountRequired"));
      return;
    }
    setIsPaymentEditSubmitting(true);
    try {
      await updatePaymentAction({
        organizationId,
        paymentId: editingPaymentId,
        amount,
        paymentMethod: paymentEditMethod,
        notes: paymentEditNotes.trim() ? paymentEditNotes.trim() : null,
      });
      toast.success(t("gabinet.payments.updated"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.payments.all });
      closeEditPaymentDialog();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.error",
          defaultValue: "Wystąpił błąd.",
        }),
      );
    } finally {
      setIsPaymentEditSubmitting(false);
    }
  };

  const openRefundDialog = () => {
    const balance = patientCredit?.balance ?? 0;
    setRefundAmount(balance > 0 ? balance.toFixed(2) : "");
    setRefundMethod("cash");
    setRefundNotes("");
    setRefundDialogOpen(true);
  };

  const handleRefundCredit = async () => {
    const normalized = refundAmount.replace(",", ".").trim();
    const amount = parseFloat(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("gabinet.payments.amountRequired"));
      return;
    }
    const balance = patientCredit?.balance ?? 0;
    if (amount > balance + 0.005) {
      toast.error(t("gabinet.payments.credit.refundExceeds"));
      return;
    }
    setIsRefundSubmitting(true);
    try {
      await refundCreditAction({
        organizationId,
        patientId,
        amount,
        paymentMethod: refundMethod,
        notes: refundNotes.trim() ? refundNotes.trim() : undefined,
      });
      toast.success(t("gabinet.payments.credit.refundSuccess"));
      await refetchPatientCredit();
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.payments.all });
      setRefundDialogOpen(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.error",
          defaultValue: "Wystąpił błąd.",
        }),
      );
    } finally {
      setIsRefundSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t("gabinet.patients.confirmDelete"))) {
      await removePatient({
        organizationId,
        patientId,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      navigate({ to: "/dashboard/gabinet/patients" });
    }
  };

  const handleGdprErase = async () => {
    if (gdprConfirmText.trim().toUpperCase() !== "USUŃ") return;
    setIsGdprSubmitting(true);
    try {
      await gdprErasePatient({ organizationId, patientId });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.detail(organizationId, patientId) });
      setGdprDialogOpen(false);
      toast.success(t("gabinet.patients.gdprEraseSuccess", "Dane klienta zostały trwale usunięte (RODO)."));
      navigate({ to: "/dashboard/gabinet/patients" });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.error",
          defaultValue: "Wystąpił błąd podczas usuwania danych.",
        }),
      );
    } finally {
      setIsGdprSubmitting(false);
    }
  };

  // Issue #1690 — open the "Dodaj wpłatę" dialog from the patient page.
  const openAddPaymentDialog = () => {
    setAddPaymentAmount("");
    setAddPaymentMethod("cash");
    setAddPaymentNotes("");
    setAddPaymentAppointmentId("");
    setAddPaymentOpen(true);
  };

  const handleAddPayment = async () => {
    const normalized = addPaymentAmount.replace(",", ".").trim();
    const amount = parseFloat(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("gabinet.payments.amountRequired"));
      return;
    }
    setIsAddPaymentSubmitting(true);
    try {
      // No appointment selected → full amount goes to the patient's credit
      // balance (issue #1690 Q2). With an appointment selected, the backend
      // still credits any overpayment via creditEarned computed here.
      let creditEarned = 0;
      if (!addPaymentAppointmentId) {
        creditEarned = amount;
      } else {
        // Compute outstanding for the chosen appointment from completed
        // payments visible in patientPayments. Falls back to crediting the
        // whole amount when we can't price the visit.
        const apt = (patientAppointments ?? []).find(
          (a) => a._id === addPaymentAppointmentId,
        );
        const treatmentPrice =
          apt?.treatmentId
            ? treatmentsData?.find((tr) => tr._id === apt.treatmentId)?.price ??
              0
            : 0;
        // Credit applied to prior payments on this visit (issue #1059) counts
        // toward the paid total — without it, a visit already fully settled
        // from credit would look unpaid and any new cash payment would skip
        // the creditEarned overpayment routing (#1856).
        const paidForVisit = (patientPayments ?? [])
          .filter(
            (p) =>
              p.appointmentId === addPaymentAppointmentId &&
              p.status === "completed",
          )
          .reduce(
            (sum, p) =>
              sum +
              (p.amount ?? 0) +
              ((p as { creditApplied?: number | null }).creditApplied ?? 0),
            0,
          );
        const outstanding = Math.max(0, treatmentPrice - paidForVisit);
        if (amount > outstanding + 0.005) {
          creditEarned = Math.round((amount - outstanding) * 100) / 100;
        }
      }
      await createPaymentAction({
        organizationId,
        patientId,
        appointmentId: addPaymentAppointmentId || undefined,
        amount,
        currency: "PLN",
        paymentMethod: addPaymentMethod,
        notes: addPaymentNotes.trim() ? addPaymentNotes.trim() : undefined,
        creditEarned: creditEarned > 0 ? creditEarned : undefined,
      });
      toast.success(t("gabinet.payments.created"));
      setAddPaymentOpen(false);
      await refetchPatientCredit();
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.payments.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.error",
          defaultValue: "Wystąpił błąd.",
        }),
      );
    } finally {
      setIsAddPaymentSubmitting(false);
    }
  };

  const openCancelDialog = (paymentId: string) => {
    setCancellingPaymentId(paymentId);
    setCancelReason("");
  };

  const handleCancelPayment = async () => {
    if (!cancellingPaymentId) return;
    setIsCancelSubmitting(true);
    try {
      await cancelPaymentAction({
        organizationId,
        paymentId: cancellingPaymentId,
        reason: cancelReason.trim() ? cancelReason.trim() : undefined,
      });
      toast.success(t("gabinet.payments.cancelled"));
      setCancellingPaymentId(null);
      setCancelReason("");
      await refetchPatientCredit();
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.payments.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.error",
          defaultValue: "Wystąpił błąd.",
        }),
      );
    } finally {
      setIsCancelSubmitting(false);
    }
  };

  // For users without refund permission — sends a request to admins instead
  // of executing the refund. Same dialog state as the regular refund.
  const handleRequestRefundAuthorization = async () => {
    const normalized = refundAmount.replace(",", ".").trim();
    const amount = parseFloat(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("gabinet.payments.amountRequired"));
      return;
    }
    setIsRefundSubmitting(true);
    try {
      await requestRefundAuthAction({
        organizationId,
        patientId,
        amount,
        notes: refundNotes.trim() ? refundNotes.trim() : undefined,
      });
      toast.success(t("gabinet.payments.credit.refundRequestSent"));
      setRefundDialogOpen(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "common.error",
          defaultValue: "Wystąpił błąd.",
        }),
      );
    } finally {
      setIsRefundSubmitting(false);
    }
  };

  // --- Tabs ---
  const today = new Date().toISOString().split("T")[0];
  const upcomingAppointments = (patientAppointments ?? [])
    .filter(
      (apt) =>
        apt.date >= today &&
        apt.status !== "cancelled" &&
        apt.status !== "no_show",
    )
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 3);
  const pastAppointments = (patientAppointments ?? [])
    .filter((apt) => apt.date < today)
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
    .slice(0, 3);
  // Allergies and bloodType are already shown in the Details sidebar (which is
  // stacked above the tabs on mobile) — see #1927. Keep the "medical info" card
  // dedicated to emergency contact so the same data isn't presented twice.
  const hasMedicalInfo = Boolean(
    patient?.emergencyContactName || patient?.emergencyContactPhone,
  );

  // Issue #1894: Beauty plan history — chronological list of `interviewNotes`
  // entered on past appointments. Each entry shows what was proposed and when.
  const beautyPlanEntries = (patientAppointments ?? [])
    .filter((apt) => plateJsonToText(apt.interviewNotes).trim().length > 0)
    .sort((a, b) =>
      (b.date + b.startTime).localeCompare(a.date + a.startTime),
    );

  const renderAppointmentRow = (apt: MappedGabinetAppointment) => {
    const treatmentName = treatmentsData?.find(
      (tr) => tr._id === apt.treatmentId,
    )?.name;
    const visitCount = getVisitCountLabel(apt);
    return (
      <div
        key={apt._id}
        className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() =>
          navigate({
            to: "/dashboard/gabinet/appointments/$appointmentId",
            params: { appointmentId: apt._id },
          })
        }
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Calendar className="h-4 w-4 text-primary" variant="stroke" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium truncate">
              {treatmentName ?? t("common.unknown")}
            </p>
            {visitCount && (
              <Badge
                variant="outline"
                title={visitCount.title}
                className="shrink-0 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-300"
              >
                {visitCount.label}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {apt.date} &middot; {apt.startTime}–{apt.endTime}
          </p>
        </div>
        <Badge
          variant="outline"
          className={appointmentStatusBadgeClass(apt.status)}
        >
          {t(`gabinet.appointments.statuses.${apt.status}`)}
        </Badge>
      </div>
    );
  };

  const tabs = [
    {
      label: t("gabinet.patients.tabs.overview"),
      content: (
        // Issue #1931: on mobile, push the Status/Dodano/Pochodzenie tiles to
        // the very bottom so the primary patient sections (upcoming, history,
        // medical info) come first. Desktop layout is unchanged via md:order-none.
        <div className="flex flex-col space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar
                  className="h-4 w-4 text-muted-foreground"
                  variant="stroke"
                />
                {t("gabinet.patients.upcomingAppointments")}
              </h3>
              {upcomingAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.patients.noUpcomingAppointments")}
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingAppointments.map(renderAppointmentRow)}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="order-last grid gap-4 sm:grid-cols-3 md:order-none">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Heart
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("common.status")}
                    </p>
                    <p className="font-medium">
                      {patient?.isActive
                        ? t("common.active")
                        : t("common.inactive")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Calendar
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.patients.added")}
                    </p>
                    <p className="font-medium">
                      {patient
                        ? new Date(patient.createdAt).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Star
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.patients.referralSource")}
                    </p>
                    <p className="font-medium">
                      {patient?.referralSource ? displayReferralSource(patient.referralSource, t) : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <button
                type="button"
                onClick={() => setLastAppointmentsExpanded((v) => !v)}
                aria-expanded={lastAppointmentsExpanded}
                className="flex w-full items-center justify-between gap-2 text-left md:hidden"
              >
                <span className="text-sm font-semibold flex items-center gap-2">
                  <Calendar
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  {t("gabinet.patients.lastAppointments")}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    lastAppointmentsExpanded && "rotate-180",
                  )}
                  variant="stroke"
                />
              </button>
              <h3 className="hidden text-sm font-semibold md:flex items-center gap-2">
                <Calendar
                  className="h-4 w-4 text-muted-foreground"
                  variant="stroke"
                />
                {t("gabinet.patients.lastAppointments")}
              </h3>
              <div
                className={cn(
                  "space-y-4",
                  !lastAppointmentsExpanded && "hidden md:block",
                )}
              >
                {pastAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("gabinet.patients.noHistoryDesc")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pastAppointments.map(renderAppointmentRow)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Heart
                  className="h-4 w-4 text-muted-foreground"
                  variant="stroke"
                />
                {t("gabinet.patients.medicalInfo")}
              </h3>
              {!hasMedicalInfo ? (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.patients.noMedicalInfo")}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(patient?.emergencyContactName ||
                    patient?.emergencyContactPhone) && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.patients.emergencyContact")}
                      </p>
                      <p className="text-sm font-medium">
                        {[
                          patient.emergencyContactName,
                          patient.emergencyContactPhone
                            ? formatPhoneNumber(patient.emergencyContactPhone)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      label: t("gabinet.patients.tabs.appointments"),
      count: patientAppointments?.length,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {t("gabinet.patients.tabs.appointments")}
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate({ to: "/dashboard/gabinet/calendar" })
              }
            >
              <Plus className="mr-1 h-4 w-4" variant="stroke" />
              {t("gabinet.appointments.createAppointment")}
            </Button>
          </div>
          {!patientAppointments ||
          patientAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("gabinet.appointments.noAppointments")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...patientAppointments]
                .sort((a, b) =>
                  (b.date + b.startTime).localeCompare(
                    a.date + a.startTime,
                  ),
                )
                .map((apt) => {
                  const treatmentName = treatmentsData?.find(
                    (tr) => tr._id === apt.treatmentId,
                  )?.name;
                  const isPast =
                    apt.date < new Date().toISOString().split("T")[0];
                  const visitCount = getVisitCountLabel(apt);
                  return (
                    <div
                      key={apt._id}
                      className={`flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors ${isPast ? "opacity-60" : ""}`}
                      onClick={() =>
                        navigate({
                          to: "/dashboard/gabinet/appointments/$appointmentId",
                          params: { appointmentId: apt._id },
                        })
                      }
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Calendar
                          className="h-4 w-4 text-primary"
                          variant="stroke"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {treatmentName ?? t("common.unknown")}
                          </p>
                          {visitCount && (
                            <Badge
                              variant="outline"
                              title={visitCount.title}
                              className="shrink-0 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-300"
                            >
                              {visitCount.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {apt.date} &middot; {apt.startTime}–
                          {apt.endTime}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={appointmentStatusBadgeClass(apt.status)}
                      >
                        {t(
                          `gabinet.appointments.statuses.${apt.status}`,
                        )}
                      </Badge>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ),
    },
    {
      label: t("gabinet.patients.tabs.beautyPlan", "Beauty plan"),
      count: beautyPlanEntries.length,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles
                className="h-4 w-4 text-muted-foreground"
                variant="stroke"
              />
              {t("gabinet.patients.beautyPlan.title", "Historia beauty plan")}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "gabinet.patients.beautyPlan.description",
              "Plany zabiegowe zaproponowane podczas wizyt — najnowsze na górze.",
            )}
          </p>
          {beautyPlanEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t(
                  "gabinet.patients.beautyPlan.empty",
                  "Brak beauty plan. Plany dodane w zakładce „Notatki z wizyty” pojawią się tutaj.",
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {beautyPlanEntries.map((apt) => {
                const treatmentName = treatmentsData?.find(
                  (tr) => tr._id === apt.treatmentId,
                )?.name;
                const planText = plateJsonToText(apt.interviewNotes).trim();
                return (
                  <Card
                    key={apt._id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/gabinet/appointments/$appointmentId",
                        params: { appointmentId: apt._id },
                        search: { tab: "documentation" },
                      })
                    }
                  >
                    <CardContent className="pt-4 pb-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Calendar
                            className="h-4 w-4 text-muted-foreground shrink-0"
                            variant="stroke"
                          />
                          <p className="text-sm font-medium truncate">
                            {treatmentName ?? t("common.unknown")}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {apt.date} · {apt.startTime}
                        </p>
                      </div>
                      <p className="text-sm whitespace-pre-wrap text-foreground">
                        {planText}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ),
    },
    ...(canViewPhotos ? [{
      label: t("gabinet.patients.tabs.photos", "Zdjęcia"),
      count: (patientAppointments ?? []).reduce(
        (sum, apt) =>
          sum + (Array.isArray(apt.photos) ? apt.photos.length : 0),
        0,
      ),
      content: (
        <PatientPhotosTab
          organizationId={organizationId}
          appointments={patientAppointments}
          treatments={treatmentsData}
        />
      ),
    }] : []),
    ...(canViewPayments ? [{
      // Issue #1690: one merged tab — wpłaty, saldo, naliczenia, zwroty in
      // a single chronological table with a "Typ" column.
      label: t("gabinet.payments.payments"),
      count: patientPayments?.length ?? 0,
      content: (() => {
        const completedPayments = (patientPayments ?? []).filter(
          (p) => p.status === "completed" && p.kind !== "credit_refund",
        );
        const totalSpent = completedPayments.reduce(
          (sum, p) => sum + (p.amount ?? 0),
          0,
        );
        const pendingPayments = (patientPayments ?? []).filter(
          (p) => p.status === "pending",
        );
        const outstanding = pendingPayments.reduce(
          (sum, p) => sum + (p.amount ?? 0),
          0,
        );
        const balance = patientCredit?.balance ?? 0;

        type PaymentRowType =
          | "payment"
          | "overpayment"
          | "credit_applied"
          | "credit_refund"
          | "cancelled"
          | "refunded";

        const classifyPayment = (p: NonNullable<typeof patientPayments>[number]) => {
          const earned = p.creditEarned ?? 0;
          const applied = p.creditApplied ?? 0;
          if (p.kind === "credit_refund") return "credit_refund" as const;
          if (p.status === "cancelled") return "cancelled" as const;
          if (p.status === "refunded") return "refunded" as const;
          if (earned > 0) return "overpayment" as const;
          if (applied > 0) return "credit_applied" as const;
          return "payment" as const;
        };

        const typeLabelKey: Record<PaymentRowType, string> = {
          payment: "gabinet.payments.types.payment",
          overpayment: "gabinet.payments.types.overpayment",
          credit_applied: "gabinet.payments.types.creditApplied",
          credit_refund: "gabinet.payments.types.creditRefund",
          cancelled: "gabinet.payments.types.cancelled",
          refunded: "gabinet.payments.types.refunded",
        };

        const typeBadgeClass: Record<PaymentRowType, string> = {
          payment: "",
          overpayment:
            "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300",
          credit_applied:
            "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300",
          credit_refund:
            "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
          cancelled:
            "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800/60 dark:bg-gray-950/40 dark:text-gray-300",
          refunded:
            "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300",
        };

        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <WalletIcon
                      className="h-4 w-4 text-emerald-600"
                      variant="stroke"
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.credit.available")}
                      </p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatCurrencyPLN(balance)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CreditCard
                      className="h-4 w-4 text-green-600"
                      variant="stroke"
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.totalSpent")}
                      </p>
                      <p className="text-2xl font-bold">
                        {formatCurrencyPLN(totalSpent)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CreditCard
                      className="h-4 w-4 text-amber-600"
                      variant="stroke"
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.outstanding")}
                      </p>
                      <p className="text-2xl font-bold">
                        {formatCurrencyPLN(outstanding)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col gap-2">
                    {canCreatePayment && (
                      <Button
                        size="sm"
                        onClick={openAddPaymentDialog}
                        className="w-full"
                      >
                        <Plus className="mr-1 h-4 w-4" variant="stroke" />
                        {t("gabinet.payments.addPayment")}
                      </Button>
                    )}
                    {balance > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={openRefundDialog}
                        className="w-full"
                      >
                        <RefreshCw className="mr-1 h-4 w-4" variant="stroke" />
                        {t("gabinet.payments.credit.refundCredit")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  {t("gabinet.payments.paymentHistory")}
                </h3>
                {!patientPayments || patientPayments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.payments.noPayments")}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 text-sm font-medium">
                            {t("common.date")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.type")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.for")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.method")}
                          </th>
                          <th className="text-right p-3 text-sm font-medium">
                            {t("gabinet.payments.amount")}
                          </th>
                          <th className="text-right p-3 text-sm font-medium">
                            {t("gabinet.payments.balanceDelta")}
                          </th>
                          <th className="text-right p-3 text-sm font-medium">
                            {t("common.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...patientPayments]
                          .sort((a, b) => b.createdAt - a.createdAt)
                          .map((payment) => {
                            const type = classifyPayment(payment);
                            const earned = payment.creditEarned ?? 0;
                            const applied = payment.creditApplied ?? 0;
                            const balanceDelta = earned - applied;
                            const isCancellable =
                              canCancelPayment &&
                              (payment.status === "completed" ||
                                payment.status === "pending");
                            const isEditable =
                              payment.status === "completed" ||
                              payment.status === "pending";
                            return (
                              <tr
                                key={payment._id}
                                className={`border-b last:border-0 hover:bg-muted/30 ${
                                  payment.appointmentId
                                    ? "cursor-pointer"
                                    : ""
                                }`}
                                onClick={() => {
                                  if (payment.appointmentId) {
                                    navigate({
                                      to: "/dashboard/gabinet/appointments/$appointmentId",
                                      params: {
                                        appointmentId: payment.appointmentId,
                                      },
                                    });
                                  }
                                }}
                              >
                                <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                                  {new Date(
                                    payment.createdAt,
                                  ).toLocaleDateString("pl-PL")}
                                </td>
                                <td className="p-3">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${typeBadgeClass[type]}`}
                                  >
                                    {t(typeLabelKey[type])}
                                  </Badge>
                                </td>
                                <td className="p-3 text-sm">
                                  <div
                                    className="max-w-[220px] truncate"
                                    title={getPaymentForLabel(payment)}
                                  >
                                    {getPaymentForLabel(payment)}
                                  </div>
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline">
                                    {t(
                                      `gabinet.payments.methods.${payment.paymentMethod}`,
                                    )}
                                  </Badge>
                                </td>
                                <td className="p-3 text-right font-medium tabular-nums">
                                  {formatCurrencyPLN(
                                    payment.amount,
                                    payment.currency ?? "PLN",
                                  )}
                                </td>
                                <td
                                  className={`p-3 text-right font-semibold tabular-nums ${
                                    balanceDelta > 0
                                      ? "text-emerald-600"
                                      : balanceDelta < 0
                                        ? "text-red-600"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {balanceDelta === 0
                                    ? "—"
                                    : `${balanceDelta > 0 ? "+" : "−"}${formatCurrencyPLN(Math.abs(balanceDelta))}`}
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex justify-end gap-1">
                                    {isEditable && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        aria-label={t("common.edit")}
                                        title={t(
                                          "gabinet.payments.editPayment",
                                        )}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEditPaymentDialog({
                                            _id: payment._id,
                                            amount: payment.amount,
                                            paymentMethod:
                                              payment.paymentMethod,
                                            notes: payment.notes,
                                          });
                                        }}
                                      >
                                        <Pencil
                                          className="h-4 w-4"
                                          variant="stroke"
                                        />
                                      </Button>
                                    )}
                                    {isCancellable && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive"
                                        aria-label={t("common.cancel")}
                                        title={t(
                                          "gabinet.payments.cancelPayment",
                                        )}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openCancelDialog(payment._id);
                                        }}
                                      >
                                        <Minus
                                          className="h-4 w-4"
                                          variant="stroke"
                                        />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })(),
    }] : []),
    {
      label: t("gabinet.patients.tabs.documents"),
      count: patientDocuments?.length ?? 0,
      content: (
        <EntityDocumentsTab
          entityType="patient"
          entityId={patientId}
          organizationId={organizationId}
        />
      ),
    },
    {
      label: t("gabinet.patients.tabs.loyalty"),
      content: (
        <div className="space-y-6">
          {/* Balance cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Trophy
                    className="h-4 w-4 text-yellow-500"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.loyalty.balance")}
                    </p>
                    <p className="text-2xl font-bold">
                      {loyaltyBalance?.balance ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowUpRight
                    className="h-4 w-4 text-green-500"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.loyalty.totalEarned")}
                    </p>
                    <p className="text-2xl font-bold">
                      {loyaltyBalance?.lifetimeEarned ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowDownRight
                    className="h-4 w-4 text-red-500"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.loyalty.totalSpent")}
                    </p>
                    <p className="text-2xl font-bold">
                      {loyaltyBalance?.lifetimeSpent ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {loyaltyBalance?.tier && (
            <div className="flex items-center gap-2">
              <Star
                className="h-4 w-4 text-yellow-500"
                variant="stroke"
              />
              <span className="text-sm font-medium">
                {t("gabinet.loyalty.tier")}:{" "}
                {t(`gabinet.loyalty.tiers.${loyaltyBalance.tier}`)}
              </span>
            </div>
          )}

          {/* Transaction history */}
          <div>
            <h4 className="text-sm font-semibold mb-3">
              {t("gabinet.loyalty.transactionHistory")}
            </h4>
            {!loyaltyTransactions ||
            loyaltyTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Star className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.loyalty.noTransactions")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...loyaltyTransactions]
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .slice(0, 20)
                  .map((tx) => (
                    <div
                      key={tx._id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          tx.type === "earn"
                            ? "bg-green-100 text-green-600"
                            : tx.type === "spend"
                              ? "bg-red-100 text-red-600"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {tx.type === "earn" ? (
                          <Plus
                            className="h-4 w-4"
                            variant="stroke"
                          />
                        ) : tx.type === "spend" ? (
                          <Minus
                            className="h-4 w-4"
                            variant="stroke"
                          />
                        ) : (
                          <Star
                            className="h-4 w-4"
                            variant="stroke"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {tx.reason}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString(
                            "pl-PL",
                          )}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          tx.type === "earn"
                            ? "text-green-600"
                            : tx.type === "spend"
                              ? "text-red-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {tx.type === "earn"
                          ? "+"
                          : tx.type === "spend"
                            ? "−"
                            : ""}
                        {tx.points}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      label: t("gabinet.patients.tabs.activity"),
      content: (
        <ActivityFeed
          entries={activitiesToFeedEntries((activities ?? []) as any[], t)}
          maxHeight="600px"
        />
      ),
    },
  ];

  return (
    <>
      <EntityDetailLayout
        isLoading={isLoading}
        notFound={!patient && !isLoading}
        onBack={() => navigate({ to: "/dashboard/gabinet/patients" })}
        title={fullName}
        subtitle={
          <span className="flex items-center gap-2">
            {t("gabinet.patients.patient")}
            {patient && !patient.isActive && (
              <Badge variant="outline" className="text-xs">{t("common.inactive")}</Badge>
            )}
          </span>
        }
        avatarFallback={patient ? `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase() : "?"}
        onEdit={() => setEditDrawerOpen(true)}
        secondaryActions={[
          { label: t("common.delete"), onClick: handleDelete, variant: "destructive" as const },
          ...(canGdprErase ? [{
            label: t("gabinet.patients.gdprErase", "RODO: Usuń dane"),
            onClick: () => { setGdprConfirmText(""); setGdprDialogOpen(true); },
            variant: "destructive" as const,
          }] : []),
        ]}
        fields={detailFields}
        expandedFieldCount={4}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
      />

      {/* Edit patient drawer */}
      {patient && (
        <SidePanel
          open={editDrawerOpen}
          onOpenChange={setEditDrawerOpen}
          title={t("common.edit")}
        >
          <PatientForm
            initialData={{
              firstName: patient.firstName,
              lastName: patient.lastName,
              email: patient.email,
              phone: patient.phone ?? undefined,
              pesel: patient.pesel ?? undefined,
              dateOfBirth: patient.dateOfBirth ?? undefined,
              gender: (patient.gender as "male" | "female" | "other" | undefined) ?? undefined,
              address: (patient.address as { street?: string; city?: string; postalCode?: string } | undefined) ?? undefined,
              medicalNotes: patient.medicalNotes ?? undefined,
              allergies: patient.allergies ?? undefined,
              bloodType: patient.bloodType ?? undefined,
              emergencyContactName: patient.emergencyContactName ?? undefined,
              emergencyContactPhone: patient.emergencyContactPhone ?? undefined,
              referralSource: patient.referralSource ?? undefined,
              tagIds: patient.tagIds as Id<"tagDefinitions">[] | undefined,
              categoryId: patient.categoryId as Id<"categoryDefinitions"> | undefined,
            }}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditDrawerOpen(false)}
            isSubmitting={isSubmitting}
            organizationId={organizationId}
            tagDefinitions={orgTags}
            categoryDefinitions={patientCategories}
          />
        </SidePanel>
      )}

      <Dialog
        open={editingPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) closeEditPaymentDialog();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.payments.editPayment")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.payments.editPaymentDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t("gabinet.payments.amount")}</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={paymentEditAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setPaymentEditAmount(v);
                  }
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>{t("gabinet.payments.method")}</Label>
              <Select
                value={paymentEditMethod}
                onValueChange={(v) =>
                  setPaymentEditMethod(
                    v as "cash" | "card" | "transfer" | "package" | "other",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    {t("gabinet.payments.methods.cash")}
                  </SelectItem>
                  <SelectItem value="card">
                    {t("gabinet.payments.methods.card")}
                  </SelectItem>
                  <SelectItem value="transfer">
                    {t("gabinet.payments.methods.transfer")}
                  </SelectItem>
                  <SelectItem value="package">
                    {t("gabinet.payments.methods.package")}
                  </SelectItem>
                  <SelectItem value="other">
                    {t("gabinet.payments.methods.other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("common.notes")}</Label>
              <Input
                type="text"
                value={paymentEditNotes}
                onChange={(e) => setPaymentEditNotes(e.target.value)}
                placeholder={t("gabinet.payments.notePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditPaymentDialog}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleUpdatePayment}
              disabled={isPaymentEditSubmitting}
            >
              {isPaymentEditSubmitting
                ? t("common.processing")
                : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={refundDialogOpen}
        onOpenChange={(open) => {
          if (!open) setRefundDialogOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {canRefundCredit
                ? t("gabinet.payments.credit.refundDialogTitle")
                : t("gabinet.payments.credit.requestRefundDialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {canRefundCredit
                ? t("gabinet.payments.credit.refundDialogDesc")
                : t("gabinet.payments.credit.requestRefundDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 p-2.5">
              <p className="text-xs text-muted-foreground">
                {t("gabinet.payments.credit.available")}
              </p>
              <p className="text-base font-semibold tabular-nums">
                {formatCurrencyPLN(patientCredit?.balance ?? 0)}
              </p>
            </div>
            <div>
              <Label>{t("gabinet.payments.credit.refundAmount")}</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setRefundAmount(v);
                  }
                }}
                placeholder="0.00"
              />
            </div>
            {canRefundCredit && (
              <div>
                <Label>{t("gabinet.payments.credit.refundMethod")}</Label>
                <Select
                  value={refundMethod}
                  onValueChange={(v) =>
                    setRefundMethod(
                      v as "cash" | "card" | "transfer" | "other",
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">
                      {t("gabinet.payments.methods.cash")}
                    </SelectItem>
                    <SelectItem value="card">
                      {t("gabinet.payments.methods.card")}
                    </SelectItem>
                    <SelectItem value="transfer">
                      {t("gabinet.payments.methods.transfer")}
                    </SelectItem>
                    <SelectItem value="other">
                      {t("gabinet.payments.methods.other")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t("gabinet.payments.credit.refundNotes")}</Label>
              <Input
                type="text"
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                placeholder={t("gabinet.payments.notePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRefundDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={
                canRefundCredit
                  ? handleRefundCredit
                  : handleRequestRefundAuthorization
              }
              disabled={isRefundSubmitting}
            >
              {isRefundSubmitting
                ? t("common.processing")
                : canRefundCredit
                  ? t("gabinet.payments.credit.refundConfirm")
                  : t("gabinet.payments.credit.requestRefundConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue #1690: Add a free-standing payment from the patient page. */}
      <Dialog
        open={addPaymentOpen}
        onOpenChange={(open) => {
          if (!open) setAddPaymentOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.payments.addPayment")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.payments.addPaymentPatientDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t("gabinet.payments.amount")}</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={addPaymentAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                    setAddPaymentAmount(v);
                  }
                }}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>{t("gabinet.payments.method")}</Label>
              <Select
                value={addPaymentMethod}
                onValueChange={(v) =>
                  setAddPaymentMethod(
                    v as "cash" | "card" | "transfer" | "other",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    {t("gabinet.payments.methods.cash")}
                  </SelectItem>
                  <SelectItem value="card">
                    {t("gabinet.payments.methods.card")}
                  </SelectItem>
                  <SelectItem value="transfer">
                    {t("gabinet.payments.methods.transfer")}
                  </SelectItem>
                  <SelectItem value="other">
                    {t("gabinet.payments.methods.other")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                {t("gabinet.payments.linkedAppointment")}{" "}
                <span className="text-xs text-muted-foreground">
                  ({t("common.optional")})
                </span>
              </Label>
              <Select
                value={addPaymentAppointmentId || "none"}
                onValueChange={(v) =>
                  setAddPaymentAppointmentId(v === "none" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("gabinet.payments.noAppointmentToCredit")}
                  </SelectItem>
                  {(() => {
                    const today = new Date().toISOString().split("T")[0];
                    const upcoming = (patientAppointments ?? [])
                      .filter(
                        (a) =>
                          a.date >= today &&
                          a.status !== "cancelled" &&
                          a.status !== "no_show",
                      )
                      .slice(0, 20);
                    return upcoming.map((apt) => {
                      const treatmentName =
                        treatmentsData?.find((tr) => tr._id === apt.treatmentId)
                          ?.name ?? t("common.unknown");
                      return (
                        <SelectItem key={apt._id} value={apt._id}>
                          {apt.date} · {apt.startTime} · {treatmentName}
                        </SelectItem>
                      );
                    });
                  })()}
                </SelectContent>
              </Select>
              {!addPaymentAppointmentId && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("gabinet.payments.fullAmountToCreditHint")}
                </p>
              )}
            </div>
            <div>
              <Label>{t("common.notes")}</Label>
              <Input
                type="text"
                value={addPaymentNotes}
                onChange={(e) => setAddPaymentNotes(e.target.value)}
                placeholder={t("gabinet.payments.notePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddPaymentOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleAddPayment}
              disabled={isAddPaymentSubmitting}
            >
              {isAddPaymentSubmitting
                ? t("common.processing")
                : t("gabinet.payments.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={gdprDialogOpen} onOpenChange={(open) => { if (!open) setGdprDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.patients.gdprEraseTitle", "Trwałe usunięcie danych (RODO)")}</DialogTitle>
            <DialogDescription>
              {t(
                "gabinet.patients.gdprEraseDesc",
                "Ta operacja trwale anonimizuje dane osobowe klienta: imię, nazwisko, e-mail, telefon, PESEL, adres, dane medyczne i kontakt alarmowy. Historię wizyt i płatności zostawiamy ze względów prawno-księgowych. Operacji nie można cofnąć.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>
                {t("gabinet.patients.gdprEraseConfirmLabel", 'Wpisz "USUŃ" aby potwierdzić')}
              </Label>
              <Input
                type="text"
                value={gdprConfirmText}
                onChange={(e) => setGdprConfirmText(e.target.value)}
                placeholder="USUŃ"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGdprDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleGdprErase}
              disabled={isGdprSubmitting || gdprConfirmText.trim().toUpperCase() !== "USUŃ"}
            >
              {isGdprSubmitting
                ? t("common.processing")
                : t("gabinet.patients.gdprEraseConfirm", "Usuń dane trwale")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue #1690: per-row soft-cancel (no hard delete — status flip). */}
      <Dialog
        open={cancellingPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancellingPaymentId(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("gabinet.payments.cancelPayment")}</DialogTitle>
            <DialogDescription>
              {t("gabinet.payments.cancelPaymentDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>
                {t("gabinet.payments.cancelReason")}{" "}
                <span className="text-xs text-muted-foreground">
                  ({t("common.optional")})
                </span>
              </Label>
              <Input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("gabinet.payments.cancelReasonPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancellingPaymentId(null);
                setCancelReason("");
              }}
            >
              {t("common.close")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelPayment}
              disabled={isCancelSubmitting}
            >
              {isCancelSubmitting
                ? t("common.processing")
                : t("gabinet.payments.cancelConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
