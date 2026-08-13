import { useState, useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import {
  getAppointmentTreatmentDisplay,
  getAppointmentJunctionPrice,
} from "@/lib/gabinet/appointment-display";
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
import {
  useSupabaseGabinetLoyaltyBalance,
  useSupabaseGabinetLoyaltyTransactions,
} from "@/hooks/use-supabase-gabinet-loyalty";
import {
  useSupabaseGabinetTreatmentsList,
  useSupabaseGabinetAllTreatmentVariants,
} from "@/hooks/use-supabase-gabinet-treatments";
import {
  useSupabaseGabinetPackageUsageByPatient,
  useSupabaseGabinetTreatmentPackagesList,
} from "@/hooks/use-supabase-gabinet-packages";
import { useSupabasePaymentsByPatient } from "@/hooks/use-supabase-payments";
import { useSupabaseGabinetReceiptsByPatient } from "@/hooks/use-supabase-gabinet-receipts";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PatientPhotosTab } from "@/components/gabinet/patient-photos-tab";
import { plateJsonToText } from "@/components/gabinet/rich-text-editor";
import { displayReferralSource } from "@/lib/options";
import { formatPhoneNumber } from "@/lib/phone";
import { formatBirthDate } from "@/lib/format-date";
import { useTranslation } from "react-i18next";
import { usePermission, useRole, PermissionGate } from "@/hooks/use-permission";
import { PatientOverviewTab } from "@/components/gabinet/patients/patient-overview-tab";
import { PatientAppointmentsTab } from "@/components/gabinet/patients/patient-appointments-tab";
import { PatientBeautyPlanTab } from "@/components/gabinet/patients/patient-beauty-plan-tab";
import { PatientPaymentsTab } from "@/components/gabinet/patients/patient-payments-tab";
import { PatientBillingTab } from "@/components/gabinet/patients/patient-billing-tab";
import { PatientLoyaltyTab } from "@/components/gabinet/patients/patient-loyalty-tab";
import { PatientSidebarExtra } from "@/components/gabinet/patients/patient-sidebar-extra";
import { EditPaymentDialog } from "@/components/gabinet/patients/edit-payment-dialog";
import { RefundCreditDialog } from "@/components/gabinet/patients/refund-credit-dialog";
import { AddPaymentDialog } from "@/components/gabinet/patients/add-payment-dialog";
import { GdprEraseDialog } from "@/components/gabinet/patients/gdpr-erase-dialog";
import { CancelPaymentDialog } from "@/components/gabinet/patients/cancel-payment-dialog";

function PatientDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/patients/$patientId",
)({
  component: () => (
    <PermissionGate
      feature="gabinet_patients"
      action="view"
      loadingFallback={<PatientDetailSkeleton />}
    >
      <PatientDetail />
    </PermissionGate>
  ),
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { allowed: canEdit } = usePermission("gabinet_patients", "edit");
  const { allowed: canDelete } = usePermission("gabinet_patients", "delete");
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
  const generatePdfReceiptAction = useAction(
    api.gabinet.receipts.generatePdfReceipt,
  );
  const trackView = useAction(api.recentlyViewed.track);
  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const getLatestSignedIntakeByPatientAction = useAction(
    api.documents.documents.getLatestSignedIntakeByPatient,
  );
  const queryClient = useQueryClient();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gdprDialogOpen, setGdprDialogOpen] = useState(false);
  const [gdprConfirmText, setGdprConfirmText] = useState("");
  const [isGdprSubmitting, setIsGdprSubmitting] = useState(false);
  // Issue #1928: collapse the "Last appointments" overview card by default on
  // mobile so other sections (medical info, status tiles) aren't pushed below
  // the fold. On desktop (md+) the section stays expanded.
  const [lastAppointmentsExpanded, setLastAppointmentsExpanded] =
    useState(false);

  const { tags: orgTags } = useTagDefinitions(organizationId);
  const { categories: patientCategories } = useCategoryDefinitions(
    organizationId,
    "gabinetPatient",
  );

  const [generatingReceiptFor, setGeneratingReceiptFor] = useState<string | null>(null);

  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentEditAmount, setPaymentEditAmount] = useState("");
  const [paymentEditMethod, setPaymentEditMethod] = useState<
    "cash" | "card" | "transfer" | "package" | "other"
  >("cash");
  const [paymentEditNotes, setPaymentEditNotes] = useState("");
  const [paymentEditAppointmentId, setPaymentEditAppointmentId] = useState<
    string | null
  >(null);
  const [paymentEditDiscountType, setPaymentEditDiscountType] = useState<
    "amount" | "percent"
  >("amount");
  const [paymentEditDiscountValue, setPaymentEditDiscountValue] = useState("");
  const [isPaymentEditSubmitting, setIsPaymentEditSubmitting] = useState(false);

  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState<
    "cash" | "card" | "transfer" | "other"
  >("cash");
  const [refundNotes, setRefundNotes] = useState("");
  const [isRefundSubmitting, setIsRefundSubmitting] = useState(false);

  // Issue #1690: Add Payment from patient page (no appointment required).
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [addPaymentAmount, setAddPaymentAmount] = useState("");
  const [addPaymentMethod, setAddPaymentMethod] = useState<
    "cash" | "card" | "transfer" | "other"
  >("cash");
  const [addPaymentNotes, setAddPaymentNotes] = useState("");
  const [addPaymentAppointmentId, setAddPaymentAppointmentId] =
    useState<string>("");
  const [isAddPaymentSubmitting, setIsAddPaymentSubmitting] = useState(false);
  const [addPaymentDiscountType, setAddPaymentDiscountType] = useState<
    "amount" | "percent"
  >("amount");
  const [addPaymentDiscountValue, setAddPaymentDiscountValue] = useState("");

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
      trackView({
        organizationId,
        entityType: "gabinetPatients",
        entityId: patient._id,
        entityLabel: label,
      });
    }
  }, [patient?._id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { data: loyaltyActivities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetLoyalty",
    loyaltyBalance?._id,
    { enabled: !!loyaltyBalance?._id },
  );

  const { data: loyaltyTransactions } = useSupabaseGabinetLoyaltyTransactions(
    organizationId,
    patientId,
  );

  const { data: treatmentsData } =
    useSupabaseGabinetTreatmentsList(organizationId);
  const { data: allVariantsData } =
    useSupabaseGabinetAllTreatmentVariants(organizationId);

  const variantNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (allVariantsData) {
      for (const v of allVariantsData) {
        map.set(v._id, v.name);
      }
    }
    return map;
  }, [allVariantsData]);

  // Treatment info comes from the junction rows (#3399 dropped the scalar
  // treatment_id column). Delegates to shared utilities in
  // src/lib/gabinet/appointment-display.ts (issue #3544).
  const getApptTreatmentDisplay = (
    apt?: MappedGabinetAppointment | null,
  ): string | undefined =>
    getAppointmentTreatmentDisplay(
      apt?.treatments ?? [],
      treatmentsData,
      (variantId) => variantNameMap.get(variantId),
    );

  const getApptPrice = (apt?: MappedGabinetAppointment | null): number =>
    getAppointmentJunctionPrice(apt?.treatments ?? [], treatmentsData);

  const { data: patientPayments } = useSupabasePaymentsByPatient(
    organizationId,
    patientId,
  );

  const { data: patientReceipts } = useSupabaseGabinetReceiptsByPatient(
    organizationId,
    patientId,
  );

  const { data: patientPackageUsage } = useSupabaseGabinetPackageUsageByPatient(
    organizationId,
    patientId,
  );

  const { data: treatmentPackages } =
    useSupabaseGabinetTreatmentPackagesList(organizationId);

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

  const { data: latestIntake } = useQuery({
    queryKey: [
      "documents.getLatestSignedIntakeByPatient",
      organizationId,
      patientId,
    ],
    queryFn: () =>
      getLatestSignedIntakeByPatientAction({ organizationId, patientId }),
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
  const { allowed: canGenerateReceipt } = usePermission(
    "gabinet_receipts",
    "create",
  );
  const { allowed: canViewPhotos } = usePermission("gabinet_photos", "view");
  const { role } = useRole();
  const canGdprErase = role === "owner" || role === "admin";

  // Treatment-number indicator IDs ("X/Y" like in the calendar — issue #1086).
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
        title: t("gabinet.calendar.indicators.packageVisit", "Wizyta pakietowa"),
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

  const detailFields: DetailField[] = (() => {
    if (!patient) return [];
    const fields: DetailField[] = [];
    if (patient.email)
      fields.push({ label: t("common.email"), value: patient.email, fieldKey: "email" });
    if (patient.phone)
      fields.push({ label: t("common.phone"), value: formatPhoneNumber(patient.phone), fieldKey: "phone" });
    if (patient.gender)
      fields.push({
        label: t("gabinet.patients.gender"),
        value: t(`gabinet.patients.genderOptions.${patient.gender}`),
        fieldKey: "gender",
      });
    if (patient.pesel)
      fields.push({ label: t("gabinet.patients.pesel"), value: patient.pesel, fieldKey: "pesel" });
    if (patient.address) {
      const patientAddr = patient.address as {
        street?: string;
        postalCode?: string;
        city?: string;
      };
      const addr = [patientAddr.street, patientAddr.postalCode, patientAddr.city]
        .filter(Boolean)
        .join(", ");
      if (addr)
        fields.push({ label: t("gabinet.patients.address"), value: addr, fieldKey: "address" });
    }
    if (patient.referralSource)
      fields.push({
        label: t("gabinet.patients.referralSource"),
        value: displayReferralSource(patient.referralSource, t),
        fieldKey: "referral",
      });
    if (patient.dateOfBirth)
      fields.push({
        label: t("gabinet.patients.dateOfBirth"),
        value: formatBirthDate(patient.dateOfBirth),
        fieldKey: "dob",
      });
    if (patient.bloodType)
      fields.push({
        label: t("gabinet.patients.bloodType"),
        value: (
          <Badge variant="outline" className="text-[10px]">
            {patient.bloodType}
          </Badge>
        ),
        fieldKey: "bloodType",
      });
    if (patient.allergies)
      fields.push({ label: t("gabinet.patients.allergies"), value: patient.allergies, fieldKey: "allergies" });
    return fields;
  })();

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
      await updatePatient({ organizationId, patientId, ...formData });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPatients.detail(organizationId, patientId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPatients.list(organizationId),
      });
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
    appointmentId?: string;
    discountAmount?: number | null;
    discountPercent?: number | null;
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
    setPaymentEditAppointmentId(payment.appointmentId ?? null);
    if (payment.discountPercent && payment.discountPercent > 0) {
      setPaymentEditDiscountType("percent");
      setPaymentEditDiscountValue(String(payment.discountPercent));
    } else if (payment.discountAmount && payment.discountAmount > 0) {
      setPaymentEditDiscountType("amount");
      setPaymentEditDiscountValue(String(payment.discountAmount));
    } else {
      setPaymentEditDiscountType("amount");
      setPaymentEditDiscountValue("");
    }
  };

  const closeEditPaymentDialog = () => {
    setEditingPaymentId(null);
    setPaymentEditAmount("");
    setPaymentEditNotes("");
    setPaymentEditAppointmentId(null);
    setPaymentEditDiscountValue("");
  };

  const handleUpdatePayment = async () => {
    if (!editingPaymentId) return;
    const normalized = paymentEditAmount.replace(",", ".").trim();
    const amount = parseFloat(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("gabinet.payments.amountRequired"));
      return;
    }
    const discountVal =
      parseFloat(paymentEditDiscountValue.replace(",", ".")) || 0;
    const discountAmount =
      paymentEditDiscountValue &&
      paymentEditDiscountType === "amount" &&
      discountVal > 0
        ? discountVal
        : null;
    const discountPercent =
      paymentEditDiscountValue &&
      paymentEditDiscountType === "percent" &&
      discountVal > 0
        ? discountVal
        : null;
    setIsPaymentEditSubmitting(true);
    try {
      await updatePaymentAction({
        organizationId,
        paymentId: editingPaymentId,
        amount,
        paymentMethod: paymentEditMethod,
        notes: paymentEditNotes.trim() ? paymentEditNotes.trim() : null,
        discountAmount,
        discountPercent,
      });
      toast.success(t("gabinet.payments.updated"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.payments.all });
      closeEditPaymentDialog();
    } catch (e) {
      toast.error(
        formatActionError(e, t, { key: "common.error", defaultValue: "Wystąpił błąd." }),
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
        formatActionError(e, t, { key: "common.error", defaultValue: "Wystąpił błąd." }),
      );
    } finally {
      setIsRefundSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t("gabinet.patients.confirmDelete"))) {
      await removePatient({ organizationId, patientId });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPatients.list(organizationId),
      });
      navigate({ to: "/dashboard/gabinet/patients" });
    }
  };

  const handleGdprErase = async () => {
    if (gdprConfirmText.trim().toUpperCase() !== "USUŃ") return;
    setIsGdprSubmitting(true);
    try {
      await gdprErasePatient({ organizationId, patientId });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPatients.list(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPatients.detail(organizationId, patientId),
      });
      setGdprDialogOpen(false);
      toast.success(
        t("gabinet.patients.gdprEraseSuccess", "Dane klienta zostały trwale usunięte (RODO)."),
      );
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

  const openAddPaymentDialog = () => {
    setAddPaymentAmount("");
    setAddPaymentMethod("cash");
    setAddPaymentNotes("");
    setAddPaymentAppointmentId("");
    setAddPaymentDiscountType("amount");
    setAddPaymentDiscountValue("");
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
        const apt = (patientAppointments ?? []).find(
          (a) => a._id === addPaymentAppointmentId,
        );
        const treatmentPrice = getApptPrice(apt);
        // Credit applied to prior payments on this visit counts toward the paid
        // total (issue #1856).
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
      const discountRaw =
        parseFloat(addPaymentDiscountValue.replace(",", ".")) || 0;
      const discountAmount =
        addPaymentDiscountType === "amount" && discountRaw > 0
          ? discountRaw
          : undefined;
      const discountPercent =
        addPaymentDiscountType === "percent" && discountRaw > 0
          ? Math.min(discountRaw, 100)
          : undefined;
      await createPaymentAction({
        organizationId,
        patientId,
        appointmentId: addPaymentAppointmentId || undefined,
        amount,
        currency: "PLN",
        paymentMethod: addPaymentMethod,
        notes: addPaymentNotes.trim() ? addPaymentNotes.trim() : undefined,
        creditEarned: creditEarned > 0 ? creditEarned : undefined,
        discountAmount,
        discountPercent,
      });
      toast.success(t("gabinet.payments.created"));
      setAddPaymentOpen(false);
      setAddPaymentDiscountType("amount");
      setAddPaymentDiscountValue("");
      await refetchPatientCredit();
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.payments.all });
    } catch (e) {
      toast.error(
        formatActionError(e, t, { key: "common.error", defaultValue: "Wystąpił błąd." }),
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
        formatActionError(e, t, { key: "common.error", defaultValue: "Wystąpił błąd." }),
      );
    } finally {
      setIsCancelSubmitting(false);
    }
  };

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
        formatActionError(e, t, { key: "common.error", defaultValue: "Wystąpił błąd." }),
      );
    } finally {
      setIsRefundSubmitting(false);
    }
  };

  const handleDownloadReceipt = async (receiptId: string) => {
    setGeneratingReceiptFor(receiptId);
    try {
      const receipt = patientReceipts?.find((r) => r._id === receiptId);
      if (receipt?.pdfUrl) {
        window.open(receipt.pdfUrl, "_blank", "noopener,noreferrer");
        return;
      }
      const result = await generatePdfReceiptAction({
        organizationId,
        paymentId: receipt?.paymentId ?? receiptId,
      });
      if (result?.pdfUrl) {
        window.open(result.pdfUrl, "_blank", "noopener,noreferrer");
      } else {
        toast.error(t("gabinet.receipts.noUrl"));
      }
    } catch (e) {
      toast.error(
        formatActionError(e, t, { key: "common.error", defaultValue: "Wystąpił błąd." }),
      );
    } finally {
      setGeneratingReceiptFor(null);
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

  // Allergies and bloodType are already shown in the Details sidebar — see #1927.
  const hasMedicalInfo = Boolean(
    patient?.emergencyContactName ||
      patient?.emergencyContactPhone ||
      (latestIntake && latestIntake.intakeSummary.length > 0),
  );

  // Issue #1894: Beauty plan history — chronological list of interviewNotes.
  const beautyPlanEntries = (patientAppointments ?? [])
    .filter((apt) => plateJsonToText(apt.interviewNotes).trim().length > 0)
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

  const mergedPatientActivities = [
    ...(activities ?? []),
    ...(loyaltyActivities ?? []),
  ].sort((a, b) => b.createdAt - a.createdAt);

  const navigateWithParams = (opts: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
  }) => navigate(opts as Parameters<typeof navigate>[0]);

  const tabs = [
    {
      label: t("gabinet.patients.tabs.overview"),
      content: (
        <PatientOverviewTab
          patient={patient ?? { createdAt: 0 }}
          upcomingAppointments={upcomingAppointments}
          pastAppointments={pastAppointments}
          hasMedicalInfo={hasMedicalInfo}
          latestIntake={latestIntake}
          lastAppointmentsExpanded={lastAppointmentsExpanded}
          setLastAppointmentsExpanded={setLastAppointmentsExpanded}
          getApptTreatmentDisplay={getApptTreatmentDisplay}
          getVisitCountLabel={getVisitCountLabel}
          navigate={navigateWithParams}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.patients.tabs.appointments"),
      count: patientAppointments?.length,
      content: (
        <PatientAppointmentsTab
          patientAppointments={patientAppointments}
          getApptTreatmentDisplay={getApptTreatmentDisplay}
          getVisitCountLabel={getVisitCountLabel}
          navigate={navigateWithParams}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.patients.tabs.beautyPlan", "Beauty plan"),
      count: beautyPlanEntries.length,
      content: (
        <PatientBeautyPlanTab
          beautyPlanEntries={beautyPlanEntries}
          getApptTreatmentDisplay={getApptTreatmentDisplay}
          navigate={navigateWithParams}
          t={t}
        />
      ),
    },
    ...(canViewPhotos
      ? [
          {
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
          },
        ]
      : []),
    ...(canViewPayments
      ? [
          {
            label: t("gabinet.payments.payments"),
            count: patientPayments?.length ?? 0,
            content: (
              <PatientPaymentsTab
                patientPayments={patientPayments}
                patientCredit={patientCredit}
                patientAppointments={patientAppointments}
                patientPackageUsage={patientPackageUsage}
                treatmentPackages={treatmentPackages}
                getApptTreatmentDisplay={getApptTreatmentDisplay}
                canCreatePayment={canCreatePayment}
                canRefundCredit={canRefundCredit}
                canCancelPayment={canCancelPayment}
                openAddPaymentDialog={openAddPaymentDialog}
                openRefundDialog={openRefundDialog}
                openEditPaymentDialog={openEditPaymentDialog}
                openCancelDialog={openCancelDialog}
                navigate={navigateWithParams}
                t={t}
              />
            ),
          },
          {
            label: t("gabinet.patients.tabs.billing"),
            count: patientReceipts?.length ?? 0,
            content: (
              <PatientBillingTab
                patientReceipts={patientReceipts}
                canGenerateReceipt={canGenerateReceipt}
                generatingReceiptFor={generatingReceiptFor}
                handleDownloadReceipt={handleDownloadReceipt}
                t={t}
              />
            ),
          },
        ]
      : []),
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
        <PatientLoyaltyTab
          loyaltyBalance={loyaltyBalance}
          loyaltyTransactions={loyaltyTransactions}
          t={t}
        />
      ),
    },
    {
      label: t("gabinet.patients.tabs.activity"),
      content: (
        <ActivityFeed
          entries={activitiesToFeedEntries(mergedPatientActivities as any[], t)}
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
              <Badge variant="outline" className="text-xs">
                {t("common.inactive")}
              </Badge>
            )}
          </span>
        }
        avatarFallback={
          patient
            ? `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase()
            : "?"
        }
        onEdit={canEdit ? () => setEditDrawerOpen(true) : undefined}
        secondaryActions={[
          ...(canDelete ? [{
            label: t("common.delete"),
            onClick: handleDelete,
            variant: "destructive" as const,
          }] : []),
          ...(canGdprErase
            ? [
                {
                  label: t("gabinet.patients.gdprErase", "RODO: Usuń dane"),
                  onClick: () => {
                    setGdprConfirmText("");
                    setGdprDialogOpen(true);
                  },
                  variant: "destructive" as const,
                },
              ]
            : []),
        ]}
        fields={detailFields}
        expandedFieldCount={4}
        sidebarExtra={
          patient ? (
            <PatientSidebarExtra
              patient={patient}
              patientId={patientId}
              organizationId={organizationId}
              patientAppointments={patientAppointments}
              patientPayments={patientPayments}
              loyaltyBalance={loyaltyBalance}
              latestIntake={latestIntake}
              t={t}
            />
          ) : null
        }
        tabs={tabs}
      />

      {patient && (
        <SidePanel
          open={editDrawerOpen}
          onOpenChange={setEditDrawerOpen}
          title={t("common.edit")}
        >
          <PatientForm
            mode="edit"
            initialData={{
              firstName: patient.firstName,
              lastName: patient.lastName,
              email: patient.email,
              phone: patient.phone ?? undefined,
              pesel: patient.pesel ?? undefined,
              dateOfBirth: patient.dateOfBirth ?? undefined,
              gender:
                (patient.gender as "male" | "female" | "other" | undefined) ??
                undefined,
              address:
                (patient.address as
                  | { street?: string; city?: string; postalCode?: string }
                  | undefined) ?? undefined,
              medicalNotes: patient.medicalNotes ?? undefined,
              allergies: patient.allergies ?? undefined,
              bloodType: patient.bloodType ?? undefined,
              emergencyContactName: patient.emergencyContactName ?? undefined,
              emergencyContactPhone: patient.emergencyContactPhone ?? undefined,
              referralSource: patient.referralSource ?? undefined,
              tagIds: patient.tagIds as Id<"tagDefinitions">[] | undefined,
              categoryId: patient.categoryId as
                | Id<"categoryDefinitions">
                | undefined,
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

      <EditPaymentDialog
        editingPaymentId={editingPaymentId}
        paymentEditAmount={paymentEditAmount}
        setPaymentEditAmount={setPaymentEditAmount}
        paymentEditMethod={paymentEditMethod}
        setPaymentEditMethod={setPaymentEditMethod}
        paymentEditNotes={paymentEditNotes}
        setPaymentEditNotes={setPaymentEditNotes}
        paymentEditAppointmentId={paymentEditAppointmentId}
        paymentEditDiscountType={paymentEditDiscountType}
        setPaymentEditDiscountType={setPaymentEditDiscountType}
        paymentEditDiscountValue={paymentEditDiscountValue}
        setPaymentEditDiscountValue={setPaymentEditDiscountValue}
        isPaymentEditSubmitting={isPaymentEditSubmitting}
        onClose={closeEditPaymentDialog}
        onSubmit={handleUpdatePayment}
        patientAppointments={patientAppointments}
        getApptPrice={getApptPrice}
        t={t}
      />

      <RefundCreditDialog
        open={refundDialogOpen}
        canRefundCredit={canRefundCredit}
        creditBalance={patientCredit?.balance ?? 0}
        refundAmount={refundAmount}
        setRefundAmount={setRefundAmount}
        refundMethod={refundMethod}
        setRefundMethod={setRefundMethod}
        refundNotes={refundNotes}
        setRefundNotes={setRefundNotes}
        isRefundSubmitting={isRefundSubmitting}
        onClose={() => setRefundDialogOpen(false)}
        onRefund={handleRefundCredit}
        onRequestAuthorization={handleRequestRefundAuthorization}
        t={t}
      />

      <AddPaymentDialog
        open={addPaymentOpen}
        addPaymentAmount={addPaymentAmount}
        setAddPaymentAmount={setAddPaymentAmount}
        addPaymentMethod={addPaymentMethod}
        setAddPaymentMethod={setAddPaymentMethod}
        addPaymentNotes={addPaymentNotes}
        setAddPaymentNotes={setAddPaymentNotes}
        addPaymentAppointmentId={addPaymentAppointmentId}
        setAddPaymentAppointmentId={setAddPaymentAppointmentId}
        addPaymentDiscountType={addPaymentDiscountType}
        setAddPaymentDiscountType={setAddPaymentDiscountType}
        addPaymentDiscountValue={addPaymentDiscountValue}
        setAddPaymentDiscountValue={setAddPaymentDiscountValue}
        isAddPaymentSubmitting={isAddPaymentSubmitting}
        onClose={() => setAddPaymentOpen(false)}
        onSubmit={handleAddPayment}
        patientAppointments={patientAppointments}
        patientPayments={patientPayments}
        getApptTreatmentDisplay={getApptTreatmentDisplay}
        getApptPrice={getApptPrice}
        t={t}
      />

      <GdprEraseDialog
        open={gdprDialogOpen}
        gdprConfirmText={gdprConfirmText}
        setGdprConfirmText={setGdprConfirmText}
        isGdprSubmitting={isGdprSubmitting}
        onClose={() => setGdprDialogOpen(false)}
        onSubmit={handleGdprErase}
        t={t}
      />

      <CancelPaymentDialog
        cancellingPaymentId={cancellingPaymentId}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        isCancelSubmitting={isCancelSubmitting}
        onClose={() => {
          setCancellingPaymentId(null);
          setCancelReason("");
        }}
        onSubmit={handleCancelPayment}
        t={t}
      />
    </>
  );
}
