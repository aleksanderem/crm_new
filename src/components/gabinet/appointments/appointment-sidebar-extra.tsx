import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import {
  Eye,
  Mail,
  MoreVerticalCircle02,
  Phone,
  RefreshCcw,
  Star,
} from "@/lib/ez-icons";
import { formatPhoneNumber } from "@/lib/phone";
import { Link } from "@tanstack/react-router";
import { Id } from "@cvx/_generated/dataModel";

type TagDefinition = { _id: Id<"tagDefinitions">; name: string; color?: string };

type PatientData = {
  _id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};

type EmployeeData = {
  _id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type TreatmentUsedEntry = {
  treatmentId: string;
  treatmentName?: string | null;
  usedCount?: number;
  totalCount?: number;
};

type PackageUsageEntry = {
  _id: string;
  packageName?: string | null;
  status: string;
  treatmentsUsed: TreatmentUsedEntry[];
};

export function AppointmentSidebarExtra({
  patient,
  employee,
  relevantPkgs,
  loyaltyBalance,
  tagDefinitions,
  tagIds,
  isSavingTags,
  canEdit,
  onChangeEmployee,
  onTagsChange,
  t,
}: {
  patient: PatientData;
  employee: EmployeeData | null | undefined;
  relevantPkgs: PackageUsageEntry[];
  loyaltyBalance: number;
  tagDefinitions: TagDefinition[] | undefined;
  tagIds: Id<"tagDefinitions">[];
  isSavingTags: boolean;
  canEdit: boolean;
  onChangeEmployee: () => void;
  onTagsChange: (newTagIds: Id<"tagDefinitions">[]) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const empName = employee ? (employee.name ?? employee.email ?? "-") : "-";

  return (
    <div className="space-y-3">
      {/* Patient card */}
      <Item variant="outline" size="sm" className="relative">
        <ItemMedia>
          <Avatar className="h-9 w-9 bg-purple-100 dark:bg-purple-900/50">
            <AvatarFallback className="text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
              {patient.firstName && patient.lastName
                ? `${patient.firstName[0]}${patient.lastName[0]}`
                : "?"}
            </AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            {patient.firstName} {patient.lastName}
          </ItemTitle>
          <ItemDescription className="text-xs">
            {[
              patient.phone ? formatPhoneNumber(patient.phone) : undefined,
              patient.email,
            ]
              .filter(Boolean)
              .join(" · ")}
          </ItemDescription>
          {loyaltyBalance > 0 && (
            <Badge variant="outline" className="mt-0.5 w-fit text-[10px]">
              <Star size={10} variant="stroke" className="mr-1" />
              {loyaltyBalance} {t("gabinet.loyalty.points")}
            </Badge>
          )}
        </ItemContent>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 size-7"
            >
              <MoreVerticalCircle02 size={16} variant="stroke" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link
                to="/dashboard/gabinet/patients/$patientId"
                params={{ patientId: patient._id }}
              >
                <Eye size={14} variant="stroke" className="mr-2" />
                {t("gabinet.patients.viewProfile", "Profil klienta")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {patient.phone && (
              <DropdownMenuItem asChild>
                <a href={`tel:${patient.phone}`}>
                  <Phone size={14} variant="stroke" className="mr-2" />
                  {t("common.call", "Zadzwoń")}
                </a>
              </DropdownMenuItem>
            )}
            {patient.email && (
              <DropdownMenuItem asChild>
                <a href={`mailto:${patient.email}`}>
                  <Mail size={14} variant="stroke" className="mr-2" />
                  {t("common.sendEmail", "Wyślij e-mail")}
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </Item>

      {/* Employee card */}
      {employee && (
        <Item variant="outline" size="sm" className="relative">
          <ItemMedia>
            <Avatar className="h-9 w-9 bg-cyan-100 dark:bg-cyan-900/50">
              {employee.image && <AvatarImage src={employee.image} alt={empName} />}
              <AvatarFallback className="text-xs font-medium bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300">
                {empName
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{empName}</ItemTitle>
            <ItemDescription className="text-xs">
              {employee.email ?? t("gabinet.employees.employee")}
            </ItemDescription>
          </ItemContent>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 size-7"
              >
                <MoreVerticalCircle02 size={16} variant="stroke" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {employee.email && (
                <DropdownMenuItem asChild>
                  <a href={`mailto:${employee.email}`}>
                    <Mail size={14} variant="stroke" className="mr-2" />
                    {t("common.sendEmail", "Wyślij e-mail")}
                  </a>
                </DropdownMenuItem>
              )}
              {canEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onChangeEmployee}>
                    <RefreshCcw size={14} variant="stroke" className="mr-2" />
                    {t("gabinet.appointments.changeEmployee", "Zmień pracownika")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </Item>
      )}

      {/* Packages */}
      {relevantPkgs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {t("gabinet.packages.activePackages", "Aktywne pakiety")}
          </p>
          {relevantPkgs.map((pkg) => (
            <div
              key={pkg._id}
              className="rounded-md border p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium truncate">{pkg.packageName}</p>
                <Badge
                  variant="outline"
                  className={`text-[10px] shrink-0 ${pkg.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" : ""}`}
                >
                  {t(`gabinet.packages.status.${pkg.status}`)}
                </Badge>
              </div>
              {pkg.treatmentsUsed.map((tu) => {
                const used = tu.usedCount ?? 0;
                const total = tu.totalCount ?? 0;
                const remaining = Math.max(total - used, 0);
                const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
                let barColor = "bg-emerald-500";
                if (remaining <= 0) barColor = "bg-red-500";
                else if (remaining / total < 0.3) barColor = "bg-amber-500";
                return (
                  <div key={tu.treatmentId} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground truncate">
                        {tu.treatmentName ?? "-"}
                      </span>
                      <span className="tabular-nums text-muted-foreground shrink-0">
                        {used} / {total}
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {t("common.tags")}
          </p>
          {isSavingTags && (
            <span className="text-[10px] text-muted-foreground">
              {t("common.saving")}
            </span>
          )}
        </div>
        <TagsPicker
          tags={tagDefinitions}
          selectedIds={tagIds}
          onChange={canEdit ? onTagsChange : () => {}}
        />
      </div>
    </div>
  );
}
