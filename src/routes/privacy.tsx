import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-8">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
            ← Powrót do logowania
          </Link>
        </div>

        <h1 className="mb-2 text-3xl font-bold">Polityka prywatności</h1>
        <p className="mb-8 text-sm text-muted-foreground">Ostatnia aktualizacja: sierpień 2025</p>

        <div className="prose prose-sm max-w-none text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-4 [&_p]:text-muted-foreground [&_ul]:mb-4 [&_ul]:ml-6 [&_ul]:list-disc [&_li]:mb-1 [&_li]:text-muted-foreground">
          <h2>1. Administrator danych osobowych</h2>
          <p>
            Administratorem danych osobowych przetwarzanych w ramach Serwisu Quera jest podmiot wskazany w ustawieniach organizacji (dalej: „Administrator"). W przypadku pytań dotyczących przetwarzania danych prosimy o kontakt pod adresem e-mail wskazanym w ustawieniach konta.
          </p>

          <h2>2. Jakie dane zbieramy</h2>
          <p>W ramach korzystania z Serwisu przetwarzamy następujące kategorie danych:</p>
          <ul>
            <li><strong>Dane konta:</strong> adres e-mail, imię i nazwisko, numer telefonu (opcjonalnie).</li>
            <li><strong>Dane organizacji:</strong> nazwa firmy, NIP, adres, dane kontaktowe.</li>
            <li><strong>Dane klientów/pacjentów:</strong> dane wprowadzane przez Użytkownika w ramach modułu CRM lub Gabinet (imię, nazwisko, dane kontaktowe, historia wizyt, dokumentacja medyczna).</li>
            <li><strong>Dane techniczne:</strong> adres IP, przeglądarka, system operacyjny, czas i sposób korzystania z Serwisu (logi, analytics).</li>
            <li><strong>Dane płatności:</strong> historia transakcji, dane do faktury (przetwarzane przez operatora płatności Stripe).</li>
          </ul>

          <h2>3. Cel i podstawa prawna przetwarzania</h2>
          <p>Dane osobowe przetwarzamy w następujących celach:</p>
          <ul>
            <li><strong>Świadczenie usług</strong> – art. 6 ust. 1 lit. b RODO (wykonanie umowy).</li>
            <li><strong>Obsługa konta i kontakt z Użytkownikiem</strong> – art. 6 ust. 1 lit. b RODO.</li>
            <li><strong>Rozliczenia i wystawianie faktur</strong> – art. 6 ust. 1 lit. c RODO (obowiązek prawny).</li>
            <li><strong>Bezpieczeństwo Serwisu i zapobieganie nadużyciom</strong> – art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes).</li>
            <li><strong>Marketing własnych usług</strong> – art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes) lub zgoda, jeśli wymagana.</li>
          </ul>

          <h2>4. Dane klientów/pacjentów przetwarzane przez Użytkownika (RODO: powierzenie)</h2>
          <p>
            Użytkownik korzystający z modułów CRM lub Gabinet jest administratorem danych osobowych swoich klientów lub pacjentów i przetwarza je za pomocą narzędzi Serwisu. W tym zakresie Operator pełni rolę podmiotu przetwarzającego (procesora) i przetwarza te dane wyłącznie na udokumentowane polecenie Użytkownika, zgodnie z zawartą umową powierzenia przetwarzania danych.
          </p>
          <p>
            Użytkownik jest odpowiedzialny za zapewnienie odpowiedniej podstawy prawnej przetwarzania danych swoich klientów/pacjentów, w tym uzyskania wymaganych zgód na przetwarzanie danych medycznych (art. 9 RODO).
          </p>

          <h2>5. Odbiorcy danych</h2>
          <p>Dane mogą być przekazywane następującym kategoriom odbiorców:</p>
          <ul>
            <li><strong>Dostawcy infrastruktury chmurowej</strong> – hosting, bazy danych (m.in. Supabase, Convex).</li>
            <li><strong>Operator płatności</strong> – Stripe Inc. (przetwarzanie płatności).</li>
            <li><strong>Dostawca usług e-mail</strong> – Resend, Gmail API (wysyłka wiadomości).</li>
            <li><strong>Narzędzia analityczne i monitoringowe</strong> – Sentry (monitorowanie błędów).</li>
          </ul>
          <p>
            Część podwykonawców może znajdować się poza Europejskim Obszarem Gospodarczym. W takich przypadkach transfer danych odbywa się na podstawie standardowych klauzul umownych zatwierdzonych przez Komisję Europejską.
          </p>

          <h2>6. Pliki cookie</h2>
          <p>
            Serwis korzysta z plików cookie (ciasteczek) i podobnych technologii w celu zapewnienia prawidłowego działania, zapamiętywania preferencji Użytkownika oraz analizy ruchu.
          </p>
          <p>Stosujemy następujące kategorie plików cookie:</p>
          <ul>
            <li><strong>Niezbędne:</strong> wymagane do prawidłowego działania Serwisu (sesja użytkownika, autoryzacja). Nie wymagają zgody.</li>
            <li><strong>Funkcjonalne:</strong> zapamiętują Twoje preferencje (język, motyw). Wymagają zgody.</li>
            <li><strong>Analityczne:</strong> pomagają nam zrozumieć, jak korzystasz z Serwisu. Wymagają zgody.</li>
          </ul>
          <p>
            Możesz zarządzać plikami cookie za pomocą ustawień przeglądarki lub korzystając z panelu zgód w stopce Serwisu.
          </p>

          <h2>7. Okres przechowywania danych</h2>
          <ul>
            <li>Dane konta: przez czas trwania umowy, a następnie do 5 lat (obowiązki podatkowe/prawne).</li>
            <li>Dane klientów/pacjentów: przez czas wskazany przez Użytkownika jako administratora, nie dłużej niż 10 lat od zakończenia świadczenia usług medycznych (wymogi prawne dla dokumentacji medycznej).</li>
            <li>Logi techniczne: do 12 miesięcy.</li>
            <li>Dane płatności: do 7 lat (obowiązki podatkowe).</li>
          </ul>

          <h2>8. Twoje prawa</h2>
          <p>W związku z przetwarzaniem danych osobowych przysługują Ci następujące prawa:</p>
          <ul>
            <li><strong>Prawo dostępu</strong> – możesz uzyskać informację o przetwarzanych przez nas danych.</li>
            <li><strong>Prawo do sprostowania</strong> – możesz poprawić nieprawidłowe dane.</li>
            <li><strong>Prawo do usunięcia</strong> – możesz żądać usunięcia danych (z zastrzeżeniem obowiązków prawnych).</li>
            <li><strong>Prawo do ograniczenia przetwarzania</strong> – możesz żądać ograniczenia przetwarzania w określonych przypadkach.</li>
            <li><strong>Prawo do przenoszenia danych</strong> – możesz otrzymać swoje dane w ustrukturyzowanym formacie.</li>
            <li><strong>Prawo do sprzeciwu</strong> – możesz sprzeciwić się przetwarzaniu na podstawie prawnie uzasadnionego interesu.</li>
            <li><strong>Prawo do cofnięcia zgody</strong> – jeśli przetwarzanie opiera się na zgodzie, możesz ją wycofać w dowolnym momencie.</li>
          </ul>
          <p>
            Aby skorzystać z powyższych praw, skontaktuj się z nami pod adresem e-mail wskazanym w ustawieniach konta. Masz również prawo do wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych (UODO).
          </p>

          <h2>9. Bezpieczeństwo danych</h2>
          <p>
            Stosujemy odpowiednie środki techniczne i organizacyjne w celu ochrony danych przed nieuprawnionym dostępem, utratą lub zniszczeniem, w tym szyfrowanie transmisji (TLS/HTTPS), kontrolę dostępu opartą na rolach oraz regularne kopie zapasowe.
          </p>

          <h2>10. Zmiany Polityki prywatności</h2>
          <p>
            Operator zastrzega sobie prawo do zmiany niniejszej Polityki prywatności. O istotnych zmianach Użytkownicy zostaną poinformowani drogą e-mail lub komunikatem w Serwisie. Aktualna wersja Polityki prywatności jest zawsze dostępna pod adresem{" "}
            <Link to="/privacy" className="text-foreground underline hover:no-underline">/privacy</Link>.
          </p>

          <h2>11. Kontakt</h2>
          <p>
            W przypadku pytań dotyczących przetwarzania danych osobowych lub realizacji praw prosimy o kontakt pod adresem e-mail dostępnym w ustawieniach Serwisu lub na stronie głównej.
          </p>

          <p className="mt-8 border-t pt-4">
            Powiązane dokumenty:{" "}
            <Link to="/terms" className="text-foreground underline hover:no-underline">Regulamin serwisu</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
