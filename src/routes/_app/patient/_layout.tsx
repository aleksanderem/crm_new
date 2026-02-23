import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { CalendarCheck, FileText, Heart, LogOut, User } from "@/lib/ez-icons";
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/patient/_layout")({
  component: PatientLayout,
});

function PatientLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useMutation(api["gabinet/patientAuth"].logoutPortal);

  const token = typeof window !== "undefined" ? localStorage.getItem("patientPortalToken") : null;
  const sessionId = typeof window !== "undefined" ? localStorage.getItem("patientPortalSessionId") : null;

  const { data: session, isLoading } = useQuery(
    convexQuery(api["gabinet/patientAuth"].getPortalSession, {
      sessionId: sessionId ?? "",
      token: token ?? "",
    })
  );

  useEffect(() => {
    if (!isLoading && !session) {
      localStorage.removeItem("patientPortalToken");
      localStorage.removeItem("patientPortalSessionId");
      navigate({ to: "/patient/login" });
    }
  }, [isLoading, session, navigate]);

  const handleLogout = useCallback(async () => {
    if (sessionId) {
      try {
        await logout({ sessionId });
      } catch {}
    }
    localStorage.removeItem("patientPortalToken");
    localStorage.removeItem("patientPortalSessionId");
    navigate({ to: "/patient/login" });
  }, [sessionId, logout, navigate]);

  if (isLoading || !session) {
    return null;
  }

  const navItems = [
    { label: t("patientPortal.nav.dashboard"), href: "/patient", icon: Heart },
    { label: t("patientPortal.nav.appointments"), href: "/patient/appointments", icon: CalendarCheck },
    { label: t("patientPortal.nav.documents"), href: "/patient/documents", icon: FileText },
    { label: t("patientPortal.nav.profile"), href: "/patient/profile", icon: User },
  ];

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-sm font-semibold">{t("patientPortal.title")}</span>
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                activeProps={{ className: "bg-muted text-foreground" }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" />
            {t("patientPortal.logout")}
          </Button>
        </div>
        {/* Mobile nav */}
        <nav className="flex sm:hidden border-t overflow-x-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
