import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import { api } from "@cvx/_generated/api";
import Logo from "@/assets/svg/logo";

export const Route = createFileRoute("/status")({
  component: StatusPage,
});

type ComponentStatus = "checking" | "ok" | "degraded" | "error";

function useSupabaseStatus(): ComponentStatus {
  const [status, setStatus] = useState<ComponentStatus>("checking");

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) {
      setStatus("error");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      setStatus("error");
    }, 8000);
    fetch(`${url}/rest/v1/`, {
      method: "HEAD",
      headers: { apikey: key },
      signal: controller.signal,
    })
      .then((res) => setStatus(res.ok ? "ok" : "degraded"))
      .catch(() => setStatus("error"))
      .finally(() => clearTimeout(timer));
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  return status;
}

function useConvexStatus(): ComponentStatus {
  const [timedOut, setTimedOut] = useState(false);
  const data = useQuery(api.app.getPublicStatus);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, []);

  if (data !== undefined) return "ok";
  if (timedOut) return "error";
  return "checking";
}

function overallStatus(statuses: ComponentStatus[]): ComponentStatus {
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  if (statuses.some((s) => s === "checking")) return "checking";
  return "ok";
}

const STATUS_LABELS: Record<ComponentStatus, string> = {
  checking: "Sprawdzam",
  ok: "Operacyjny",
  degraded: "Spowolniony",
  error: "Problemy",
};

const STATUS_COLORS: Record<ComponentStatus, string> = {
  checking: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  degraded: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STATUS_DOT: Record<ComponentStatus, string> = {
  checking: "bg-amber-500 animate-pulse",
  ok: "bg-emerald-500",
  degraded: "bg-amber-500",
  error: "bg-red-500",
};

const OVERALL_BANNER: Record<ComponentStatus, { text: string; bg: string }> = {
  checking: {
    text: "Trwa weryfikacja statusu systemów…",
    bg: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
  },
  ok: {
    text: "Wszystkie systemy działają poprawnie",
    bg: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
  },
  degraded: {
    text: "Wykryto spowolnienie — monitorujemy sytuację",
    bg: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
  },
  error: {
    text: "Wykryto problemy z jednym lub więcej systemów",
    bg: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
  },
};

function StatusBadge({ status }: { status: ComponentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}

interface ComponentCardProps {
  name: string;
  description: string;
  status: ComponentStatus;
}

function ComponentCard({ name, description, status }: ComponentCardProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4">
      <div>
        <p className="font-medium">{name}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function StatusPage() {
  const convexStatus = useConvexStatus();
  const supabaseStatus = useSupabaseStatus();
  const frontendStatus: ComponentStatus = "ok";

  const all = overallStatus([frontendStatus, convexStatus, supabaseStatus]);
  const banner = OVERALL_BANNER[all];

  const now = new Date();
  const formattedDate = now.toLocaleString("pl-PL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  });

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Helmet>
        <title>Status systemu — Quera</title>
        <meta
          name="description"
          content="Sprawdź aktualny status platformy Quera — frontend, backend i baza danych w czasie rzeczywistym."
        />
        <meta property="og:title" content="Status systemu — Quera" />
        <meta
          property="og:description"
          content="Aktualny status systemu Quera."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="size-8 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
            <span className="text-lg font-semibold">Quera</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Strona główna
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Zaloguj się
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {/* Heading */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Status systemu
          </h1>
          <p className="mt-3 text-muted-foreground">
            Aktualny stan komponentów platformy Quera.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ostatnia aktualizacja: {formattedDate}
          </p>
        </div>

        {/* Overall banner */}
        <div
          className={`mb-8 rounded-xl border px-6 py-5 text-center ${banner.bg}`}
        >
          <div className="flex items-center justify-center gap-2.5">
            <span
              className={`size-2.5 rounded-full ${STATUS_DOT[all]} ${all === "checking" ? "animate-pulse" : ""}`}
            />
            <p className="font-semibold">{banner.text}</p>
          </div>
        </div>

        {/* Component list */}
        <div className="space-y-3">
          <ComponentCard
            name="Aplikacja webowa"
            description="Interfejs użytkownika (Netlify CDN)"
            status={frontendStatus}
          />
          <ComponentCard
            name="Backend"
            description="Serwer aplikacji i logika biznesowa (Convex)"
            status={convexStatus}
          />
          <ComponentCard
            name="Baza danych"
            description="Przechowywanie danych (Supabase Postgres)"
            status={supabaseStatus}
          />
        </div>

        {/* SLO info */}
        <div className="mt-10 rounded-xl border border-border bg-muted/40 px-6 py-5">
          <h2 className="mb-3 font-semibold">Cel dostępności (SLO)</h2>
          <p className="text-sm text-muted-foreground">
            Quera utrzymuje cel dostępności na poziomie{" "}
            <span className="font-medium text-foreground">99,5%</span> w
            oknie 30 dni dla wszystkich komponentów. Monitoring uruchamiany
            jest automatycznie co 10 minut i w przypadku awarii generuje
            zgłoszenie wewnętrzne. W razie potrzeby skontaktuj się z nami
            przez e-mail podany w umowie.
          </p>
        </div>

        {/* Incident note */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Nie widzisz oczekiwanego statusu? Statusy powyżej są sprawdzane
          bezpośrednio z Twojej przeglądarki — wynik może się różnić w
          zależności od lokalnej sieci.
        </p>
      </main>

      <footer className="mt-8 border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="size-6 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
            <span className="text-sm font-semibold">Quera</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">
              Strona główna
            </Link>
            <Link
              to="/terms"
              className="hover:text-foreground transition-colors"
            >
              Regulamin
            </Link>
            <Link
              to="/privacy"
              className="hover:text-foreground transition-colors"
            >
              Prywatność
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Quera. Wszelkie prawa zastrzeżone.
          </p>
        </div>
      </footer>
    </div>
  );
}
