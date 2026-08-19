import type { TFunction } from "i18next";

export const EMPLOYEE_NAV_GROUPS = [
  "clientsAndVisits",
  "schedule",
  "employeeData",
  "documentsAndAssets",
  "accountAndAccess",
] as const;

export function EmployeeNavGroups({
  activeGroup,
  onGroupChange,
  t,
}: {
  activeGroup: string;
  onGroupChange: (group: string) => void;
  t: TFunction;
}) {
  return (
    <div className="-mx-4 mb-1 overflow-x-auto px-4 scrollbar-none">
      <div className="flex min-w-max gap-1 pb-1">
        {EMPLOYEE_NAV_GROUPS.map((group) => {
          const isActive = activeGroup === group;
          return (
            <button
              key={group}
              type="button"
              onClick={() => onGroupChange(group)}
              className={[
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              {t(`gabinet.employees.navGroups.${group}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
