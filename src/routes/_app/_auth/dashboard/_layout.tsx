import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Sidebar } from "@/components/layout/sidebar";
import { OrgProvider } from "@/components/org-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Button } from "@/ui/button";
import { ThemeSwitcher } from "@/ui/theme-switcher";
import { useSignOut } from "@/utils/misc";
import { Settings, LogOut } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { data: user } = useQuery(convexQuery(api.app.getCurrentUser, {}));
  const { data: orgs } = useQuery(
    convexQuery(api.organizations.getMyOrganizations, {})
  );
  const signOut = useSignOut();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  const firstOrg = orgs?.[0];

  return (
    <OrgProvider initialOrgId={firstOrg?._id}>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <Sidebar orgName={firstOrg?.name} />

        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 shrink-0 items-center justify-end border-b px-6">
            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                    {user.avatarUrl ? (
                      <img
                        className="h-8 w-8 rounded-full object-cover"
                        alt={user.username ?? user.email}
                        src={user.avatarUrl}
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 from-10% via-cyan-300 to-blue-500 text-xs font-medium text-white">
                        {(user.username ?? user.email ?? "U")[0].toUpperCase()}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.username}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({ to: "/dashboard/settings" })
                    }
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </OrgProvider>
  );
}
