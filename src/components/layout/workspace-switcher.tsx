import { CheckIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TrendingUp, Stethoscope } from "@/lib/ez-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Workspace = "crm" | "gabinet";

interface WorkspaceOption {
  id: Workspace;
  icon: React.ElementType;
  nameKey: string;
  descKey: string;
  href: string;
}

const workspaces: WorkspaceOption[] = [
  {
    id: "crm",
    icon: TrendingUp,
    nameKey: "nav.workspace.crm",
    descKey: "nav.workspace.crmDesc",
    href: "/dashboard",
  },
  {
    id: "gabinet",
    icon: Stethoscope,
    nameKey: "nav.workspace.gabinet",
    descKey: "nav.workspace.gabinetDesc",
    href: "/dashboard/gabinet",
  },
];

interface WorkspaceSwitcherProps {
  activeWorkspace: Workspace;
}

export function WorkspaceSwitcher({ activeWorkspace }: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const current = workspaces.find((w) => w.id === activeWorkspace) ?? workspaces[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="bg-secondary flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left outline-none">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <current.icon className="size-4" />
        </div>
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="text-sm font-semibold leading-none">
            {t(current.nameKey)}
          </span>
          <span className="text-muted-foreground text-xs">
            {t(current.descKey)}
          </span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{t("nav.sections.workspace", "Workspace")}</DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => navigate({ to: ws.href })}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ws.icon className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="text-sm font-semibold leading-none">
                  {t(ws.nameKey)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t(ws.descKey)}
                </span>
              </div>
            </div>
            {activeWorkspace === ws.id && <CheckIcon className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
