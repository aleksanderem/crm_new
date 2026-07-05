import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  UserPlus,
  Package,
  FileText,
  Plus,
  ShoppingCart,
  TruckIcon,
  TreePalm,
} from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebarActions } from "@/components/layout/sidebar-context";
import { usePermission } from "@/hooks/use-permission";
import { useOrganization } from "@/components/org-context";
import { SellTreatmentPanel } from "@/components/gabinet/sell-treatment-panel";

export function GabinetQuickActionsDropdown() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openQuickCreate } = useSidebarActions();
  const { allowed: canManageLeaves } = usePermission("gabinet_settings", "edit");
  const { organizationId } = useOrganization();
  const [sellTreatmentOpen, setSellTreatmentOpen] = useState(false);

  // "Umów wizytę" routes through the calendar so every appointment entry
  // point opens the same AppointmentDialog (issue #1506).
  const goToCalendarCreateAppointment = () =>
    navigate({
      to: "/dashboard/gabinet/calendar",
      search: { action: "create-appointment" },
    });

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t("sidebar.gabinet.quickActions", "Szybkie akcje")}
          className="h-7 gap-1 text-xs max-sm:h-8 max-sm:w-8 max-sm:gap-0 max-sm:p-0"
        >
          <Plus className="h-3.5 w-3.5 sm:mr-1" />
          <span className="max-sm:sr-only">
            {t("sidebar.gabinet.quickActions", "Szybkie akcje")}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-60 p-2"
        side="top"
        align="end"
        sideOffset={8}
      >
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={goToCalendarCreateAppointment}
        >
          <CalendarCheck className="text-foreground size-5" />
          {t("sidebar.gabinet.bookAppointment", "Umów wizytę")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => openQuickCreate("patient")}
        >
          <UserPlus className="text-foreground size-5" />
          {t("sidebar.gabinet.addPatient", "Dodaj klienta")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => setSellTreatmentOpen(true)}
        >
          <ShoppingCart className="text-foreground size-5 shrink-0" />
          {t("sidebar.gabinet.sellProduct", "Sprzedaj produkt")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => openQuickCreate("package")}
        >
          <Package className="text-foreground size-5" />
          {t("sidebar.gabinet.addPackage", "Dodaj pakiet")}
        </DropdownMenuItem>
        {canManageLeaves && (
          <DropdownMenuItem
            className="px-3 py-2.5 text-sm"
            onSelect={() => openQuickCreate("leave")}
          >
            <TreePalm className="text-foreground size-5" />
            {t("sidebar.gabinet.addLeave", "Dodaj nieobecność")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="px-3 py-2.5 text-sm" disabled>
          <TruckIcon className="text-foreground size-5 shrink-0" />
          <span className="flex flex-col gap-0.5">
            <span>{t("sidebar.gabinet.addDelivery", "Dodaj dostawę")}</span>
            <span className="text-muted-foreground text-xs font-normal">
              {t("common.featureInProgress", "Funkcja w przygotowaniu")}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/documents" })}
        >
          <FileText className="text-foreground size-5" />
          {t("sidebar.gabinet.issueDocument", "Wystaw dokument")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <SellTreatmentPanel
      organizationId={organizationId}
      open={sellTreatmentOpen}
      onOpenChange={setSellTreatmentOpen}
    />
    </>
  );
}
