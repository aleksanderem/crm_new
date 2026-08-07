import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useConvexAuth } from "@convex-dev/react-query";
import { Route as DashboardRoute } from "@/routes/_app/_auth/dashboard/_layout.index";
import Logo from "@/assets/svg/logo";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to={DashboardRoute.fullPath} replace />;
  }

  return <LandingPage />;
}

function LandingPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <Features />
        <Modules />
        <PricingTeaser />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="size-8 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
          <span className="text-lg font-semibold">Quera</span>
        </Link>
        <nav className="hidden items-center gap-6 sm:flex">
          <Link to="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cennik
          </Link>
          <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Regulamin
          </Link>
          <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Prywatność
          </Link>
        </nav>
        <Link
          to="/login"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Zaloguj się
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Platforma dla polskich małych i średnich firm
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Jeden system.<br className="hidden sm:block" /> Cały Twój biznes.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Quera to modułowa platforma SaaS, która łączy CRM, zarządzanie gabinetem i więcej — w jednym miejscu, bez integracji, bez żonglowania kilkoma aplikacjami.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/login"
            className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Zacznij za darmo
          </Link>
          <Link
            to="/pricing"
            className="rounded-md border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Zobacz cennik
          </Link>
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: "🔗",
      title: "Wszystko w jednym miejscu",
      description: "Klienci, zespół, dokumenty, grafik — połączone w jeden spójny system. Koniec z eksportowaniem danych między aplikacjami.",
    },
    {
      icon: "🏢",
      title: "Wieloorganizacyjne konta",
      description: "Prowadzisz kilka firm lub oddziałów? Quera obsługuje wiele organizacji w ramach jednego konta użytkownika.",
    },
    {
      icon: "🔒",
      title: "Bezpieczeństwo i RODO",
      description: "Dane przechowywane w Polsce, szyfrowanie end-to-end, szczegółowy dziennik zdarzeń i zarządzanie uprawnieniami per rola.",
    },
    {
      icon: "📱",
      title: "Działa wszędzie",
      description: "Pełna funkcjonalność w przeglądarce — na komputerze, tablecie i telefonie. Bez instalacji.",
    },
    {
      icon: "⚡",
      title: "Natychmiastowe aktualizacje",
      description: "Zmiany w systemie są widoczne dla całego zespołu w czasie rzeczywistym. Zawsze aktualne dane.",
    },
    {
      icon: "🎯",
      title: "Modułowa budowa",
      description: "Płacisz tylko za to, czego używasz. Aktywuj moduły, które pasują do Twojego biznesu — kiedy chcesz.",
    },
  ];

  return (
    <section className="border-y border-border bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Platforma, która rośnie razem z Tobą</h2>
          <p className="mt-4 text-muted-foreground">Prosty w obsłudze. Potężny w działaniu.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="rounded-xl border border-border bg-card p-6">
              <div className="mb-3 text-2xl">{item.icon}</div>
              <h3 className="mb-2 font-semibold">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Modules() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto mb-12 max-w-xl text-center">
        <h2 className="text-3xl font-bold tracking-tight">Wybierz moduły dla swojego biznesu</h2>
        <p className="mt-4 text-muted-foreground">Każdy moduł to pełne rozwiązanie — bez kompromisów.</p>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ModuleCard
          tag="CRM"
          title="Zarządzanie sprzedażą i klientami"
          description="Kompletny CRM dla zespołów sprzedaży. Prowadź kontakty, firmy i szanse sprzedażowe przez cały lejek — od leada do wygranej oferty."
          features={[
            "Pipeline sprzedażowy (Kanban / lista)",
            "Kontakty i firmy z historią interakcji",
            "Poczta e-mail — inbox, wątki, Gmail sync",
            "Zadania, połączenia, notatki i dokumenty",
            "Import CSV, filtry, widoki niestandardowe",
            "Raportowanie i KPI w dashboardzie",
          ]}
          accent="bg-blue-500/10 text-blue-700 dark:text-blue-300"
        />
        <ModuleCard
          tag="Gabinet"
          title="Zarządzanie gabinetem i salonem"
          description="Kompletny system dla lekarzy, fizjoterapeutów, kosmetologów i salonów. Harmonogram, pacjenci, zabiegi i rozliczenia — wszystko pod ręką."
          features={[
            "Kalendarz wizyt dla wielu pracowników",
            "Kartoteka pacjentów / klientów",
            "Pakiety zabiegów i program lojalnościowy",
            "Dokumenty medyczne z e-podpisem",
            "Portal pacjenta — logowanie przez OTP",
            "Przypomnienia SMS i e-mail",
          ]}
          accent="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        />
      </div>
    </section>
  );
}

function ModuleCard({
  tag,
  title,
  description,
  features,
  accent,
}: {
  tag: string;
  title: string;
  description: string;
  features: string[];
  accent: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-8">
      <span className={`mb-4 inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold ${accent}`}>
        {tag}
      </span>
      <h3 className="mb-2 text-xl font-bold">{title}</h3>
      <p className="mb-6 text-sm text-muted-foreground">{description}</p>
      <ul className="mt-auto space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <span className="mt-0.5 text-primary">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/login"
        className="mt-8 rounded-md border border-border px-4 py-2 text-center text-sm font-medium hover:bg-muted transition-colors"
      >
        Wypróbuj za darmo →
      </Link>
    </div>
  );
}

function PricingTeaser() {
  return (
    <section className="border-y border-border bg-muted/40 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Przejrzysty cennik. Bez niespodzianek.</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          Zacznij za darmo — bez karty kredytowej. Płać tylko za aktywne moduły i skaluj w swoim tempie.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Bezpłatny plan", sublabel: "Na start — bez ograniczeń czasowych", highlight: false },
            { label: "Plan Pro (CRM)", sublabel: "Pełen CRM dla Twojego zespołu", highlight: true },
            { label: "Plan Pro (Gabinet)", sublabel: "Kompletny system dla gabinetu", highlight: false },
          ].map((p) => (
            <div
              key={p.label}
              className={`rounded-xl border px-6 py-5 text-left ${
                p.highlight
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              }`}
            >
              <p className={`font-semibold ${p.highlight ? "text-primary" : ""}`}>{p.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.sublabel}</p>
            </div>
          ))}
        </div>
        <Link
          to="/pricing"
          className="mt-8 inline-block rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Zobacz pełny cennik
        </Link>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Gotowy, żeby ogarnąć swój biznes?
      </h2>
      <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
        Dołącz do firm, które już korzystają z Query. Konfiguracja zajmuje mniej niż 5 minut.
      </p>
      <Link
        to="/login"
        className="mt-8 inline-block rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Zacznij za darmo — bez karty kredytowej
      </Link>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2">
          <Logo className="size-6 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
          <span className="text-sm font-semibold">Quera</span>
        </div>
        <div className="flex gap-6 text-sm text-muted-foreground">
          <Link to="/pricing" className="hover:text-foreground transition-colors">Cennik</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Regulamin</Link>
          <Link to="/privacy" className="hover:text-foreground transition-colors">Prywatność</Link>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Quera. Wszelkie prawa zastrzeżone.</p>
      </div>
    </footer>
  );
}
