import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, User, X } from "@/lib/ez-icons";
import { formatPhoneNumber } from "@/lib/phone";
import type { EmployeePatientStats } from "@cvx/gabinet/appointments";

export function PatientsTabContent({
  employeePatients,
  filteredClients,
  clientSearch,
  setClientSearch,
  clientStatusFilter,
  setClientStatusFilter,
  clientTreatmentFilter,
  setClientTreatmentFilter,
  treatments,
  navigate,
  t,
  i18nLanguage,
}: {
  employeePatients: EmployeePatientStats[] | undefined;
  filteredClients: EmployeePatientStats[];
  clientSearch: string;
  setClientSearch: (v: string) => void;
  clientStatusFilter: string;
  setClientStatusFilter: (v: string) => void;
  clientTreatmentFilter: string;
  setClientTreatmentFilter: (v: string) => void;
  treatments: Array<{ _id: string; name: string }> | undefined;
  navigate: (opts: { to: string }) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  i18nLanguage: string;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {t("gabinet.employees.tabs.patients")}
      </h3>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("gabinet.employees.clientsTab.searchPlaceholder")}
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            className="pl-9 h-9"
          />
          {clientSearch && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1 h-7 w-7 p-0"
              onClick={() => setClientSearch("")}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Select value={clientStatusFilter} onValueChange={setClientStatusFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder={t("gabinet.employees.clientsTab.filterByStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gabinet.employees.clientsTab.allStatuses")}</SelectItem>
            <SelectItem value="scheduled">{t("gabinet.appointments.statuses.scheduled")}</SelectItem>
            <SelectItem value="confirmed">{t("gabinet.appointments.statuses.confirmed")}</SelectItem>
            <SelectItem value="completed">{t("gabinet.appointments.statuses.completed")}</SelectItem>
            <SelectItem value="cancelled">{t("gabinet.appointments.statuses.cancelled")}</SelectItem>
            <SelectItem value="no_show">{t("gabinet.appointments.statuses.no_show")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientTreatmentFilter} onValueChange={setClientTreatmentFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder={t("gabinet.employees.clientsTab.filterByTreatment")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gabinet.employees.clientsTab.allTreatments")}</SelectItem>
            {treatments?.map((tr) => (
              <SelectItem key={tr._id} value={tr._id}>
                {tr.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(clientSearch || clientStatusFilter !== "all" || clientTreatmentFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => {
              setClientSearch("");
              setClientStatusFilter("all");
              setClientTreatmentFilter("all");
            }}
          >
            <X className="h-3 w-3 mr-1" />
            {t("gabinet.employees.clientsTab.clearFilters")}
          </Button>
        )}
      </div>

      {employeePatients && employeePatients.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("gabinet.employees.clientsTab.showing", {
            count: filteredClients.length,
            total: employeePatients.length,
          })}
        </p>
      )}

      {!employeePatients || employeePatients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <User className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.employees.tabs.noPatients")}
          </p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">
            {t("gabinet.employees.clientsTab.noResults")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredClients.map((pat) => (
            <div
              key={pat._id}
              className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() =>
                navigate({
                  to: `/dashboard/gabinet/patients/${pat._id}`,
                })
              }
            >
              <Avatar className="h-9 w-9 border">
                <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                  {pat.firstName[0]}
                  {pat.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {pat.firstName} {pat.lastName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {pat.email}
                  {pat.phone && ` · ${formatPhoneNumber(pat.phone)}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs">
                  {t("gabinet.employees.clientsTab.visits", { count: pat.visitCount })}
                </Badge>
                {pat.lastVisitDate && (
                  <span className="text-xs text-muted-foreground">
                    {t("gabinet.employees.clientsTab.lastVisit")}{" "}
                    {new Date(pat.lastVisitDate + "T00:00:00").toLocaleDateString(i18nLanguage, { day: "numeric", month: "short" })}
                  </span>
                )}
                {!pat.isActive && (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t("common.inactive")}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
