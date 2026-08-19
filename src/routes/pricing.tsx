import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Helmet } from "react-helmet-async";
import { api } from "@cvx/_generated/api";
import Logo from "@/assets/svg/logo";

function formatPln(amount: number): string {
  return `${Math.round(amount / 100)} zł`;
}

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

function PricingPage() {
  const pricingPlans = useQuery(api.app.getPublicPricingPlans);
  const crmProPrice = pricingPlans != null ? formatPln(pricingPlans.crm.monthPln) : "119 zł";
  const gabinetProPrice = pricingPlans != null ? formatPln(pricingPlans.gabinet.monthPln) : "199 zł";
  const crmProAnnualMonthly = pricingPlans != null ? formatPln(Math.round(pricingPlans.crm.yearPln / 12)) : null;
  const gabinetProAnnualMonthly = pricingPlans != null ? formatPln(Math.round(pricingPlans.gabinet.yearPln / 12)) : null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Helmet>
        <title>Cennik — Quera</title>
        <meta name="description" content="Przejrzysty cennik Quera. Zacznij za darmo bez karty kredytowej — płać tylko za aktywne moduły CRM i Gabinet i skaluj w swoim tempie." />
        <meta property="og:title" content="Cennik — Quera" />
        <meta property="og:description" content="Przejrzysty cennik Quera. Zacznij za darmo bez karty kredytowej — płać tylko za aktywne moduły CRM i Gabinet i skaluj w swoim tempie." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Cennik — Quera" />
        <meta name="twitter:description" content="Przejrzysty cennik Quera. Zacznij za darmo bez karty kredytowej — płać tylko za aktywne moduły CRM i Gabinet i skaluj w swoim tempie." />
      </Helmet>
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="size-8 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
            <span className="text-lg font-semibold">Quera</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
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

      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        {/* Hero */}
        <div className="mb-14 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Cennik</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Płacisz tylko za to, czego używasz. Zacznij za darmo, skaluj kiedy chcesz.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              ✓ Bez karty kredytowej
            </span>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              ✓ Anuluj w dowolnym momencie
            </span>
          </div>
        </div>

        {/* Platform plan */}
        <PlatformPricing />

        {/* Module pricing */}
        <div className="mt-16">
          <h2 className="mb-2 text-center text-2xl font-bold">Moduły biznesowe</h2>
          <p className="mb-10 text-center text-muted-foreground">
            Każdy moduł dostępny niezależnie — aktywujesz to, co potrzebujesz.
          </p>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <ModulePricingCard
              tag="CRM"
              tagClass="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              title="Moduł CRM"
              subtitle="Zarządzanie sprzedażą i klientami"
              plans={[
                {
                  name: "Free",
                  price: "0 zł",
                  interval: "",
                  description: "Na start — bez limitu czasu",
                  features: [
                    "Do 250 kontaktów",
                    "Do 1 pipeline'u sprzedażowego",
                    "Zadania i notatki",
                    "1 użytkownik",
                  ],
                  cta: "Zacznij za darmo",
                  highlight: false,
                },
                {
                  name: "Pro",
                  price: crmProPrice,
                  interval: "/ miesiąc",
                  description: "Pełen CRM dla całego zespołu",
                  features: [
                    "Nieograniczone kontakty i firmy",
                    "Dowolna liczba pipeline'ów",
                    "Poczta e-mail — inbox i Gmail sync",
                    "Import CSV, pola niestandardowe",
                    "Dokumenty z e-podpisem",
                    "Raporty i dashboard KPI",
                    "Do 10 użytkowników w planie*",
                  ],
                  cta: "Wypróbuj Pro",
                  highlight: true,
                },
              ]}
            />
            <ModulePricingCard
              tag="Gabinet"
              tagClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              title="Moduł Gabinet"
              subtitle="Zarządzanie gabinetem i salonem"
              plans={[
                {
                  name: "Free",
                  price: "0 zł",
                  interval: "",
                  description: "Na start — bez limitu czasu",
                  features: [
                    "Do 50 pacjentów / klientów",
                    "Kalendarz do 2 pracowników",
                    "Podstawowy cennik zabiegów",
                    "1 użytkownik",
                  ],
                  cta: "Zacznij za darmo",
                  highlight: false,
                },
                {
                  name: "Pro",
                  price: gabinetProPrice,
                  interval: "/ miesiąc",
                  description: "Kompletny system dla gabinetu",
                  features: [
                    "Nieograniczona kartoteka pacjentów",
                    "Kalendarz dla dowolnej liczby pracowników",
                    "Pakiety zabiegów i program lojalnościowy",
                    "Dokumenty medyczne z e-podpisem",
                    "Portal pacjenta (logowanie przez OTP)",
                    "Przypomnienia SMS i e-mail",
                    "Do 10 użytkowników w planie*",
                  ],
                  cta: "Wypróbuj Pro",
                  highlight: true,
                },
              ]}
            />
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            * Dodatkowych użytkowników można dokupić — skontaktuj się z nami.
            Ceny netto, do których doliczany jest VAT 23%.
          </p>
        </div>

        {/* Annual discount callout */}
        <div className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 px-8 py-8 text-center">
          <p className="text-lg font-semibold">Zaoszczędź do 20% przy płatności rocznej</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Przy wyborze planu rocznego naliczamy tylko 10 miesięcznych rat — 2 miesiące gratis.
          </p>
          {(crmProAnnualMonthly || gabinetProAnnualMonthly) && (
            <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-8">
              {crmProAnnualMonthly && (
                <div className="text-sm">
                  <span className="font-medium">CRM Pro:</span>{" "}
                  <span className="font-semibold text-primary">{crmProAnnualMonthly} / miesiąc</span>{" "}
                  <span className="text-muted-foreground">(zamiast {crmProPrice})</span>
                </div>
              )}
              {gabinetProAnnualMonthly && (
                <div className="text-sm">
                  <span className="font-medium">Gabinet Pro:</span>{" "}
                  <span className="font-semibold text-primary">{gabinetProAnnualMonthly} / miesiąc</span>{" "}
                  <span className="text-muted-foreground">(zamiast {gabinetProPrice})</span>
                </div>
              )}
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Opcja dostępna w ustawieniach konta po rejestracji.
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <h2 className="mb-8 text-center text-2xl font-bold">Często zadawane pytania</h2>
          <div className="mx-auto max-w-3xl divide-y divide-border">
            {FAQ.map((item) => (
              <div key={item.q} className="py-5">
                <p className="font-medium">{item.q}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-20 text-center">
          <p className="text-xl font-semibold">Masz pytania? Chętnie pomożemy.</p>
          <p className="mt-2 text-muted-foreground">
            Napisz do nas — pomożemy dopasować plan do Twojego biznesu.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-md bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Zacznij za darmo
          </Link>
        </div>
      </main>

      <footer className="mt-16 border-t border-border bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="size-6 [&_rect]:fill-card [&_rect:first-child]:fill-primary [&_path]:stroke-primary-foreground [&_line]:stroke-primary-foreground" />
            <span className="text-sm font-semibold">Quera</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground transition-colors">Strona główna</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Regulamin</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Prywatność</Link>
            <Link to="/status" className="hover:text-foreground transition-colors">Status</Link>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Quera. Wszelkie prawa zastrzeżone.</p>
        </div>
      </footer>
    </div>
  );
}

function PlatformPricing() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Platforma
          </span>
          <h2 className="mt-3 text-xl font-bold">Konto Quera</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dostęp do platformy, zarządzanie organizacją, użytkownikami, RBAC, powiadomieniami i dziennikiem audytu — zawsze bezpłatny.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-4 text-center dark:border-emerald-800 dark:bg-emerald-950/40">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">0 zł</p>
          <p className="text-xs text-muted-foreground">na zawsze</p>
        </div>
      </div>
      <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          "Nieograniczone organizacje",
          "Zarządzanie zespołem i rolami (RBAC)",
          "Powiadomienia w aplikacji",
          "Dziennik zdarzeń (audit log)",
          "Integracja Stripe — rozliczenia w panelu",
          "Obsługa ciemnego motywu i języka PL/EN",
        ].map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm">
            <span className="text-primary">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModulePricingCard({
  tag,
  tagClass,
  title,
  subtitle,
  plans,
}: {
  tag: string;
  tagClass: string;
  title: string;
  subtitle: string;
  plans: {
    name: string;
    price: string;
    interval: string;
    description: string;
    features: string[];
    cta: string;
    highlight: boolean;
  }[];
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-6 py-5">
        <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${tagClass}`}>
          {tag}
        </span>
        <h3 className="mt-2 text-lg font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="grid flex-1 grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col p-6 ${plan.highlight ? "bg-primary/5" : ""}`}
          >
            <p className="text-sm font-medium text-muted-foreground">{plan.name}</p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold">{plan.price}</span>
              {plan.interval && (
                <span className="text-sm text-muted-foreground">{plan.interval}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
            <ul className="mt-5 flex-1 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <span className={`mt-0.5 ${plan.highlight ? "text-primary" : "text-muted-foreground"}`}>
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/login"
              className={`mt-6 rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
                plan.highlight
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border hover:bg-muted"
              }`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: "Czy mogę korzystać z Quera bezpłatnie?",
    a: "Tak. Bezpłatny plan nie ma limitu czasu — możesz z niego korzystać tak długo, jak chcesz. Plan Free ma ograniczenia co do liczby kontaktów i użytkowników, ale idealnie nadaje się na start.",
  },
  {
    q: "Czy mogę aktywować oba moduły jednocześnie?",
    a: "Tak. Możesz aktywować moduł CRM i Gabinet niezależnie — płacisz osobno za każdy. W ramach jednej organizacji możesz korzystać z obu modułów równocześnie.",
  },
  {
    q: "Jak wygląda rozliczenie roczne?",
    a: "Przy wyborze planu rocznego pobieramy opłatę za 10 miesięcy — 2 miesiące masz gratis. Faktura wystawiana jest jednorazowo na początku okresu rozliczeniowego.",
  },
  {
    q: "Czy mogę zmienić lub anulować plan w dowolnym momencie?",
    a: "Tak. Plan możesz zmienić lub anulować w dowolnym momencie przez panel Ustawienia → Rozliczenia. Przy anulowaniu planu masz dostęp do funkcji Pro do końca opłaconego okresu.",
  },
  {
    q: "Co się stanie z moimi danymi po rezygnacji?",
    a: "Dane pozostają dostępne w trybie odczytu przez 30 dni po wygaśnięciu subskrypcji. Po tym czasie masz możliwość ich eksportu lub trwałego usunięcia.",
  },
  {
    q: "Czy Quera obsługuje faktury VAT?",
    a: "Tak. Faktury za subskrypcję wystawiane są w formie elektronicznej i dostępne w panelu Ustawienia → Rozliczenia. Ceny na tej stronie są cenami netto — do transakcji doliczamy VAT 23%.",
  },
];
