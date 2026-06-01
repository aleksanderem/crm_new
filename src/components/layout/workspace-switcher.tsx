import { CircleCheckIcon } from "@/lib/ez-icons";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ModuleId, ModuleWorkspaceOption } from "@/modules/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkspaceSwitcherProps {
  activeWorkspace: ModuleId;
  workspaces: ModuleWorkspaceOption[];
  onSelect?: () => void;
}

export function WorkspaceSwitcher({ activeWorkspace, workspaces, onSelect }: WorkspaceSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (workspaces.length === 0) {
    return null;
  }

  const current = workspaces.find((workspace) => workspace.id === activeWorkspace) ?? workspaces[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="bg-secondary flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left outline-none">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <current.icon className="size-4" />
        </div>
        <div className="flex flex-col gap-0.5 leading-none">
          <span className="text-sm font-semibold leading-none">{t(current.nameKey)}</span>
          <span className="text-muted-foreground text-xs">{t(current.descKey)}</span>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{t("nav.sections.workspace", "Workspace")}</DropdownMenuLabel>
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => {
              navigate({ to: workspace.href });
              onSelect?.();
            }}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <workspace.icon className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="text-sm font-semibold leading-none">{t(workspace.nameKey)}</span>
                <span className="text-muted-foreground text-xs">{t(workspace.descKey)}</span>
              </div>
            </div>
            {activeWorkspace === workspace.id && <CircleCheckIcon className="ml-auto size-4" variant="stroke" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
