import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            ← Powrót do logowania
          </Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold">Regulamin serwisu</h1>
        <p className="mb-8 text-sm text-muted-foreground">Ostatnia aktualizacja: sierpień 2025</p>

        <div className="prose prose-sm max-w-none text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-4 [&_p]:text-muted-foreground [&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-disc [&_li]:mb-1 [&_li]:text-muted-foreground">
          <h2>§1. Postanowienia ogólne</h2>
          <p>
            Niniejszy Regulamin określa zasady korzystania z platformy Quera (dalej: „Serwis"), dostępnej pod adresem internetowym wskazanym przez operatora. Operatorem Serwisu jest podmiot wskazany w sekcji kontaktowej (dalej: „Operator").
          </p>
          <p>
            Korzystanie z Serwisu jest równoznaczne z akceptacją niniejszego Regulaminu. W przypadku braku akceptacji postanowień Regulaminu, użytkownik powinien zaprzestać korzystania z Serwisu.
          </p>

          <h2>§2. Definicje</h2>
          <ul>
            <li><strong>Serwis</strong> – platforma Quera służąca do zarządzania działalnością biznesową.</li>
            <li><strong>Użytkownik</strong> – osoba fizyczna lub prawna korzystająca z Serwisu na podstawie zawartej umowy.</li>
            <li><strong>Organizacja</strong> – podmiot (firma, placówka, gabinet) zarejestrowany w Serwisie, w ramach którego działa Użytkownik.</li>
            <li><strong>Konto</strong> – indywidualny profil Użytkownika umożliwiający dostęp do Serwisu.</li>
            <li><strong>Dane</strong> – informacje przetwarzane przez Użytkownika w ramach korzystania z Serwisu.</li>
          </ul>

          <h2>§3. Rejestracja i konto użytkownika</h2>
          <p>
            Rejestracja w Serwisie wymaga podania adresu e-mail oraz zaakceptowania niniejszego Regulaminu i Polityki prywatności. Użytkownik zobowiązany jest do podania prawdziwych i aktualnych danych.
          </p>
          <p>
            Użytkownik odpowiada za zachowanie poufności swoich danych dostępowych (hasło, kody jednorazowe) i ponosi odpowiedzialność za wszystkie działania wykonywane za pośrednictwem jego Konta.
          </p>
          <p>
            Operator zastrzega sobie prawo do zawieszenia lub usunięcia Konta w przypadku naruszenia postanowień niniejszego Regulaminu.
          </p>

          <h2>§4. Zakres usług</h2>
          <p>
            Serwis udostępnia narzędzia do zarządzania relacjami z klientami (CRM), zarządzania gabinetem medycznym lub salonem, fakturowania, harmonogramowania wizyt oraz innych funkcji wspomagających prowadzenie działalności. Zakres dostępnych funkcji zależy od wybranego planu subskrypcji.
          </p>
          <p>
            Operator dokłada starań, aby Serwis był dostępny 24 godziny na dobę, 7 dni w tygodniu, nie gwarantuje jednak ciągłości dostępu i zastrzega sobie prawo do przerw technicznych.
          </p>

          <h2>§5. Opłaty i subskrypcje</h2>
          <p>
            Korzystanie z pełnego zakresu funkcji Serwisu wymaga wykupienia odpowiedniej subskrypcji zgodnie z aktualnym cennikiem dostępnym na stronie Serwisu. Opłaty pobierane są z góry za wybrany okres rozliczeniowy (miesięczny lub roczny).
          </p>
          <p>
            Operator zastrzega sobie prawo do zmiany cennika z zachowaniem 30-dniowego okresu wypowiedzenia. Zmiany cen nie wpływają na trwające okresy rozliczeniowe.
          </p>
          <p>
            Faktury za subskrypcję wystawiane są w formie elektronicznej i dostępne w panelu ustawień.
          </p>

          <h2>§6. Obowiązki użytkownika</h2>
          <p>Użytkownik zobowiązuje się w szczególności do:</p>
          <ul>
            <li>korzystania z Serwisu zgodnie z obowiązującym prawem i niniejszym Regulaminem,</li>
            <li>nieprzekazywania danych dostępowych osobom trzecim nieuprawnionym,</li>
            <li>nienaruszania praw osób trzecich, w szczególności praw własności intelektualnej,</li>
            <li>przetwarzania danych osobowych pacjentów/klientów zgodnie z przepisami RODO i innymi właściwymi przepisami,</li>
            <li>regularnego tworzenia kopii zapasowych danych istotnych dla swojej działalności.</li>
          </ul>

          <h2>§7. Dane i prywatność</h2>
          <p>
            Zasady przetwarzania danych osobowych Użytkowników oraz danych wprowadzanych do Serwisu zostały szczegółowo opisane w{" "}
            <Link to="/privacy" className="text-foreground underline hover:no-underline">Polityce prywatności</Link>.
          </p>
          <p>
            Operator przetwarza dane wprowadzane przez Użytkownika wyłącznie w celu świadczenia usług objętych Regulaminem. Dane nie są sprzedawane ani udostępniane podmiotom trzecim, z wyjątkiem podwykonawców technicznych niezbędnych do działania Serwisu (hosting, dostarczanie e-maili, przetwarzanie płatności).
          </p>

          <h2>§8. Odpowiedzialność</h2>
          <p>
            Operator nie ponosi odpowiedzialności za szkody wynikłe z nieprawidłowego korzystania z Serwisu przez Użytkownika, przerw w dostępie do Serwisu spowodowanych siłą wyższą lub awariami infrastruktury zewnętrznej, ani za utratę danych spowodowaną działaniami Użytkownika.
          </p>
          <p>
            Odpowiedzialność Operatora z tytułu niewykonania lub nienależytego wykonania umowy ograniczona jest do wysokości opłat uiszczonych przez Użytkownika w ostatnich 3 miesiącach.
          </p>

          <h2>§9. Własność intelektualna</h2>
          <p>
            Wszelkie prawa do Serwisu, jego oprogramowania, grafiki i treści należą do Operatora lub podmiotów, które udzieliły Operatorowi odpowiednich licencji. Użytkownik nie nabywa żadnych praw do Serwisu poza uprawnieniem do korzystania z niego w zakresie określonym Regulaminem.
          </p>

          <h2>§10. Rozwiązanie umowy</h2>
          <p>
            Użytkownik może w każdej chwili zrezygnować z subskrypcji i usunąć swoje Konto z Serwisu za pomocą opcji dostępnych w ustawieniach. Usunięcie Konta powoduje trwałe usunięcie danych po upływie okresu retencji wskazanego w Polityce prywatności.
          </p>
          <p>
            Operator może wypowiedzieć umowę z zachowaniem 30-dniowego okresu wypowiedzenia lub ze skutkiem natychmiastowym w przypadku rażącego naruszenia Regulaminu.
          </p>

          <h2>§11. Zmiany Regulaminu</h2>
          <p>
            Operator zastrzega sobie prawo do zmiany niniejszego Regulaminu. O istotnych zmianach Użytkownicy zostaną poinformowani drogą e-mail lub komunikatem w Serwisie z co najmniej 14-dniowym wyprzedzeniem. Kontynuowanie korzystania z Serwisu po wejściu zmian w życie oznacza ich akceptację.
          </p>

          <h2>§12. Postanowienia końcowe</h2>
          <p>
            W sprawach nieuregulowanych niniejszym Regulaminem zastosowanie mają przepisy prawa polskiego, w szczególności Kodeksu cywilnego oraz ustawy o świadczeniu usług drogą elektroniczną.
          </p>
          <p>
            Wszelkie spory wynikłe z Regulaminu strony będą starały się rozwiązać polubownie, a w przypadku braku porozumienia — właściwy będzie sąd powszechny w miejscu siedziby Operatora.
          </p>
          <p>
            W przypadku pytań dotyczących Regulaminu prosimy o kontakt pod adresem e-mail dostępnym na stronie Serwisu.
          </p>
        </div>
      </div>
    </div>
  );
}
