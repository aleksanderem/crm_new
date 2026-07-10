import {
  BarChart3,
  Calendar,
  CalendarCheck,
  CheckCircle,
  Clock,
  ClipboardList,
  Download,
  FileText,
  Filter,
  Gift,
  Heart,
  LayoutDashboard,
  Package,
  PieChart,
  PlusCircle,
  SearchIcon,
  Settings,
  Stethoscope,
  Tag,
  TrendingUp,
  Upload,
  UserCog,
  UserPlus,
} from "@/lib/ez-icons";
import { GabinetCalendarWidgets } from "@/components/sidebar-widgets/gabinet/calendar-widgets";
import { GabinetDashboardWidgets } from "@/components/sidebar-widgets/gabinet/dashboard-widgets";
import { GabinetEmployeesWidgets } from "@/components/sidebar-widgets/gabinet/employees-widgets";
import { GabinetPackagesWidgets } from "@/components/sidebar-widgets/gabinet/packages-widgets";
import { GabinetPatientsWidgets } from "@/components/sidebar-widgets/gabinet/patients-widgets";
import { GabinetReportsWidgets } from "@/components/sidebar-widgets/gabinet/reports-widgets";
import { GabinetTreatmentsWidgets } from "@/components/sidebar-widgets/gabinet/treatments-widgets";
import type { ModuleManifest } from "@/modules/types";

export const gabinetManifest: ModuleManifest = {
  id: "gabinet",
  productKey: "gabinet",
  workspaceRoot: "/dashboard/gabinet",
  settingsRoots: ["/dashboard/gabinet/settings"],
  workspace: {
    id: "gabinet",
    icon: Stethoscope,
    nameKey: "nav.workspace.gabinet",
    descKey: "nav.workspace.gabinetDesc",
    href: "/dashboard/gabinet",
  },
  primaryNav: [
    { labelKey: "nav.gabinet.dashboard", href: "/dashboard/gabinet", icon: LayoutDashboard },
    { labelKey: "nav.gabinet.calendar", href: "/dashboard/gabinet/calendar", icon: Calendar },
    { labelKey: "nav.gabinet.patients", href: "/dashboard/gabinet/patients", icon: Heart },
    { labelKey: "nav.gabinet.treatments", href: "/dashboard/gabinet/treatments", icon: Stethoscope },
    { labelKey: "nav.gabinet.packages", href: "/dashboard/gabinet/packages", icon: Gift },
    { labelKey: "nav.products", href: "/dashboard/products", icon: Package, crossModule: true },
    { labelKey: "nav.gabinet.employees", href: "/dashboard/gabinet/employees", icon: UserCog },
    { labelKey: "nav.gabinet.documents", href: "/dashboard/gabinet/documents", icon: ClipboardList },
    { labelKey: "nav.gabinet.reports", href: "/dashboard/gabinet/reports", icon: PieChart },
  ],
  settingsNav: [
    { sectionKey: "settings.gabinetSection", labelKey: "gabinet.locations.title", to: "/dashboard/gabinet/settings/locations", permissionFeature: "gabinet_settings" },
    { labelKey: "gabinet.scheduling.title", to: "/dashboard/gabinet/settings/scheduling", permissionFeature: "gabinet_settings" },
    { labelKey: "gabinet.timetable.title", to: "/dashboard/gabinet/settings/timetable", permissionFeature: "gabinet_settings" },
    { labelKey: "gabinet.reminders.title", to: "/dashboard/gabinet/settings/reminders", permissionFeature: "gabinet_settings" },
    { labelKey: "gabinet.equipment.title", to: "/dashboard/gabinet/settings/equipment", permissionFeature: "gabinet_settings" },
    { sectionKey: "settings.employeesSection", labelKey: "gabinet.roles.title", to: "/dashboard/gabinet/settings/roles", permissionFeature: "gabinet_settings" },
    { labelKey: "gabinet.leaveTypes.title", to: "/dashboard/gabinet/settings/leave-types", permissionFeature: "gabinet_settings" },
    { labelKey: "gabinet.leaveBalances.title", to: "/dashboard/gabinet/settings/leave-balances", permissionFeature: "gabinet_settings" },
    { labelKey: "gabinet.leaves.title", to: "/dashboard/gabinet/settings/leaves", permissionFeature: "gabinet_settings" },
  ],
  pageContexts: [
    {
      key: "dashboard",
      titleKey: "nav.gabinet.dashboard",
      widgets: GabinetDashboardWidgets,
      matches: [{ to: "/dashboard/gabinet" }],
      actions: [
        {
          labelKey: "nav.actions.bookAppointment",
          icon: CalendarCheck,
          href: "/dashboard/gabinet/calendar",
          search: { action: "create-appointment" },
          permissionFeature: "gabinet_appointments",
        },
        { labelKey: "nav.actions.viewCalendar", icon: Calendar, href: "/dashboard/gabinet/calendar" },
        {
          labelKey: "nav.actions.addPatient",
          icon: UserPlus,
          quickCreate: "patient",
          permissionFeature: "gabinet_patients",
        },
        { labelKey: "nav.actions.todaysSchedule", icon: Clock, dispatch: "viewTodaySchedule" },
      ],
    },
    {
      key: "calendar",
      titleKey: "nav.gabinet.calendar",
      widgets: GabinetCalendarWidgets,
      matches: [{ to: "/dashboard/gabinet/calendar", fuzzy: true }],
      actions: [
        {
          labelKey: "nav.actions.bookAppointment",
          icon: CalendarCheck,
          dispatch: "openCreateAppointment",
          permissionFeature: "gabinet_appointments",
        },
        { labelKey: "nav.actions.filters", icon: Filter, dispatch: "openFilter" },
      ],
    },
    {
      key: "patients",
      titleKey: "nav.gabinet.patients",
      widgets: GabinetPatientsWidgets,
      matches: [{ to: "/dashboard/gabinet/patients", fuzzy: true }],
      actions: [
        {
          labelKey: "nav.actions.addPatient",
          icon: UserPlus,
          dispatch: "openAddPatient",
          permissionFeature: "gabinet_patients",
        },
        { labelKey: "nav.actions.importCsv", icon: Upload, dispatch: "importCsv" },
        { labelKey: "nav.actions.searchPatients", icon: SearchIcon, dispatch: "openSearch" },
        { labelKey: "nav.actions.filterByStatus", icon: Filter, dispatch: "openFilter" },
      ],
    },
    {
      key: "treatments",
      titleKey: "nav.gabinet.treatments",
      widgets: GabinetTreatmentsWidgets,
      matches: [{ to: "/dashboard/gabinet/treatments", fuzzy: true }],
      actions: [
        {
          labelKey: "nav.actions.addTreatment",
          icon: PlusCircle,
          quickCreate: "treatment",
          permissionFeature: "gabinet_treatments",
        },
        { labelKey: "nav.actions.categoryFilter", icon: Tag, dispatch: "openFilter" },
        { labelKey: "nav.actions.sortByPrice", icon: TrendingUp, dispatch: "sortByPrice" },
        { labelKey: "nav.actions.manageCategories", icon: Settings, dispatch: "manageCategories" },
      ],
    },
    {
      key: "packages",
      titleKey: "nav.gabinet.packages",
      widgets: GabinetPackagesWidgets,
      matches: [{ to: "/dashboard/gabinet/packages", fuzzy: true }],
      actions: [
        {
          labelKey: "nav.actions.addPackage",
          icon: PlusCircle,
          quickCreate: "package",
          permissionFeature: "gabinet_packages",
        },
        { labelKey: "nav.actions.filterByStatus", icon: Filter, dispatch: "openFilter" },
        { labelKey: "nav.actions.viewExpiring", icon: Clock, dispatch: "viewExpiring" },
        { labelKey: "nav.actions.assignPackage", icon: Gift, dispatch: "assignPackage" },
      ],
    },
    {
      key: "employees",
      titleKey: "nav.gabinet.employees",
      widgets: GabinetEmployeesWidgets,
      matches: [{ to: "/dashboard/gabinet/employees", fuzzy: true }],
      actions: [
        {
          labelKey: "nav.actions.addEmployee",
          icon: UserPlus,
          quickCreate: "employee",
          permissionFeature: "gabinet_employees",
        },
        { labelKey: "nav.actions.manageSchedules", icon: Calendar, href: "/dashboard/gabinet/settings/timetable" },
        { labelKey: "nav.actions.viewLeaves", icon: CalendarCheck, href: "/dashboard/gabinet/settings/leaves" },
        { labelKey: "nav.actions.filterByRole", icon: Filter, dispatch: "openFilter" },
      ],
    },
    {
      key: "documents",
      titleKey: "nav.gabinet.documents",
      matches: [{ to: "/dashboard/gabinet/documents", fuzzy: true }],
      actions: [
        {
          labelKey: "nav.actions.addDocument",
          icon: PlusCircle,
          quickCreate: "document",
          permissionFeature: "documents",
        },
        { labelKey: "nav.actions.createFromTemplate", icon: FileText, dispatch: "createFromTemplate" },
        { labelKey: "nav.actions.filterByStatus", icon: Filter, dispatch: "openFilter" },
        { labelKey: "nav.actions.pendingSignatures", icon: CheckCircle, dispatch: "pendingSignatures" },
      ],
    },
    {
      key: "document-templates",
      titleKey: "nav.gabinet.documentTemplates",
      matches: [{ to: "/dashboard/gabinet/document-templates" }],
      actions: [
        { labelKey: "nav.actions.addTemplate", icon: PlusCircle, href: "/dashboard/document-editor/new" },
      ],
    },
    {
      key: "reports",
      titleKey: "nav.gabinet.reports",
      widgets: GabinetReportsWidgets,
      matches: [{ to: "/dashboard/gabinet/reports", fuzzy: true }],
      actions: [
        { labelKey: "nav.actions.exportReport", icon: Download, dispatch: "exportReport" },
        { labelKey: "nav.actions.filterByDate", icon: Calendar, dispatch: "filterByDate" },
        { labelKey: "nav.actions.viewTreatmentStats", icon: BarChart3, dispatch: "viewTreatmentStats" },
        { labelKey: "nav.actions.viewRevenueReport", icon: TrendingUp, dispatch: "viewRevenueReport" },
      ],
    },
  ],
  fallbackPageContextKey: "dashboard",
};
