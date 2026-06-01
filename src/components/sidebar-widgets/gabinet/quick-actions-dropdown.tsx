import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  UserPlus,
  Calendar,
  Clock,
  Users,
  Package,
  FileText,
  Gift,
  Settings,
  Stethoscope,
  Plus,
} from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebarActions } from "@/components/layout/sidebar-context";

export function GabinetQuickActionsDropdown() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openQuickCreate } = useSidebarActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("sidebar.gabinet.quickActions", "Szybkie akcje")}
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
          onSelect={() => openQuickCreate("appointment")}
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
          onSelect={() =>
            navigate({
              to: "/dashboard/gabinet/calendar",
              search: { action: "sell-package" },
            })
          }
        >
          <Gift className="text-foreground size-5" />
          {t("gabinet.packages.purchaseButton", "Dodaj sprzedaż")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/calendar" })}
        >
          <Calendar className="text-foreground size-5" />
          {t("sidebar.gabinet.goToCalendar", "Kalendarz")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/patients" })}
        >
          <Users className="text-foreground size-5" />
          {t("sidebar.gabinet.goToPatients", "Klienci")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/treatments" })}
        >
          <Stethoscope className="text-foreground size-5" />
          {t("sidebar.gabinet.goToTreatments", "Zabiegi")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/packages" })}
        >
          <Package className="text-foreground size-5" />
          {t("sidebar.gabinet.goToPackages", "Pakiety")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/documents" })}
        >
          <FileText className="text-foreground size-5" />
          {t("sidebar.gabinet.goToDocuments", "Dokumenty")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/settings/timetable" })}
        >
          <Clock className="text-foreground size-5" />
          {t("sidebar.gabinet.goToSchedules", "Grafiki")}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="px-3 py-2.5 text-sm"
          onSelect={() => navigate({ to: "/dashboard/gabinet/settings/scheduling" })}
        >
          <Settings className="text-foreground size-5" />
          {t("sidebar.gabinet.goToSettings", "Ustawienia")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
